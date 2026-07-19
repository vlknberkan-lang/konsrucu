'use server'

/**
 * KonsRücü — Hugo tevdiye Excel'i içe aktarma · server action
 * app/(app)/akilli-giris/iceri-aktar/actions.ts
 *
 * Akış: yüklenen .xls/.xlsx → lib/import/hugo (saf parse) → `hukukDosyaNo` ile UPSERT.
 *  - Yeni       → RucuDosyasi (durum=HAVUZDA, hugodanCekildi=false, aktif tenant).
 *  - Mevcut     → ATLA (mevcut dosya asla ezilmez) + FARK RAPORU: Excel'de düzeltilen
 *    zamanaşımı/tutar/durum sistemde eski kalmasın diye farklar listelenir; avukat onayıyla
 *    (importFarkUygula) uygulanır. Sessiz sapma yok — özellikle zamanasimi kritik.
 *  - FORMAT KAPISI: parser Zurich/Hugo biçimini tanır; aktif tenant ile uyuşmuyorsa
 *    (ör. Zurich listesi Ray seçiliyken) import DURUR — yanlış şirkete yazım engellenir.
 *  - Hatalı satır tüm partiyi düşürmez; raporlanır. Yazma tek transaction'da atomiktir.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma, DosyaDurum, Brans } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { hugoCozumle, kanonik, type ImportSonuc } from '@/lib/import/hugo'
import { dosyaLimitKontrol } from '@/lib/konsrucu/ai-kredi'
import { tarihTR } from '@/lib/konsrucu/format'

/** Tekrar import'ta tespit edilen, avukat onayı bekleyen alan farkı. */
export type ImportFark = {
  dosyaId: string
  hukukDosyaNo: string
  alan: 'zamanasimi' | 'rucuTutari' | 'hugoDurum'
  etiket: string
  eski: string | null // gösterim
  yeni: string // gösterim
  yeniDeger: string // uygulanacak ham değer (ISO tarih / sayı / metin)
}

export type IceriAktarSonuc = ImportSonuc & { farklar?: ImportFark[]; fazlaFark?: number }

const FARK_MAX = 200 // panelde gösterilecek azami fark; fazlası SAYIYLA raporlanır (sessiz kırpma yok)

/** Zurich "Hasar Branş" metni → Brans enum. KASKO/ZMMS dışı (Yangın, Konut…) → OTO_DISI. */
function bransEnum(s: string | null): Brans | null {
  const k = kanonik(s)
  if (!k) return null
  if (k.includes('kasko')) return Brans.KASKO
  if (k.includes('zmms') || k.includes('zmm') || k.includes('trafik') || k.includes('zorunlu')) return Brans.ZMMS
  return Brans.OTO_DISI
}

/** Giriş yapan kullanıcı + aktif (tenant) müşteri id'si. */
async function ctx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const dbUser = await prisma.kullanici.findUnique({
    where: { id: user.id },
    include: { musteriler: true },
  })
  if (!dbUser) redirect('/login')
  const izinli = dbUser.musteriler.map((m) => m.musteriId)
  const aktifId = cookies().get('aktif_musteri')?.value
  const musteriId = aktifId && izinli.includes(aktifId) ? aktifId : (izinli[0] ?? null)
  return { dbUser, musteriId }
}

const boslukSonuc = (hatalar: ImportSonuc['hatalar']): ImportSonuc => ({
  toplam: hatalar.length, eklenen: 0, atlanan: 0, hatali: hatalar.length, baslikSatiri: null, eslesenKolon: 0, hatalar,
})

export async function hugoIceriAktar(formData: FormData): Promise<IceriAktarSonuc> {
  const { dbUser, musteriId } = await ctx()
  if (!musteriId) redirect('/dashboard')

  const file = formData.get('dosya')
  if (!(file instanceof File) || file.size === 0) {
    return boslukSonuc([{ satir: 0, sebep: 'Dosya alınamadı' }])
  }
  const adLower = file.name.toLowerCase()
  if (!adLower.endsWith('.xls') && !adLower.endsWith('.xlsx')) {
    return boslukSonuc([{ satir: 0, sebep: 'Yalnız .xls / .xlsx desteklenir' }])
  }

  const { satirlar, hatalar, baslikSatiri, eslesenKolon } = hugoCozumle(Buffer.from(await file.arrayBuffer()))
  const toplam = satirlar.length + hatalar.length

  if (satirlar.length === 0) {
    return { toplam, eklenen: 0, atlanan: 0, hatali: hatalar.length, baslikSatiri, eslesenKolon, hatalar }
  }

  // Kaynak biçimi: satırların damgasına göre Hugo / Zurich.
  const excelFormat = satirlar[0]?.kaynak.kaynak === 'zurich' ? 'zurich' : 'hugo'
  const kaynakAd = excelFormat === 'zurich' ? 'Zurich' : 'Hugo'

  // FORMAT-TENANT KAPISI: Zurich listesi yalnız adı "Zurich" içeren tenant'a, Hugo listesi diğerine
  // yazılabilir — aktif şirket yanlışsa import DURUR (yüzlerce dosya yanlış şirkete açılmasın).
  const musteri = await prisma.musteri.findUnique({ where: { id: musteriId }, select: { ad: true } })
  const tenantZurichMi = (musteri?.ad ?? '').toLocaleLowerCase('tr').includes('zurich')
  if (excelFormat === 'zurich' && !tenantZurichMi) {
    return boslukSonuc([{ satir: 0, sebep: `Bu Excel ZURICH biçiminde ama aktif şirket "${musteri?.ad ?? '?'}". Üst menüden Zurich'i seçip tekrar deneyin — hiçbir satır yazılmadı.` }])
  }
  if (excelFormat === 'hugo' && tenantZurichMi) {
    return boslukSonuc([{ satir: 0, sebep: `Bu Excel HUGO (Ray) biçiminde ama aktif şirket "${musteri?.ad ?? '?'}". Üst menüden Ray Sigorta'yı seçip tekrar deneyin — hiçbir satır yazılmadı.` }])
  }

  // Mevcut dosyaları tek sorguda bul (tenant kapsamı) → ezme, atla; ama FARKLARI raporla.
  const mevcut = await prisma.rucuDosyasi.findMany({
    where: { musteriId, hukukDosyaNo: { in: satirlar.map((s) => s.hukukDosyaNo) } },
    select: { id: true, hukukDosyaNo: true, zamanasimi: true, rucuTutari: true, hugoDurum: true },
  })
  const mevcutMap = new Map(mevcut.map((m) => [m.hukukDosyaNo, m]))
  const yeniler = satirlar.filter((s) => !mevcutMap.has(s.hukukDosyaNo))
  const atlanan = satirlar.length - yeniler.length

  // FARK RAPORU (atlanan satırlar): Excel'de düzeltilmiş zamanasimi/rucuTutari/hugoDurum sistemde
  // eski kalmasın. Yalnız Excel'de DOLU olan değerler önerilir (boş değer mevcutu silmeyi önermez).
  const tumFarklar: ImportFark[] = []
  for (const s of satirlar) {
    const m = mevcutMap.get(s.hukukDosyaNo)
    if (!m) continue
    if (s.zamanasimi) {
      const eskiGun = m.zamanasimi ? m.zamanasimi.toISOString().slice(0, 10) : null
      const yeniGun = s.zamanasimi.toISOString().slice(0, 10)
      if (eskiGun !== yeniGun) {
        tumFarklar.push({ dosyaId: m.id, hukukDosyaNo: s.hukukDosyaNo, alan: 'zamanasimi', etiket: 'Zamanaşımı', eski: m.zamanasimi ? tarihTR(m.zamanasimi) : null, yeni: tarihTR(s.zamanasimi), yeniDeger: yeniGun })
      }
    }
    if (s.rucuTutari != null) {
      const eskiN = m.rucuTutari != null ? Number(m.rucuTutari) : null
      if (eskiN == null || Math.abs(eskiN - s.rucuTutari) > 0.005) {
        tumFarklar.push({ dosyaId: m.id, hukukDosyaNo: s.hukukDosyaNo, alan: 'rucuTutari', etiket: 'Rücu tutarı', eski: eskiN != null ? eskiN.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺' : null, yeni: s.rucuTutari.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺', yeniDeger: String(s.rucuTutari) })
      }
    }
    if (s.hugoDurum && s.hugoDurum.trim() && s.hugoDurum.trim() !== (m.hugoDurum ?? '').trim()) {
      tumFarklar.push({ dosyaId: m.id, hukukDosyaNo: s.hukukDosyaNo, alan: 'hugoDurum', etiket: `${kaynakAd} durumu`, eski: m.hugoDurum, yeni: s.hugoDurum.trim(), yeniDeger: s.hugoDurum.trim().slice(0, 200) })
    }
  }
  const farklar = tumFarklar.slice(0, FARK_MAX)
  const fazlaFark = tumFarklar.length - farklar.length

  let eklenen = 0
  if (yeniler.length > 0) {
    const veriler: Prisma.RucuDosyasiCreateManyInput[] = yeniler.map((s) => ({
      musteriId,
      durum: DosyaDurum.HAVUZDA,
      hugodanCekildi: false,
      hukukDosyaNo: s.hukukDosyaNo,
      gonderenBirim: s.gonderenBirim,
      hasarDosyaNo: s.hasarDosyaNo,
      hasarTarihi: s.hasarTarihi,
      zamanasimi: s.zamanasimi,
      rucuSebebi: s.rucuSebebi,
      rucuOrani: s.rucuOrani,
      rucuTutari: s.rucuTutari != null ? new Prisma.Decimal(s.rucuTutari) : null,
      davaMiktari: s.davaMiktari != null ? new Prisma.Decimal(s.davaMiktari) : null,
      kadroluAvukat: s.kadroluAvukat,
      sozlesmeliAvukat: s.sozlesmeliAvukat,
      islemYapanYrd: s.islemYapanYrd,
      atanmaTarihi: s.atanmaTarihi,
      bitisTarihi: s.bitisTarihi,
      hugoDurum: s.hugoDurum,
      // Zurich listesinde hazır gelen yapısal alanlar (Hugo'da null → mevcut davranış değişmez).
      brans: bransEnum(s.brans),
      sigortaliUnvan: s.sigortaliUnvan,
      kazaYeri: s.kazaYeri,
      il: s.il,
      faizBaslangic: s.faizBaslangic,
      kaynakJson: s.kaynak as unknown as Prisma.InputJsonValue,
    }))

    // FREE plan dosya limiti — createMany'den ÖNCE (limiti aşacak import hiç başlamaz).
    await dosyaLimitKontrol(musteriId, veriler.length)

    try {
      // Atomik: createMany + denetim kaydı aynı transaction'da.
      // skipDuplicates: DB'deki @@unique([musteriId, hukukDosyaNo]) ile birlikte çift tık /
      // eşzamanlı import yarışında mükerrer dosyayı DB seviyesinde engeller.
      const [, sonuc] = await prisma.$transaction([
        prisma.aktivite.create({
          data: {
            kullaniciId: dbUser.id,
            eylem: `${kaynakAd} Excel içe aktarıldı: ${yeniler.length} yeni · ${atlanan} mevcut · ${hatalar.length} hatalı — ${file.name}`,
            detayJson: {
              kaynak: kaynakAd.toLowerCase(), dosyaAdi: file.name, eklenen: yeniler.length, atlanan, hatali: hatalar.length,
            } as Prisma.InputJsonValue,
          },
        }),
        prisma.rucuDosyasi.createMany({ data: veriler, skipDuplicates: true }),
      ])
      eklenen = sonuc.count
    } catch (e) {
      // Tüm parti geri alındı (atomik). Satırları "hatalı" raporla, mevcutlar yine de atlanmıştı.
      return {
        toplam, eklenen: 0, atlanan, hatali: hatalar.length + yeniler.length, baslikSatiri, eslesenKolon,
        hatalar: [...hatalar, { satir: 0, sebep: `Kayıt yazılamadı, parti geri alındı: ${(e as Error).message}` }],
      }
    }
  }

  revalidatePath('/akilli-giris')
  return { toplam, eklenen, atlanan, hatali: hatalar.length, baslikSatiri, eslesenKolon, hatalar, farklar, fazlaFark }
}

/**
 * Fark raporundan SEÇİLEN güncellemeleri uygula (avukat onayı sonrası).
 * "Mevcut ezilmez" ilkesinin tek istisnası budur ve açık onaya bağlıdır; her dosyaya Aktivite yazılır.
 */
export async function importFarkUygula(secilen: { dosyaId: string; alan: string; yeniDeger: string }[]): Promise<{ ok: boolean; uygulanan: number; error?: string }> {
  const { dbUser, musteriId } = await ctx()
  if (!musteriId) return { ok: false, uygulanan: 0, error: 'Aktif müşteri seçili değil' }
  const temiz = (Array.isArray(secilen) ? secilen : []).filter((f) => f && ['zamanasimi', 'rucuTutari', 'hugoDurum'].includes(f.alan)).slice(0, FARK_MAX)
  if (!temiz.length) return { ok: false, uygulanan: 0, error: 'Uygulanacak fark seçilmedi' }

  // tenant kapsaması: yalnız aktif müşterinin dosyaları
  const ids = [...new Set(temiz.map((f) => f.dosyaId))]
  const sahipler = await prisma.rucuDosyasi.findMany({ where: { id: { in: ids }, musteriId }, select: { id: true, hukukDosyaNo: true } })
  const sahipMap = new Map(sahipler.map((d) => [d.id, d.hukukDosyaNo]))

  // dosya başına alanları grupla → tek update
  const dosyaData = new Map<string, { data: Prisma.RucuDosyasiUpdateInput; ozet: string[] }>()
  for (const f of temiz) {
    if (!sahipMap.has(f.dosyaId)) continue
    const g = dosyaData.get(f.dosyaId) ?? { data: {}, ozet: [] }
    if (f.alan === 'zamanasimi') {
      const d = new Date(f.yeniDeger)
      if (Number.isNaN(d.getTime())) continue
      g.data.zamanasimi = d
      g.ozet.push(`zamanaşımı → ${tarihTR(d)}`)
    } else if (f.alan === 'rucuTutari') {
      const n = Number(f.yeniDeger)
      if (!Number.isFinite(n) || n < 0 || n >= 1e12) continue
      g.data.rucuTutari = new Prisma.Decimal(Math.round(n * 100) / 100)
      g.ozet.push(`rücu tutarı → ${n.toLocaleString('tr-TR')} ₺`)
    } else {
      g.data.hugoDurum = f.yeniDeger.slice(0, 200)
      g.ozet.push(`kaynak durumu → ${f.yeniDeger.slice(0, 60)}`)
    }
    dosyaData.set(f.dosyaId, g)
  }
  if (!dosyaData.size) return { ok: false, uygulanan: 0, error: 'Seçilen farklar bu şirketin dosyalarıyla eşleşmedi' }

  let uygulanan = 0
  for (const [dosyaId, g] of dosyaData) {
    await prisma.$transaction([
      prisma.rucuDosyasi.update({ where: { id: dosyaId }, data: g.data }),
      prisma.aktivite.create({ data: { dosyaId, kullaniciId: dbUser.id, eylem: `Import fark güncellemesi (onaylı): ${g.ozet.join(' · ')}` } }),
    ])
    uygulanan += g.ozet.length
  }
  revalidatePath('/akilli-giris')
  revalidatePath('/atanan-dosyalar')
  return { ok: true, uygulanan }
}
