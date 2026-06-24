'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma, BelgeKategori, DosyaDurum, Yol, Brans, BorcluRol, TeyitDurum, CiktiTip } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { prisma } from '@/lib/prisma'
import { analizEt } from '@/lib/konsrucu/analiz'
import { takipOlayKaydet } from '@/lib/konsrucu/takip-olay'
import { faizHesapla, oranlariOku, sonDekontTarihi, type DekontGirdi } from '@/lib/konsrucu/faiz'
import { yetkiliIcraOner } from '@/lib/konsrucu/adli-rehber'
import { aciklamaUret } from '@/lib/konsrucu/takip'
import { takipXmlUret, type TakipXmlGirdi } from '@/lib/konsrucu/uyap-etakip/xml'
import { kanonik, paraTR, tarihTR } from '@/lib/import/hugo'
import { dilekceMetni, type DilekceGirdi } from '@/lib/konsrucu/dilekce'
import { dilekceAnlatim } from '@/lib/konsrucu/dilekce-ai'
import { taksitProgrami } from '@/lib/konsrucu/taksit'

type DosyaPayload = {
  hasarNo?: string
  metin?: string
  alanlar: { plaka: string[]; tc: string[]; tarih: string[]; tutar: string[]; iban: string[] }
  dosyalar: { name: string; kind: 'pdf' | 'belge' | 'foto' | 'diger'; w?: number; h?: number; exifDate?: string; kamera?: string; textLen?: number }[]
}

const yolDb = (y?: string): Yol | null => (y === 'klasik' ? Yol.KLASIK : y === 'idari' ? Yol.IDARI : y === 'belirsiz' ? Yol.BELIRSIZ : null)
const bransDb = (b?: string): Brans | null => (b === 'KASKO' ? Brans.KASKO : b === 'ZMMS' ? Brans.ZMMS : b === 'OTO_DISI' ? Brans.OTO_DISI : null)
const rolDb = (r?: string): BorcluRol => (r && r in BorcluRol ? (r as BorcluRol) : BorcluRol.DIGER)
const teyitDb = (t?: string): TeyitDurum => (t && t in TeyitDurum ? (t as TeyitDurum) : TeyitDurum.TEYIT_GEREK)

/** LLM'den gelen tutarı güvenle Decimal'e çevir (sayı/string/biçimli gelebilir; bozuksa null). */
function guvenliDecimal(v: unknown): Prisma.Decimal | null {
  if (v == null) return null
  let n: number
  if (typeof v === 'number') n = v
  else {
    const s = String(v).replace(/[^\d.,-]/g, '')
    if (!s) return null
    // TR biçimi: virgül ondalık + nokta binlik → normalize
    const norm = s.includes(',') && s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
    n = Number(norm)
  }
  return Number.isFinite(n) && Math.abs(n) < 1e12 ? new Prisma.Decimal(Math.round(n * 100) / 100) : null
}

/** LLM dekontlarını Odeme create-data'sına çevir; geçersiz tutarı ele, tarih bozuksa null. */
function dekontlardanOdemeler(dekontlar: { tarih?: string; tutar?: number; ekspertizMi?: boolean; aciklama?: string }[] | undefined) {
  if (!Array.isArray(dekontlar)) return []
  return dekontlar
    .map((d) => {
      const tutar = guvenliDecimal(d.tutar)
      if (!tutar) return null
      const t = d.tarih ? new Date(d.tarih) : null
      const tarih = t && !Number.isNaN(t.getTime()) ? t : null
      return { tutar, tarih, haricMi: !!d.ekspertizMi, aciklama: (d.aciklama ?? '').trim().slice(0, 200) || null }
    })
    .filter((x): x is { tutar: Prisma.Decimal; tarih: Date | null; haricMi: boolean; aciklama: string | null } => !!x)
}

/** Ekspertiz hariç en geç dekont tarihi = faiz başlangıcı. */
function sonDekontTarihiOdeme(odemeler: { tarih: Date | null; haricMi: boolean }[]): Date | null {
  const t = odemeler.filter((o) => !o.haricMi && o.tarih).map((o) => (o.tarih as Date).getTime())
  return t.length ? new Date(Math.max(...t)) : null
}

/** Giriş yapan kullanıcı + erişebildiği müşteri id'leri. */
async function ctx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const dbUser = await prisma.kullanici.findUnique({
    where: { id: user.id },
    include: { musteriler: true },
  })
  if (!dbUser) redirect('/login')
  return { dbUser, izinli: dbUser.musteriler.map((m) => m.musteriId) }
}

/** İşlenen yığını GERÇEK bir rücu dosyası olarak açar (RucuDosyasi + Belge + cikarimJson). */
export async function dosyaOlustur(payload: DosyaPayload): Promise<{ id: string }> {
  const { dbUser, izinli } = await ctx()
  const aktifId = cookies().get('aktif_musteri')?.value
  const musteriId = aktifId && izinli.includes(aktifId) ? aktifId : izinli[0]
  if (!musteriId) redirect('/dashboard')

  // Katman 3 — LLM asistanı: belge metninden triyaj + borçlular + açıklama + teyit
  const ayarlar = await prisma.ayarlar.findUnique({ where: { musteriId }, select: { aciklamaFooter: true } })
  const analiz = payload.metin ? await analizEt(payload.metin, ayarlar?.aciklamaFooter ?? undefined) : null

  const durum: DosyaDurum = analiz ? (analiz.yol === 'idari' ? DosyaDurum.IDARI_YOL : DosyaDurum.INCELENIYOR) : DosyaDurum.INCELENIYOR
  const yeniOdemeler = dekontlardanOdemeler(analiz?.dekontlar)
  const faizBas = sonDekontTarihiOdeme(yeniOdemeler)
  const icraOneri = analiz ? yetkiliIcraOner(analiz.kazaYeri || analiz.il, analiz.il) : null

  const cikarim = {
    alanlar: payload.alanlar,
    aciklama: analiz?.aciklama ?? null,
    teyit: analiz?.teyit ?? [],
    llm: analiz
      ? { brans: analiz.brans, kazaYeri: analiz.kazaYeri, asilAlacak: analiz.asilAlacak, yetkiliIcra: analiz.yetkiliIcra }
      : null,
  }

  const dosya = await prisma.rucuDosyasi.create({
    data: {
      musteriId,
      hasarDosyaNo: payload.hasarNo || null,
      durum,
      // triyaj
      yol: analiz ? yolDb(analiz.yol) : null,
      yolGuven: analiz?.yolGuven ?? null,
      yolNeden: analiz?.yolNeden ?? null,
      // kimlik / kaza
      sigortaliUnvan: analiz?.sigortaliUnvan ?? null,
      sigortaliTelefon: analiz?.sigortaliTelefon ?? null,
      il: analiz?.il ?? null,
      muhatapOzet: analiz?.muhatapOzet ?? null,
      brans: analiz ? bransDb(analiz.brans) : null,
      sigortaliPlaka: analiz?.sigortaliPlaka ?? null,
      karsiPlaka: analiz?.karsiPlaka ?? null,
      kazaYeri: analiz?.kazaYeri ?? null,
      olusSekli: analiz?.olusSekli ?? null,
      kusurDurumu: analiz?.kusurDurumu ?? null,
      asilAlacak: guvenliDecimal(analiz?.asilAlacak),
      rucuTutari: guvenliDecimal(analiz?.rucuTutari),
      rucuOrani: analiz?.rucuOrani ?? null,
      yetkiliIcra: icraOneri?.icraDairesi ?? analiz?.yetkiliIcra ?? null,
      faizBaslangic: faizBas,
      odemeler: yeniOdemeler.length ? { create: yeniOdemeler.map((o) => ({ tarih: o.tarih, tutar: o.tutar, haricMi: o.haricMi, aciklama: o.aciklama })) } : undefined,
      cikarimJson: cikarim as unknown as Prisma.InputJsonValue,
      belgeler: {
        create: payload.dosyalar.map((f) => ({
          kategori: f.kind === 'foto' ? BelgeKategori.HASAR_FOTO : BelgeKategori.DIGER,
          dosyaAdi: f.name,
          storagePath: '',
          genislik: f.w ?? null,
          yukseklik: f.h ?? null,
          kamera: f.kamera ?? null,
        })),
      },
      borclular: analiz?.borclular?.length
        ? {
            create: analiz.borclular.map((b) => ({
              adUnvan: b.adUnvan,
              tcVkn: b.tcVkn || null,
              telefon: b.telefon || null,
              adres: b.adres || null,
              rol: rolDb(b.rol),
              kaynak: b.kaynak || null,
              teyitDurumu: teyitDb(b.teyit),
            })),
          }
        : undefined,
      aktiviteler: {
        create: {
          kullaniciId: dbUser.id,
          eylem: analiz
            ? `Yığın işlendi + asistan analizi → ${analiz.yol} (güven ${(analiz.yolGuven * 100) | 0}%), ${analiz.borclular.length} borçlu`
            : `Yığın işlendi → dosya oluştu (${payload.dosyalar.length} belge, yerel çıkarım)`,
        },
      },
    },
    select: { id: true },
  })

  revalidatePath('/akilli-giris')
  return { id: dosya.id }
}

/** Dosya Detay'daki "Takip Açıldı" eşleştirmesi: UYAP icra no'sunu dosyaya bağlar. */
export async function takipAcildi(formData: FormData) {
  const { dbUser, izinli } = await ctx()
  const dosyaId = String(formData.get('dosyaId') ?? '')
  const daire = String(formData.get('daire') ?? '').trim()
  const icraDosyaNo = String(formData.get('no') ?? '').trim()
  const tarihStr = String(formData.get('tarih') ?? '').trim()

  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) redirect('/akilli-giris')

  await prisma.rucuDosyasi.update({
    where: { id: dosyaId },
    data: {
      icraDairesi: daire || null,
      icraDosyaNo: icraDosyaNo || null,
      takipTarihi: tarihStr ? new Date(tarihStr) : null,
      durum: DosyaDurum.TAKIP_ACILDI,
    },
  })
  await prisma.aktivite.create({
    data: { dosyaId, kullaniciId: dbUser.id, eylem: `Takip açıldı & eşleştirildi: ${icraDosyaNo || '—'} · ${daire || '—'}` },
  })

  revalidatePath(`/akilli-giris/${dosyaId}`)
}

/** "AI ile Çıkarım Yap": dosyanın belge metnini bizim AI'ya (analizEt) verir, sonucu DB'ye yazar. */
export async function aiCikar(dosyaId: string): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  const dosya = await prisma.rucuDosyasi.findUnique({
    where: { id: dosyaId },
    select: { musteriId: true, durum: true, belgeler: { select: { extractedText: true, kategori: true, dosyaAdi: true, storagePath: true } } },
  })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya bu dosyada yetkiniz yok' }

  // Belgeleri ÖNEM sırasına diz: DELİL ÖNCE (tutanaklar/bilirkişi/ekspertiz/sorgular) → AI olay bağlamını
  // bunlardan kursun; Lehe formu yalnız ipucu olarak sonra gelir. Mükerrer metin elenir, en kritik delil başta kalır.
  const ONCELIK = ['TUTANAK', 'EKSPERTIZ', 'SBM', 'ALKOL', 'EHLIYET', 'RUHSAT', 'LEHE', 'POLICE', 'DEKONT', 'DIGER', 'HASAR_FOTO']
  const onc = (k: string) => { const i = ONCELIK.indexOf(k); return i < 0 ? 99 : i }
  const gorulen = new Set<string>()
  const parcalar: string[] = []
  for (const b of [...dosya.belgeler].sort((a, c) => onc(a.kategori) - onc(c.kategori))) {
    const t = (b.extractedText ?? '').trim()
    if (!t) continue
    const imza = t.replace(/\s+/g, ' ').slice(0, 160)
    if (gorulen.has(imza)) continue // aynı poliçe/ekspertiz kopyalarını tek say
    gorulen.add(imza)
    parcalar.push(`### ${b.kategori} · ${b.dosyaAdi}\n${t}`)
  }
  const metin = parcalar.join('\n\n').slice(0, 150000).trim()
  if (!metin) return { ok: false, error: 'Çıkarım için belge metni yok. Önce Evrak bölümünden belge ekleyin.' }

  // GÖRSELLER (vision): ehliyet/ruhsat/tutanak/plaka fotoğraflarını da modele ver — metinde (zayıf OCR) olmayanı görüntüden okusun.
  const IMG_ONC: Record<string, number> = { EHLIYET: 0, RUHSAT: 1, TUTANAK: 2, ALKOL: 3, SBM: 4, DIGER: 5, HASAR_FOTO: 6 }
  const imgAday = dosya.belgeler
    .filter((b) => b.storagePath && (IMG_ONC[b.kategori] != null || /\.(jpe?g|png|webp|gif)$/i.test(b.storagePath) || /\.(jpe?g|png|webp|gif)$/i.test(b.dosyaAdi)))
    .sort((a, c) => (IMG_ONC[a.kategori] ?? 9) - (IMG_ONC[c.kategori] ?? 9))
    .slice(0, 16)
  const gorseller: { mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; b64: string }[] = []
  if (imgAday.length) {
    const admin = createAdminClient()
    for (const b of imgAday) {
      if (gorseller.length >= 12) break
      try {
        const { data, error } = await admin.storage.from('evrak').download(b.storagePath as string)
        if (error || !data) continue
        const buf = Buffer.from(await data.arrayBuffer())
        const mime = imgMime(buf)
        if (!mime || buf.length > 4_500_000) continue
        gorseller.push({ mime, b64: buf.toString('base64') })
      } catch { /* görsel atlanır */ }
    }
  }

  const ayarlar = await prisma.ayarlar.findUnique({ where: { musteriId: dosya.musteriId }, select: { aciklamaFooter: true } })
  const analiz = await analizEt(metin, ayarlar?.aciklamaFooter ?? undefined, gorseller)
  if (!analiz) return { ok: false, error: 'AI çıkarımı sonuç vermedi (API anahtarı yok ya da model yanıtı boş).' }

  // Rücu oranını TUTARLARDAN deterministik türet (LLM yaya→%100 derken tutarı yarı verebiliyor).
  const aaNum = guvenliDecimal(analiz.asilAlacak), rtNum = guvenliDecimal(analiz.rucuTutari)
  let rucuOraniSon = analiz.rucuOrani || undefined
  if (aaNum && rtNum && Number(aaNum) > 0) {
    const oran = Math.round((Number(rtNum) / Number(aaNum)) * 100)
    if (oran > 0 && oran <= 100) rucuOraniSon = `%${oran}`
  }

  const cikarim = {
    aciklama: analiz.aciklama ?? null,
    olayTuru: analiz.olayTuru ?? null,
    olayBaglami: analiz.olayBaglami ?? null,
    sonrakiAdimlar: analiz.sonrakiAdimlar ?? [],
    teyit: analiz.teyit ?? [],
    llm: {
      brans: analiz.brans ?? null, kazaYeri: analiz.kazaYeri ?? null, asilAlacak: analiz.asilAlacak ?? null,
      yetkiliIcra: analiz.yetkiliIcra ?? null, kusurDurumu: analiz.kusurDurumu ?? null, olusSekli: analiz.olusSekli ?? null,
    },
  }

  // dekontlar → Odeme; faiz başlangıcı = ekspertiz hariç en geç dekont tarihi
  const yeniOdemeler = dekontlardanOdemeler(analiz.dekontlar)
  const faizBas = sonDekontTarihiOdeme(yeniOdemeler)

  // yetkili icra = KAZA YERİ → Adlî Rehber'den bağlı adliye (deterministik; LLM önerisine fallback)
  const icraOneri = yetkiliIcraOner(analiz.kazaYeri || analiz.il, analiz.il)
  const yetkiliIcraSon = icraOneri?.icraDairesi || analiz.yetkiliIcra || undefined

  try {
    await prisma.$transaction([
      prisma.borclu.deleteMany({ where: { dosyaId } }),
      prisma.odeme.deleteMany({ where: { dosyaId } }),
      prisma.rucuDosyasi.update({
        where: { id: dosyaId },
        data: {
          faizBaslangic: faizBas ?? undefined, // dekont yoksa mevcut değeri koru
          odemeler: yeniOdemeler.length
            ? { create: yeniOdemeler.map((o) => ({ tarih: o.tarih, tutar: o.tutar, haricMi: o.haricMi, aciklama: o.aciklama })) }
            : undefined,
          yol: yolDb(analiz.yol),
          yolGuven: analiz.yolGuven ?? null,
          yolNeden: analiz.yolNeden ?? null,
          brans: bransDb(analiz.brans),
          sigortaliUnvan: analiz.sigortaliUnvan || undefined,
          sigortaliTelefon: analiz.sigortaliTelefon || undefined,
          sigortaliPlaka: analiz.sigortaliPlaka || undefined,
          karsiPlaka: analiz.karsiPlaka || undefined,
          il: analiz.il || undefined,
          kazaYeri: analiz.kazaYeri || undefined,
          olusSekli: analiz.olusSekli || undefined,
          kusurDurumu: analiz.kusurDurumu || undefined,
          asilAlacak: guvenliDecimal(analiz.asilAlacak) ?? undefined,
          rucuTutari: guvenliDecimal(analiz.rucuTutari) ?? undefined,
          rucuOrani: rucuOraniSon,
          yetkiliIcra: yetkiliIcraSon,
          muhatapOzet: analiz.muhatapOzet || undefined,
          cikarimJson: cikarim as unknown as Prisma.InputJsonValue,
          durum: dosya.durum === DosyaDurum.HAVUZDA ? DosyaDurum.INCELENIYOR : undefined,
          borclular: analiz.borclular?.length
            ? {
                create: analiz.borclular.map((b) => ({
                  adUnvan: b.adUnvan, tcVkn: b.tcVkn || null, telefon: b.telefon || null, adres: b.adres || null,
                  rol: rolDb(b.rol), kaynak: b.kaynak || null, teyitDurumu: teyitDb(b.teyit),
                })),
              }
            : undefined,
        },
      }),
      prisma.aktivite.create({
        data: {
          dosyaId, kullaniciId: dbUser.id,
          eylem: `AI çıkarımı çalıştı → ${analiz.yol} (güven %${(analiz.yolGuven * 100) | 0}), ${analiz.borclular.length} borçlu`,
        },
      }),
    ])
  } catch (e) {
    return { ok: false, error: `Çıkarım yazılamadı: ${(e as Error).message}` }
  }

  revalidatePath(`/akilli-giris/${dosyaId}`)
  return { ok: true }
}

const katDb = (k: string): BelgeKategori => (k && k in BelgeKategori ? (k as BelgeKategori) : BelgeKategori.DIGER)

// Görsel mime'ını magic-byte'tan belirle (PDF/bilinmeyen → null, atlanır → vision'a yalnız gerçek fotoğraf gider).
function imgMime(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | null {
  if (buf.length < 12) return null
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

// Postgres text alanı NUL (0x00) ve C0 kontrol baytlarını kabul etmez (UTF8 hata 22021) → PDF/OCR metninden temizle (tab/satır sonu korunur).
const nulSuz = (s: string | null | undefined): string | null => {
  if (s == null) return null
  let out = ""
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) continue // NUL/C0 kontrol baytlarini at; tab/LF/CR koru
    out += s[i]
  }
  return out
}

type EklenecekBelge = { dosyaAdi: string; kategori: string; guven?: number; extractedText: string | null; genislik?: number; yukseklik?: number; kamera?: string; exifTarih?: string; storagePath?: string }

/** Mevcut dosyaya manuel belge ekle (tarayıcıda çıkarılmış metin + meta ile). */
export async function belgeEkle(dosyaId: string, belgeler: EklenecekBelge[]): Promise<{ ok: boolean; error?: string; eklenen?: number }> {
  const { dbUser, izinli } = await ctx()
  if (!Array.isArray(belgeler) || belgeler.length === 0) return { ok: false, error: 'Eklenecek belge bulunamadı' }
  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true, durum: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya bu dosyada yetkiniz yok' }

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.belge.createMany({
      data: belgeler.map((b) => ({
        dosyaId,
        kategori: katDb(b.kategori),
        confidence: b.guven ?? null,
        dosyaAdi: (nulSuz(b.dosyaAdi) ?? '').slice(0, 255),
        storagePath: nulSuz(b.storagePath) ?? '', // 'evrak' bucket'taki yol (bayt yüklendiyse)
        extractedText: b.extractedText ? (nulSuz(b.extractedText) ?? '').slice(0, 100000) || null : null,
        genislik: b.genislik ?? null,
        yukseklik: b.yukseklik ?? null,
        kamera: nulSuz(b.kamera),
        exifTarih: b.exifTarih ? new Date(b.exifTarih) : null,
      })),
    }),
    prisma.aktivite.create({ data: { dosyaId, kullaniciId: dbUser.id, eylem: `${belgeler.length} belge eklendi (yerel çıkarım)` } }),
  ]
  if (dosya.durum === DosyaDurum.HAVUZDA) {
    ops.unshift(prisma.rucuDosyasi.update({ where: { id: dosyaId }, data: { durum: DosyaDurum.INCELENIYOR } }))
  }

  try {
    await prisma.$transaction(ops)
  } catch (e) {
    return { ok: false, error: `Belgeler eklenemedi: ${(e as Error).message}` }
  }

  revalidatePath(`/akilli-giris/${dosyaId}`)
  return { ok: true, eklenen: belgeler.length }
}

/** Bir belgeyi açmak için kısa ömürlü imzalı URL üret (tenant doğrulanır; service-role imzalar). */
export async function belgeAc(belgeId: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { izinli } = await ctx()
  const belge = await prisma.belge.findUnique({ where: { id: belgeId }, select: { storagePath: true, dosya: { select: { musteriId: true } } } })
  if (!belge || !izinli.includes(belge.dosya.musteriId)) return { ok: false, error: 'Belge bulunamadı veya bu dosyada yetkiniz yok' }
  if (!belge.storagePath) return { ok: false, error: 'Bu belgenin dosyası saklanmamış (eski/Storage’sız kayıt).' }
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from('evrak').createSignedUrl(belge.storagePath, 600)
  if (error || !data?.signedUrl) return { ok: false, error: `Bağlantı oluşturulamadı: ${error?.message ?? 'bilinmeyen hata'}` }
  return { ok: true, url: data.signedUrl }
}

/** Zaman çizelgesine not ekle. */
export async function notEkle(formData: FormData): Promise<void> {
  const { dbUser, izinli } = await ctx()
  const dosyaId = String(formData.get('dosyaId') ?? '')
  const metin = String(formData.get('metin') ?? '').trim()
  if (!metin) return
  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) return
  await prisma.not.create({ data: { dosyaId, kullaniciId: dbUser.id, metin, tip: 'NOT' } })
  revalidatePath(`/akilli-giris/${dosyaId}`)
}

// ───────────────── İNSAN KONTROLÜ: AI alanlarını düzenle / onayla ─────────────────

/** cikarimJson içindeki avukat onayını sıfırla (herhangi bir alan değişince). */
function cjOnaysiz(cikarimJson: Prisma.JsonValue | null): Record<string, unknown> {
  const cj = (cikarimJson && typeof cikarimJson === 'object' && !Array.isArray(cikarimJson) ? { ...(cikarimJson as object) } : {}) as Record<string, unknown>
  delete cj.onay
  return cj
}

/** Takibe-kritik dosya alanlarını elle güncelle (onay sıfırlanır). */
export async function dosyaGuncelle(dosyaId: string, fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true, cikarimJson: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }

  const str = (k: string) => { const v = String(fd.get(k) ?? '').trim(); return v || null }
  const date = (k: string) => { const v = str(k); return v ? new Date(v) : null }
  const yol = str('yol'); const brans = str('brans')

  await prisma.rucuDosyasi.update({
    where: { id: dosyaId },
    data: {
      yol: yol && yol in Yol ? (yol as Yol) : null,
      brans: brans && brans in Brans ? (brans as Brans) : null,
      sigortaliUnvan: str('sigortaliUnvan'), sigortaliTelefon: str('sigortaliTelefon'), sigortaliPlaka: str('sigortaliPlaka'), karsiPlaka: str('karsiPlaka'),
      rucuSebebi: str('rucuSebebi'), muhatapOzet: str('muhatapOzet'),
      kazaYeri: str('kazaYeri'), il: str('il'), yetkiliIcra: str('yetkiliIcra'),
      kusurDurumu: str('kusurDurumu'), olusSekli: str('olusSekli'),
      hukukDosyaNo: str('hukukDosyaNo'), hasarDosyaNo: str('hasarDosyaNo'),
      kazaTarihi: date('kazaTarihi'), hasarTarihi: date('hasarTarihi'), zamanasimi: date('zamanasimi'),
      asilAlacak: guvenliDecimal(str('asilAlacak')), rucuTutari: guvenliDecimal(str('rucuTutari')), rucuOrani: str('rucuOrani'),
      cikarimJson: cjOnaysiz(dosya.cikarimJson) as Prisma.InputJsonValue,
    },
  })
  await prisma.aktivite.create({ data: { dosyaId, kullaniciId: dbUser.id, eylem: 'Dosya alanları elle güncellendi (onay sıfırlandı)' } })
  revalidatePath(`/akilli-giris/${dosyaId}`)
  return { ok: true }
}

// ───────────────── FAİZ: dava tutarı + dekontlar + tarih/hesap (hepsi düzenlenebilir) ─────────────────

type FaizDekont = { tarih: string | null; tutar: string; haricMi: boolean; aciklama: string | null }
type FaizPayload = {
  davaTutari: string | null // = rucuTutari (faiz anaparası / kusur payı)
  faizBaslangic: string | null // YYYY-MM-DD · null = otomatik (son dekont)
  faizBitis: string | null // YYYY-MM-DD · null = otomatik (bugün)
  faizTutari: string | null // elle override · null = otomatik hesaplanan
  dekontlar: FaizDekont[]
}

const isoGun = (d: Date) => d.toISOString().slice(0, 10)

/** Faiz panelini kaydet: dekontları (Odeme) tazele, dava tutarı + faiz tarih/override'larını yaz,
 *  dönemsel hesabı snapshot'la. Takibe-kritik olduğu için avukat onayı sıfırlanır. */
export async function faizKaydet(dosyaId: string, p: FaizPayload): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true, cikarimJson: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }

  // dekontları normalize et (geçersiz tutarı ele)
  const odemeData = (Array.isArray(p.dekontlar) ? p.dekontlar : [])
    .map((d) => {
      const tutar = guvenliDecimal(d.tutar)
      if (!tutar) return null
      const t = d.tarih ? new Date(d.tarih) : null
      return { tarih: t && !Number.isNaN(t.getTime()) ? t : null, tutar, haricMi: !!d.haricMi, aciklama: (d.aciklama ?? '').trim().slice(0, 200) || null }
    })
    .filter((x): x is { tarih: Date | null; tutar: Prisma.Decimal; haricMi: boolean; aciklama: string | null } => !!x)

  const davaTutari = guvenliDecimal(p.davaTutari)
  const fBasGirdi = p.faizBaslangic && /^\d{4}-\d{2}-\d{2}/.test(p.faizBaslangic) ? new Date(p.faizBaslangic) : null
  const fBitGirdi = p.faizBitis && /^\d{4}-\d{2}-\d{2}/.test(p.faizBitis) ? new Date(p.faizBitis) : null
  const fTutariGirdi = guvenliDecimal(p.faizTutari)

  // dönemsel hesabı snapshot'la (oranlar Ayarlar'dan)
  const ayarlar = await prisma.ayarlar.findUnique({ where: { musteriId: dosya.musteriId }, select: { faizJson: true } })
  const oranlar = oranlariOku(ayarlar?.faizJson)
  const dekontGirdi: DekontGirdi[] = odemeData.map((o) => ({ tarih: o.tarih ? isoGun(o.tarih) : null, tutar: Number(o.tutar), haricMi: o.haricMi }))
  const otoBas = sonDekontTarihi(dekontGirdi)
  const basEt = fBasGirdi ?? (otoBas ? new Date(otoBas) : null)
  const bitEt = fBitGirdi ?? new Date()
  const anapara = davaTutari != null ? Number(davaTutari) : 0
  const hesap = anapara > 0 && basEt ? faizHesapla(anapara, basEt, bitEt, oranlar) : null
  const faizHesapJson = hesap
    ? { ...hesap, anapara, baslangic: isoGun(basEt as Date), bitis: isoGun(bitEt), elleTutar: fTutariGirdi != null ? Number(fTutariGirdi) : null, oranSnapshot: oranlar, hesaplamaTarihi: new Date().toISOString() }
    : null

  try {
    await prisma.$transaction([
      prisma.odeme.deleteMany({ where: { dosyaId } }),
      prisma.rucuDosyasi.update({
        where: { id: dosyaId },
        data: {
          rucuTutari: davaTutari ?? undefined,
          faizBaslangic: fBasGirdi, // null = otomatik
          faizBitis: fBitGirdi, // null = otomatik (bugün)
          faizTutari: fTutariGirdi, // null = otomatik hesaplanan
          faizHesapJson: (faizHesapJson as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          odemeler: odemeData.length ? { create: odemeData } : undefined,
          cikarimJson: cjOnaysiz(dosya.cikarimJson) as Prisma.InputJsonValue,
        },
      }),
      prisma.aktivite.create({ data: { dosyaId, kullaniciId: dbUser.id, eylem: `Faiz/dava tutarı güncellendi (${odemeData.length} dekont; onay sıfırlandı)` } }),
    ])
  } catch (e) {
    return { ok: false, error: `Faiz kaydedilemedi: ${(e as Error).message}` }
  }
  revalidatePath(`/akilli-giris/${dosyaId}`)
  return { ok: true }
}

/** UYAP e-Takip XML üret (tek dosya). Borçlu adresi MERNİS'e bırakılır (yalnız TC). e-imza+harç kullanıcıda. */
export async function takipXmlOlustur(
  dosyaId: string,
): Promise<{ ok: boolean; xml?: string; fileName?: string; uyarilar?: string[]; error?: string }> {
  const { izinli } = await ctx()
  const dosya = await prisma.rucuDosyasi.findFirst({
    where: { OR: [{ id: dosyaId }, { id: { startsWith: dosyaId } }, { hukukDosyaNo: dosyaId }, { hasarDosyaNo: dosyaId }] },
    include: { borclular: true, odemeler: true },
  })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }
  const ayarlar = await prisma.ayarlar.findUnique({ where: { musteriId: dosya.musteriId } })

  const uyarilar: string[] = []
  const alacakliUnvan = (ayarlar?.alacakliUnvan ?? dosya.sigortaliUnvan ?? '').trim()
  if (!alacakliUnvan) uyarilar.push('Alacaklı ünvanı yok — Şirket Bilgileri’nden girin.')
  if (!ayarlar?.vekilAdres) uyarilar.push('Alacaklı/vekil adresi yok — UYAP alacaklı adresini zorunlu tutuyor; Şirket Bilgileri’nden girin.')

  const borclular = dosya.borclular.map((b) => {
    const tc = (b.tcVkn ?? '').replace(/\D/g, '')
    return { adUnvan: b.adUnvan, tcVkn: tc || null, kurumMu: tc.length === 10, adres: null }
  })
  if (!borclular.length) uyarilar.push('Borçlu yok — takip açılamaz.')
  else if (borclular.some((b) => !b.tcVkn)) uyarilar.push('Bazı borçluların TC/VKN’si yok — MERNİS için TC şart.')

  const asil = dosya.rucuTutari != null ? Number(dosya.rucuTutari) : dosya.asilAlacak != null ? Number(dosya.asilAlacak) : 0
  if (!(asil > 0)) uyarilar.push('Rücu/asıl alacak tutarı yok.')
  if (!dosya.yetkiliIcra && !dosya.icraDairesi) uyarilar.push('Yetkili icra dairesi belirsiz — yükleme sırasında İl/Adliye’yi buna göre seçin.')

  const dekontGirdi: DekontGirdi[] = dosya.odemeler.map((o) => ({ tarih: o.tarih ? isoGun(o.tarih) : null, tutar: o.tutar != null ? Number(o.tutar) : 0, haricMi: o.haricMi }))
  const faizBas = dosya.faizBaslangic ? isoGun(dosya.faizBaslangic) : sonDekontTarihi(dekontGirdi) || null

  const cj = (dosya.cikarimJson ?? {}) as { aciklama?: string | null }
  const aciklama = (cj.aciklama ?? '').trim() || aciklamaUret({
    kazaTarihi: dosya.kazaTarihi ?? dosya.hasarTarihi, sigortaliPlaka: dosya.sigortaliPlaka, karsiPlaka: dosya.karsiPlaka, alacakliUnvan,
  })

  const vekilTam = (ayarlar?.vekilAd ?? '').trim()
  const vekilParca = vekilTam ? vekilTam.split(/\s+/) : []
  const vekil = vekilTam ? { ad: vekilParca.slice(0, -1).join(' ') || vekilParca[0], soyad: vekilParca.length > 1 ? vekilParca[vekilParca.length - 1] : '', adres: ayarlar?.vekilAdres ?? null } : null

  const girdi: TakipXmlGirdi = {
    alacakli: { unvan: alacakliUnvan, mersis: ayarlar?.mersis ?? null, iban: ayarlar?.iban ?? null, adres: ayarlar?.vekilAdres ?? null },
    vekil,
    borclular,
    asilAlacak: asil,
    faiz: faizBas ? { baslangic: faizBas, faizTuru: ayarlar?.faizTuru ?? 'Yasal faiz' } : null,
    aciklama,
    dosyaBelirleyici: dosya.hukukDosyaNo ?? dosya.id,
  }
  const xml = takipXmlUret(girdi)
  const no = (dosya.hukukDosyaNo ?? dosya.hasarDosyaNo ?? dosya.id).replace(/[^\w.-]/g, '_')
  return { ok: true, xml, fileName: `takip_${no}.xml`, uyarilar }
}

/** Aşama kaydet (İcra/Arabuluculuk/Dava/İnfaz) — form action. Yoksa oluşturur, varsa günceller; dosya durumunu senkronlar. */
export async function asamaKaydet(formData: FormData): Promise<void> {
  const { dbUser, izinli } = await ctx()
  const dosyaId = String(formData.get('dosyaId') ?? '')
  const tur = String(formData.get('tur') ?? '') as 'ICRA_TAKIBI' | 'ARABULUCULUK' | 'DAVA' | 'INFAZ'
  if (!['ICRA_TAKIBI', 'ARABULUCULUK', 'DAVA', 'INFAZ'].includes(tur)) return
  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) return

  const kimlikNo = String(formData.get('kimlikNo') ?? '').trim() || null
  const birim = String(formData.get('birim') ?? '').trim() || null
  const tarihStr = String(formData.get('tarih') ?? '')
  const baslangic = /^\d{4}-\d{2}-\d{2}/.test(tarihStr) ? new Date(tarihStr) : null
  const ozet = String(formData.get('ozet') ?? '').trim().slice(0, 2000) || null

  const mevcut = await prisma.asama.findFirst({ where: { dosyaId, tur } })
  if (mevcut) {
    await prisma.asama.update({ where: { id: mevcut.id }, data: { kimlikNo, birim, baslangic, ozet } })
  } else {
    const max = await prisma.asama.aggregate({ where: { dosyaId }, _max: { sira: true } })
    await prisma.asama.create({ data: { dosyaId, tur, kimlikNo, birim, baslangic, ozet, sira: (max._max.sira ?? 0) + 1 } })
  }

  // Dosya durumunu + (icra ise) mevcut alanları senkronla
  if (tur === 'ICRA_TAKIBI') {
    await prisma.rucuDosyasi.update({
      where: { id: dosyaId },
      data: { icraDosyaNo: kimlikNo ?? undefined, icraDairesi: birim ?? undefined, takipTarihi: baslangic ?? undefined, durum: DosyaDurum.TAKIP_ACILDI },
    })
  } else {
    const durumMap = { ARABULUCULUK: DosyaDurum.ARABULUCULUK, DAVA: DosyaDurum.DAVA, INFAZ: DosyaDurum.INFAZ } as const
    await prisma.rucuDosyasi.update({ where: { id: dosyaId }, data: { durum: durumMap[tur] } })
  }
  await prisma.aktivite.create({ data: { dosyaId, kullaniciId: dbUser.id, eylem: `${tur} aşaması kaydedildi${kimlikNo ? ' · ' + kimlikNo : ''}` } })
  revalidatePath(`/akilli-giris/${dosyaId}`)
}

/** Aşamayı sonuçlandır (durum=SONUCLANDI + sonuç) — form action. */
export async function asamaSonuclandir(formData: FormData): Promise<void> {
  const { dbUser, izinli } = await ctx()
  const asamaId = String(formData.get('asamaId') ?? '')
  const sonuc = String(formData.get('sonuc') ?? '').trim() || null
  const asama = await prisma.asama.findUnique({ where: { id: asamaId }, include: { dosya: { select: { musteriId: true } } } })
  if (!asama || !izinli.includes(asama.dosya.musteriId)) return
  await prisma.asama.update({ where: { id: asamaId }, data: { durum: 'SONUCLANDI', sonuc, bitis: new Date() } })
  await prisma.aktivite.create({ data: { dosyaId: asama.dosyaId, kullaniciId: dbUser.id, eylem: `${asama.tur} sonuçlandı${sonuc ? ' · ' + sonuc : ''}` } })
  revalidatePath(`/akilli-giris/${asama.dosyaId}`)
}

/** Etkinlik (toplantı/duruşma/süre) ekle — form action. */
// datetime-local ("YYYY-MM-DDTHH:mm") değerini TÜRKİYE saati (UTC+3, DST yok) varsayıp doğru UTC instant'a çevirir.
// Sunucu UTC olduğundan new Date(localStr) saati +3 kaydırırdı; bu fonksiyon kaymayı önler.
function trDateTime(s: string): Date | null {
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d }
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 3, +m[5]))
}

export async function etkinlikKaydet(formData: FormData): Promise<void> {
  const { izinli } = await ctx()
  const dosyaId = String(formData.get('dosyaId') ?? '')
  const asamaId = String(formData.get('asamaId') ?? '') || null
  const tur = String(formData.get('tur') ?? '') as 'ARABULUCULUK_TOPLANTISI' | 'DURUSMA' | 'SURE' | 'HATIRLATMA' | 'GORUSME'
  const baslik = String(formData.get('baslik') ?? '').trim()
  const yer = String(formData.get('yer') ?? '').trim() || null
  const baslarStr = String(formData.get('baslar') ?? '')
  const baslar = trDateTime(baslarStr)
  const biterStr = String(formData.get('biter') ?? '')
  const biterRaw = trDateTime(biterStr)
  const biter = biterRaw && !Number.isNaN(biterRaw.getTime()) && (!baslar || biterRaw > baslar) ? biterRaw : null
  const hatirlatmaDkRaw = Number(formData.get('hatirlatmaDk'))
  const hatirlatmaDk = Number.isFinite(hatirlatmaDkRaw) && hatirlatmaDkRaw > 0 ? Math.round(hatirlatmaDkRaw) : null
  const onlineRaw = String(formData.get('online') ?? '')
  const online = onlineRaw === 'on' || onlineRaw === 'true'
  const turGecerli = ['ARABULUCULUK_TOPLANTISI', 'DURUSMA', 'SURE', 'HATIRLATMA', 'GORUSME'].includes(tur)
  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true } })
  if (!dosya || !izinli.includes(dosya.musteriId) || !turGecerli || !baslik || !baslar || Number.isNaN(baslar.getTime())) return
  await prisma.etkinlik.create({ data: { dosyaId, asamaId, tur, baslik, baslar, biter, yer, online, hatirlatmaDk } })
  revalidatePath(`/akilli-giris/${dosyaId}`)
  revalidatePath('/takvim')
}

const ETKINLIK_TURLERI = ['ARABULUCULUK_TOPLANTISI', 'DURUSMA', 'SURE', 'HATIRLATMA', 'GORUSME'] as const
type EtkinlikTur = (typeof ETKINLIK_TURLERI)[number]

/** Takvim/dosya etkinliğini sil (tenant-kapsamlı). */
export async function etkinlikSil(formData: FormData): Promise<void> {
  const { izinli } = await ctx()
  const id = String(formData.get('id') ?? '')
  if (!id) return
  const etk = await prisma.etkinlik.findUnique({ where: { id }, select: { dosyaId: true, dosya: { select: { musteriId: true } } } })
  if (!etk || !izinli.includes(etk.dosya.musteriId)) return
  await prisma.etkinlik.delete({ where: { id } })
  revalidatePath(`/akilli-giris/${etk.dosyaId}`)
  revalidatePath('/takvim')
}

/** Etkinliği düzenle: tür/başlık/başlangıç-bitiş/yer/online (tenant-kapsamlı). */
export async function etkinlikGuncelle(formData: FormData): Promise<void> {
  const { izinli } = await ctx()
  const id = String(formData.get('id') ?? '')
  if (!id) return
  const etk = await prisma.etkinlik.findUnique({ where: { id }, select: { dosyaId: true, dosya: { select: { musteriId: true } } } })
  if (!etk || !izinli.includes(etk.dosya.musteriId)) return
  const tur = String(formData.get('tur') ?? '') as EtkinlikTur
  const baslik = String(formData.get('baslik') ?? '').trim()
  const yer = String(formData.get('yer') ?? '').trim() || null
  const baslarStr = String(formData.get('baslar') ?? '')
  const baslar = trDateTime(baslarStr)
  const biterStr = String(formData.get('biter') ?? '')
  const biterRaw = trDateTime(biterStr)
  const biter = biterRaw && !Number.isNaN(biterRaw.getTime()) && (!baslar || biterRaw > baslar) ? biterRaw : null
  const onlineRaw = String(formData.get('online') ?? '')
  const online = onlineRaw === 'on' || onlineRaw === 'true'
  if (!ETKINLIK_TURLERI.includes(tur) || !baslik || !baslar || Number.isNaN(baslar.getTime())) return
  await prisma.etkinlik.update({ where: { id }, data: { tur, baslik, baslar, biter, yer, online } })
  revalidatePath(`/akilli-giris/${etk.dosyaId}`)
  revalidatePath('/takvim')
}

/** Excel ile toplu icra eşleştir (hukuk no → icra no + daire). Atanan Dosyalar'dan. */
export async function icraEslestir(formData: FormData): Promise<{ ok: boolean; eslesen: number; bulunamayan: string[]; toplam: number; hata?: string }> {
  const { dbUser, izinli } = await ctx()
  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, eslesen: 0, bulunamayan: [], toplam: 0, hata: 'Dosya seçilmedi' }
  let rows: Record<string, unknown>[]
  try {
    const XLSX = await import('xlsx')
    const buf = new Uint8Array(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  } catch (e) {
    return { ok: false, eslesen: 0, bulunamayan: [], toplam: 0, hata: 'Excel okunamadı: ' + (e as Error).message }
  }

  const norm = (s: string) => s.toLocaleLowerCase('tr').replace(/[\s.]/g, '')
  const kolon = (row: Record<string, unknown>, anahtarlar: string[]) => {
    for (const k of Object.keys(row)) if (anahtarlar.some((a) => norm(k).includes(a))) { const v = String(row[k] ?? '').trim(); if (v) return v }
    return ''
  }
  const esasNo = (s: string) => { const m = s.match(/((?:19|20)\d{2})\s*\/\s*(\d{1,7})/); return m ? `${m[1]}/${m[2]}` : s.trim() }

  let eslesen = 0
  const bulunamayan: string[] = []
  for (const row of rows) {
    const hukukNo = kolon(row, ['hukuk', 'dosyano', 'dosya'])
    const icraNo = esasNo(kolon(row, ['icrano', 'icradosya', 'esas', 'takipno']))
    const daire = kolon(row, ['daire', 'icradairesi', 'birim', 'mudurluk', 'müdürlük'])
    if (!hukukNo) continue
    const dosya = await prisma.rucuDosyasi.findFirst({ where: { hukukDosyaNo: hukukNo, musteriId: { in: izinli } }, select: { id: true } })
    if (!dosya) { bulunamayan.push(hukukNo); continue }
    await prisma.rucuDosyasi.update({ where: { id: dosya.id }, data: { icraDosyaNo: icraNo || undefined, icraDairesi: daire || undefined, durum: icraNo ? DosyaDurum.TAKIP_ACILDI : undefined } })
    if (icraNo || daire) {
      const mevcut = await prisma.asama.findFirst({ where: { dosyaId: dosya.id, tur: 'ICRA_TAKIBI' } })
      if (mevcut) await prisma.asama.update({ where: { id: mevcut.id }, data: { kimlikNo: icraNo || mevcut.kimlikNo, birim: daire || mevcut.birim } })
      else { const max = await prisma.asama.aggregate({ where: { dosyaId: dosya.id }, _max: { sira: true } }); await prisma.asama.create({ data: { dosyaId: dosya.id, tur: 'ICRA_TAKIBI', kimlikNo: icraNo || null, birim: daire || null, sira: (max._max.sira ?? 0) + 1 } }) }
    }
    eslesen++
  }
  await prisma.aktivite.create({ data: { kullaniciId: dbUser.id, eylem: `Excel ile icra eşleştirme: ${eslesen}/${rows.length} dosya güncellendi` } })
  revalidatePath('/atanan-dosyalar')
  return { ok: true, eslesen, bulunamayan, toplam: rows.length }
}

/** Master Excel'den toplu BACKFILL: hukuk no eşleşip BOŞ alanları doldurur + borçlusu olmayana RÜCU MUHATABI'ndan borçlu ekler. AI çıkarımını EZMEZ. */
export async function masterEslestir(formData: FormData): Promise<{ ok: boolean; eslesen: number; borcluEklenen: number; bulunamayan: string[]; toplam: number; hata?: string }> {
  const { dbUser, izinli } = await ctx()
  const file = formData.get('file')
  const bos = { ok: false as const, eslesen: 0, borcluEklenen: 0, bulunamayan: [] as string[], toplam: 0 }
  if (!(file instanceof File)) return { ...bos, hata: 'Dosya seçilmedi' }
  let rows: Record<string, unknown>[]
  try {
    const XLSX = await import('xlsx')
    const buf = new Uint8Array(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]] // ilk sayfa (YASAL TAKİP)
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
  } catch (e) {
    return { ...bos, hata: 'Excel okunamadı: ' + (e as Error).message }
  }

  const KOLON: Record<string, string> = {
    hukukdosyano: 'hukukNo', hasardosyano: 'hasarDosyaNo', hasartarihi: 'hasarTarihi', zamanasimi: 'zamanasimi',
    rucusebebi: 'rucuSebebi', rucuorani: 'rucuOrani', rucututari: 'rucuTutari', davamiktari: 'davaMiktari',
    kadroluavukat: 'kadroluAvukat', sozlesmeliavukat: 'sozlesmeliAvukat', islemyapanavukatyard: 'islemYapanYrd',
    atamatarihi: 'atanmaTarihi', icramudurlugu: 'icraDairesi', icraesas: 'icraDosyaNo', takiptarihi: 'takipTarihi',
    rucumuhatabi: 'muhatap', rucumuhatabitelno: 'muhatapTel',
  }
  const norm = (row: Record<string, unknown>) => {
    const o: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row)) { const f = KOLON[kanonik(k)]; if (f && (o[f] == null || o[f] === '')) o[f] = v }
    return o
  }
  const txt = (v: unknown) => { const s = String(v ?? '').trim(); return s || null }
  const dec = (v: unknown) => { const n = paraTR(v); return n != null ? new Prisma.Decimal(n) : null }
  const esas = (v: unknown) => { const s = txt(v); if (!s) return null; const m = s.match(/((?:19|20)\d{2})\s*\/\s*(\d{1,7})/); return m ? `${m[1]}/${m[2]}` : s }
  const tel = (v: unknown) => { const s = String(v ?? ''); const d = s.replace(/\D/g, ''); return d.length >= 10 && d.length <= 12 ? s.trim().slice(0, 40) : null }

  let eslesen = 0, borcluEklenen = 0
  const bulunamayan: string[] = []
  for (const row of rows) {
    const r = norm(row)
    const hukukNo = txt(r.hukukNo)
    if (!hukukNo) continue
    const dosya = await prisma.rucuDosyasi.findFirst({
      where: { hukukDosyaNo: hukukNo, musteriId: { in: izinli } },
      select: { id: true, durum: true, hasarDosyaNo: true, hasarTarihi: true, zamanasimi: true, rucuSebebi: true, rucuOrani: true, rucuTutari: true, davaMiktari: true, kadroluAvukat: true, sozlesmeliAvukat: true, islemYapanYrd: true, atanmaTarihi: true, icraDairesi: true, icraDosyaNo: true, takipTarihi: true, _count: { select: { borclular: true } } },
    })
    if (!dosya) { bulunamayan.push(hukukNo); continue }

    const data: Record<string, unknown> = {}
    const setIf = (f: string, cur: unknown, val: unknown) => { if ((cur == null || cur === '') && val != null) data[f] = val }
    setIf('hasarDosyaNo', dosya.hasarDosyaNo, txt(r.hasarDosyaNo))
    setIf('hasarTarihi', dosya.hasarTarihi, tarihTR(r.hasarTarihi))
    setIf('zamanasimi', dosya.zamanasimi, tarihTR(r.zamanasimi))
    setIf('rucuSebebi', dosya.rucuSebebi, txt(r.rucuSebebi))
    setIf('rucuOrani', dosya.rucuOrani, txt(r.rucuOrani))
    setIf('rucuTutari', dosya.rucuTutari, dec(r.rucuTutari))
    setIf('davaMiktari', dosya.davaMiktari, dec(r.davaMiktari))
    setIf('kadroluAvukat', dosya.kadroluAvukat, txt(r.kadroluAvukat))
    setIf('sozlesmeliAvukat', dosya.sozlesmeliAvukat, txt(r.sozlesmeliAvukat))
    setIf('islemYapanYrd', dosya.islemYapanYrd, txt(r.islemYapanYrd))
    setIf('atanmaTarihi', dosya.atanmaTarihi, tarihTR(r.atanmaTarihi))
    setIf('icraDairesi', dosya.icraDairesi, txt(r.icraDairesi))
    setIf('icraDosyaNo', dosya.icraDosyaNo, esas(r.icraDosyaNo))
    setIf('takipTarihi', dosya.takipTarihi, tarihTR(r.takipTarihi))
    if (data.icraDosyaNo && (['HAVUZDA', 'INCELENIYOR', 'TAKIBE_HAZIR'] as string[]).includes(dosya.durum)) data.durum = DosyaDurum.TAKIP_ACILDI

    if (Object.keys(data).length) await prisma.rucuDosyasi.update({ where: { id: dosya.id }, data: data as Prisma.RucuDosyasiUpdateInput })

    if (dosya._count.borclular === 0) {
      const muhatap = txt(r.muhatap)
      if (muhatap) {
        const isimler = muhatap.split(/\s*[+\n;]\s*|\s+\/\s+/).map((s) => s.trim()).filter(Boolean).slice(0, 5)
        const t = tel(r.muhatapTel)
        for (let i = 0; i < isimler.length; i++) {
          await prisma.borclu.create({ data: { dosyaId: dosya.id, adUnvan: isimler[i].slice(0, 200), telefon: i === 0 ? t : null, rol: BorcluRol.DIGER, kaynak: 'Excel master', teyitDurumu: TeyitDurum.TEYIT_GEREK } })
          borcluEklenen++
        }
      }
    }

    const icraNo = (data.icraDosyaNo as string | undefined) ?? dosya.icraDosyaNo
    const icraDaire = (data.icraDairesi as string | undefined) ?? dosya.icraDairesi
    if (icraNo || icraDaire) {
      const mevcut = await prisma.asama.findFirst({ where: { dosyaId: dosya.id, tur: 'ICRA_TAKIBI' } })
      if (!mevcut) { const max = await prisma.asama.aggregate({ where: { dosyaId: dosya.id }, _max: { sira: true } }); await prisma.asama.create({ data: { dosyaId: dosya.id, tur: 'ICRA_TAKIBI', kimlikNo: icraNo ?? null, birim: icraDaire ?? null, sira: (max._max.sira ?? 0) + 1 } }) }
    }
    eslesen++
  }
  await prisma.aktivite.create({ data: { kullaniciId: dbUser.id, eylem: `Master Excel eşleştirme: ${eslesen}/${rows.length} dosya dolduruldu, ${borcluEklenen} borçlu eklendi` } })
  revalidatePath('/atanan-dosyalar')
  return { ok: true, eslesen, borcluEklenen, bulunamayan, toplam: rows.length }
}

/** Borçlu ekle veya düzelt (borcluId varsa düzelt). Onay sıfırlanır. */
export async function borcluKaydet(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const { izinli } = await ctx()
  const dosyaId = String(fd.get('dosyaId') ?? '')
  const borcluId = String(fd.get('borcluId') ?? '') || null
  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true, cikarimJson: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }
  const adUnvan = String(fd.get('adUnvan') ?? '').trim()
  if (!adUnvan) return { ok: false, error: 'Ad / Unvan zorunlu' }
  const data = {
    adUnvan, tcVkn: String(fd.get('tcVkn') ?? '').trim() || null, telefon: String(fd.get('telefon') ?? '').trim() || null, adres: String(fd.get('adres') ?? '').trim() || null,
    rol: rolDb(String(fd.get('rol') ?? '')), kaynak: String(fd.get('kaynak') ?? '').trim() || null, teyitDurumu: teyitDb(String(fd.get('teyit') ?? '')),
  }
  if (borcluId) {
    const b = await prisma.borclu.findUnique({ where: { id: borcluId }, select: { dosyaId: true } })
    if (!b || b.dosyaId !== dosyaId) return { ok: false, error: 'Borçlu bulunamadı' }
    await prisma.borclu.update({ where: { id: borcluId }, data })
  } else {
    await prisma.borclu.create({ data: { ...data, dosyaId } })
  }
  await prisma.rucuDosyasi.update({ where: { id: dosyaId }, data: { cikarimJson: cjOnaysiz(dosya.cikarimJson) as Prisma.InputJsonValue } })
  revalidatePath(`/akilli-giris/${dosyaId}`)
  return { ok: true }
}

/** Borçlu sil. Onay sıfırlanır. */
export async function borcluSil(borcluId: string): Promise<{ ok: boolean; error?: string }> {
  const { izinli } = await ctx()
  const b = await prisma.borclu.findUnique({ where: { id: borcluId }, select: { dosyaId: true, dosya: { select: { musteriId: true, cikarimJson: true } } } })
  if (!b || !izinli.includes(b.dosya.musteriId)) return { ok: false, error: 'Borçlu bulunamadı veya yetkiniz yok' }
  await prisma.borclu.delete({ where: { id: borcluId } })
  await prisma.rucuDosyasi.update({ where: { id: b.dosyaId }, data: { cikarimJson: cjOnaysiz(b.dosya.cikarimJson) as Prisma.InputJsonValue } })
  revalidatePath(`/akilli-giris/${b.dosyaId}`)
  return { ok: true }
}

/** UYAP takip açıklamasını elle düzelt. Onay sıfırlanır. */
export async function aciklamaGuncelle(dosyaId: string, metin: string): Promise<{ ok: boolean; error?: string }> {
  const { izinli } = await ctx()
  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true, cikarimJson: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }
  const cj = cjOnaysiz(dosya.cikarimJson)
  cj.aciklama = metin
  await prisma.rucuDosyasi.update({ where: { id: dosyaId }, data: { cikarimJson: cj as Prisma.InputJsonValue } })
  revalidatePath(`/akilli-giris/${dosyaId}`)
  return { ok: true }
}

/** Takip süreci olayı ekle (tebliğ/itiraz/tahsilat/kesinleşti/haciz/kapandı). */
export async function olayEkle(fd: FormData): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  const dosyaId = String(fd.get('dosyaId') ?? '')
  const tip = String(fd.get('tip') ?? '').trim()
  if (!tip) return { ok: false, error: 'Olay tipi gerekli' }
  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }
  const tarihStr = String(fd.get('tarih') ?? '').trim()
  try {
    await takipOlayKaydet(dosyaId, dbUser.id, {
      tip,
      tarih: tarihStr ? new Date(tarihStr) : new Date(),
      tutar: guvenliDecimal(String(fd.get('tutar') ?? '')),
      aciklama: String(fd.get('aciklama') ?? '').trim() || null,
    })
  } catch (e) {
    return { ok: false, error: `Olay eklenemedi: ${(e as Error).message}` }
  }
  revalidatePath(`/akilli-giris/${dosyaId}`)
  return { ok: true }
}

/** Takip süreci olayını sil. */
export async function olaySil(olayId: string): Promise<{ ok: boolean; error?: string }> {
  const { izinli } = await ctx()
  const o = await prisma.takipOlayi.findUnique({ where: { id: olayId }, select: { dosyaId: true, dosya: { select: { musteriId: true } } } })
  if (!o || !izinli.includes(o.dosya.musteriId)) return { ok: false, error: 'Olay bulunamadı veya yetkiniz yok' }
  await prisma.takipOlayi.delete({ where: { id: olayId } })
  revalidatePath(`/akilli-giris/${o.dosyaId}`)
  return { ok: true }
}

/** Avukat onayı: tüm alanlar gözden geçirildi → Takip Aç açılır. */
export async function dosyaOnayla(dosyaId: string, onay: boolean): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true, cikarimJson: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }
  const cj = cjOnaysiz(dosya.cikarimJson)
  if (onay) cj.onay = { ok: true, kim: dbUser.ad, tarih: new Date().toISOString() }
  await prisma.rucuDosyasi.update({ where: { id: dosyaId }, data: { cikarimJson: cj as Prisma.InputJsonValue } })
  await prisma.aktivite.create({ data: { dosyaId, kullaniciId: dbUser.id, eylem: onay ? 'Dosya avukat onayından geçti — takibe hazır' : 'Avukat onayı geri alındı' } })
  revalidatePath(`/akilli-giris/${dosyaId}`)
  return { ok: true }
}

/** Dava dilekçesi taslağı üret: dosya verisi + faiz (takip çıkışı) + arabuluculuk + AI olay anlatımı → UretilenCikti TASLAK. */
export async function dilekceUret(dosyaId: string): Promise<{ ok: boolean; error?: string; metin?: string; ciktiId?: string }> {
  const { dbUser, izinli } = await ctx()
  const dosya = await prisma.rucuDosyasi.findUnique({
    where: { id: dosyaId },
    include: { borclular: { orderBy: { id: 'asc' } }, odemeler: true, belgeler: { select: { id: true, extractedText: true, kategori: true, dosyaAdi: true, storagePath: true } }, asamalar: true },
  })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }
  const ayarlar = await prisma.ayarlar.findUnique({ where: { musteriId: dosya.musteriId } })

  // faiz → takip çıkış değeri (anapara + işlemiş faiz)
  const anapara = dosya.rucuTutari != null ? Number(dosya.rucuTutari) : dosya.asilAlacak != null ? Number(dosya.asilAlacak) : 0
  const oranlar = oranlariOku(ayarlar?.faizJson)
  const dekontGirdi: DekontGirdi[] = dosya.odemeler.map((o) => ({ tarih: o.tarih ? o.tarih.toISOString().slice(0, 10) : null, tutar: o.tutar != null ? Number(o.tutar) : 0, haricMi: o.haricMi }))
  const faizBas = dosya.faizBaslangic ? dosya.faizBaslangic.toISOString().slice(0, 10) : sonDekontTarihi(dekontGirdi)
  const faizBit = dosya.faizBitis ? dosya.faizBitis.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  const faizHesap = anapara > 0 && faizBas ? faizHesapla(anapara, new Date(faizBas), new Date(faizBit), oranlar) : null
  const islemisFaiz = dosya.faizTutari != null ? Number(dosya.faizTutari) : faizHesap ? faizHesap.faiz : null
  const takipCikis = islemisFaiz != null ? anapara + islemisFaiz : anapara

  const arab = dosya.asamalar.find((a) => a.tur === 'ARABULUCULUK')
  const cj = (dosya.cikarimJson ?? {}) as { olayBaglami?: string | null; olayTuru?: string | null }

  // BELGE METNİ (önem sıralı + dedup) — dilekçe AI doğrudan kanıta baksın
  const D_ONC = ['TUTANAK', 'EKSPERTIZ', 'SBM', 'ALKOL', 'EHLIYET', 'RUHSAT', 'LEHE', 'POLICE', 'DEKONT', 'DIGER', 'HASAR_FOTO']
  const dOnc = (k: string) => { const i = D_ONC.indexOf(k); return i < 0 ? 99 : i }
  const gorulen = new Set<string>()
  const parcalar: string[] = []
  for (const b of [...dosya.belgeler].sort((a, c) => dOnc(a.kategori) - dOnc(c.kategori))) {
    const t = (b.extractedText ?? '').trim()
    if (!t) continue
    const imza = t.replace(/\s+/g, ' ').slice(0, 160)
    if (gorulen.has(imza)) continue
    gorulen.add(imza)
    parcalar.push(`### ${b.kategori} · ${b.dosyaAdi}\n${t}`)
  }
  const belgeMetni = parcalar.join('\n\n').slice(0, 120000)

  // GÖRSELLER (vision) — ehliyet/ruhsat/tutanak/plaka foto
  const D_IMG: Record<string, number> = { EHLIYET: 0, RUHSAT: 1, TUTANAK: 2, ALKOL: 3, SBM: 4, DIGER: 5, HASAR_FOTO: 6 }
  const imgAday = dosya.belgeler
    .filter((b) => b.storagePath && (D_IMG[b.kategori] != null || /\.(jpe?g|png|webp|gif)$/i.test(b.storagePath) || /\.(jpe?g|png|webp|gif)$/i.test(b.dosyaAdi)))
    .sort((a, c) => (D_IMG[a.kategori] ?? 9) - (D_IMG[c.kategori] ?? 9))
    .slice(0, 16)
  const gorseller: { mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; b64: string }[] = []
  if (imgAday.length) {
    const admin = createAdminClient()
    for (const b of imgAday) {
      if (gorseller.length >= 10) break
      try {
        const { data, error } = await admin.storage.from('evrak').download(b.storagePath as string)
        if (error || !data) continue
        const buf = Buffer.from(await data.arrayBuffer())
        const mime = imgMime(buf)
        if (!mime || buf.length > 4_500_000) continue
        gorseller.push({ mime, b64: buf.toString('base64') })
      } catch { /* atla */ }
    }
  }

  // dekont kalemleri (deterministik gösterim + AI'a ipucu)
  const dekontlar = dosya.odemeler.map((o) => ({ tarih: o.tarih ? o.tarih.toISOString().slice(0, 10) : null, tutar: o.tutar != null ? Number(o.tutar) : null, aciklama: o.aciklama ?? null, haricMi: o.haricMi }))

  const anlatim = await dilekceAnlatim({
    olayBaglami: cj.olayBaglami ?? null, olayTuru: cj.olayTuru ?? null, brans: dosya.brans ?? null,
    sigortaliPlaka: dosya.sigortaliPlaka ?? null, karsiPlaka: dosya.karsiPlaka ?? null, sigortaliUnvan: dosya.sigortaliUnvan ?? null,
    kazaTarihi: dosya.kazaTarihi ? dosya.kazaTarihi.toISOString().slice(0, 10) : null, kazaYeri: dosya.kazaYeri ?? dosya.il ?? null,
    davalilar: dosya.borclular.map((b) => ({ ad: b.adUnvan, rol: b.rol as string })),
    asilAlacak: anapara || null, rucuOrani: dosya.rucuOrani ?? null, kusurDurumu: dosya.kusurDurumu ?? null, odemeBilgi: null,
    belgeMetni, gorseller, dekontlar,
  })

  const girdi: DilekceGirdi = {
    davaciUnvan: ayarlar?.alacakliUnvan || 'RAY SİGORTA ANONİM ŞİRKETİ',
    davaciVkn: ayarlar?.davaciVkn ?? null, davaciAdres: ayarlar?.davaciAdres ?? null,
    vekilAd: ayarlar?.vekilAd ?? null, vekilUets: ayarlar?.vekilUets ?? null, vekilAdres: ayarlar?.vekilAdres ?? null,
    icraInkarOrani: ayarlar?.icraInkarOrani || '20',
    davalilar: dosya.borclular.map((b) => ({ ad: b.adUnvan, tc: b.tcVkn ?? null, adres: b.adres ?? null })),
    brans: dosya.brans ?? null, olayTuru: cj.olayTuru ?? null, mahkemeYeri: dosya.kazaYeri ?? dosya.il ?? null,
    icraDairesi: dosya.icraDairesi ?? dosya.yetkiliIcra ?? null, icraEsasNo: dosya.icraDosyaNo ?? null,
    asilAlacak: anapara || null, islemisFaiz, takipCikis, policeNo: null,
    kazaTarihi: dosya.kazaTarihi ? dosya.kazaTarihi.toISOString().slice(0, 10) : null, kazaYeri: dosya.kazaYeri ?? null,
    sigortaliPlaka: dosya.sigortaliPlaka ?? null, karsiPlaka: dosya.karsiPlaka ?? null,
    arabulucuBuro: arab?.birim ?? null, arabulucuDosyaNo: arab?.kimlikNo ?? null,
    arabulucuTarih: arab?.bitis ? arab.bitis.toISOString().slice(0, 10) : arab?.baslangic ? arab.baslangic.toISOString().slice(0, 10) : null,
    dekontlar,
    olayAnlatimi: anlatim || '⟨olay anlatımı — AI üretemedi, elle yazın⟩',
  }
  const metin = dilekceMetni(girdi)

  const mevcut = await prisma.uretilenCikti.findFirst({ where: { dosyaId, tip: CiktiTip.DILEKCE }, orderBy: { createdAt: 'desc' } })
  let ciktiId: string
  if (mevcut) {
    await prisma.uretilenCikti.update({ where: { id: mevcut.id }, data: { icerik: metin, durum: 'TASLAK' } })
    await prisma.ciktiKaynak.deleteMany({ where: { ciktiId: mevcut.id } })
    ciktiId = mevcut.id
  } else {
    const c = await prisma.uretilenCikti.create({ data: { dosyaId, tip: CiktiTip.DILEKCE, durum: 'TASLAK', icerik: metin } })
    ciktiId = c.id
  }
  const belgeIds = dosya.belgeler.map((b) => b.id)
  if (belgeIds.length) await prisma.ciktiKaynak.createMany({ data: belgeIds.map((belgeId) => ({ ciktiId, belgeId })), skipDuplicates: true })
  await prisma.aktivite.create({ data: { dosyaId, kullaniciId: dbUser.id, eylem: 'Dava dilekçesi taslağı üretildi' } })
  revalidatePath(`/akilli-giris/${dosyaId}`)
  return { ok: true, metin, ciktiId }
}

/** Dilekçe taslağını (elle düzenlenmiş) kaydet + durum güncelle (TASLAK/IMZAYA_GIDEN/GONDERILDI). */
export async function dilekceKaydet(ciktiId: string, icerik: string, durum?: string): Promise<{ ok: boolean; error?: string }> {
  const { izinli } = await ctx()
  const c = await prisma.uretilenCikti.findUnique({ where: { id: ciktiId }, select: { dosya: { select: { id: true, musteriId: true } } } })
  if (!c || !izinli.includes(c.dosya.musteriId)) return { ok: false, error: 'Çıktı bulunamadı veya yetkiniz yok' }
  const gecerli = ['TASLAK', 'IMZAYA_GIDEN', 'GONDERILDI'].includes(durum ?? '') ? durum : undefined
  await prisma.uretilenCikti.update({ where: { id: ciktiId }, data: { icerik: icerik.slice(0, 100000), durum: gecerli } })
  revalidatePath(`/akilli-giris/${c.dosya.id}`)
  return { ok: true }
}

// ───────────────── TAKSİT PLANI: kur / ödendi / geri al / iptal ─────────────────
// Taksit ödemesi = borçlunun BİZE ödemesi → TakipOlayi(TAHSILAT) olarak yazılır (bakiyeye düşer).
// DİKKAT: Odeme tablosuna YAZILMAZ — orası faiz dekontları (tazminat ödemeleri), karıştırılırsa faiz bozulur.

type TaksitPlaniPayload = {
  toplamTutar: string // anlaşılan net (indirim sonrası)
  taksitSayisi: number
  ilkVade: string // YYYY-MM-DD
  periyotAy?: number // varsayılan 1 (aylık)
  hatirlatmaGun?: number // vade öncesi kaç gün hatırlat (varsayılan 3)
  temerrutSarti?: boolean
  indirimTutari?: string | null
  not?: string | null
  asamaId?: string | null // hangi aşamada (arabuluculuk/icra) yapıldı
}

/** Taksit planı kur: toplam + taksit sayısı + ilk vade → eşit bölünmüş program (son taksit kuruş artığı). */
export async function taksitPlaniKur(dosyaId: string, p: TaksitPlaniPayload): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }

  const toplam = guvenliDecimal(p.toplamTutar)
  if (!toplam || Number(toplam) <= 0) return { ok: false, error: 'Geçerli bir toplam tutar girin.' }
  const adet = Math.round(Number(p.taksitSayisi))
  if (!Number.isFinite(adet) || adet < 1 || adet > 120) return { ok: false, error: 'Taksit sayısı 1–120 olmalı.' }
  const ilkVade = p.ilkVade && /^\d{4}-\d{2}-\d{2}/.test(p.ilkVade) ? new Date(p.ilkVade) : null
  if (!ilkVade || Number.isNaN(ilkVade.getTime())) return { ok: false, error: 'İlk taksit vadesini seçin.' }
  const periyot = p.periyotAy && p.periyotAy >= 1 && p.periyotAy <= 12 ? Math.round(p.periyotAy) : 1
  const hatirlatmaGun = p.hatirlatmaGun != null && p.hatirlatmaGun >= 0 && p.hatirlatmaGun <= 60 ? Math.round(p.hatirlatmaGun) : 3
  const indirim = p.indirimTutari ? guvenliDecimal(p.indirimTutari) : null

  // aşama eşleşmesi opsiyonel — yalnız bu dosyaya aitse bağla
  let asamaId: string | null = null
  if (p.asamaId) {
    const a = await prisma.asama.findUnique({ where: { id: p.asamaId }, select: { dosyaId: true } })
    if (a && a.dosyaId === dosyaId) asamaId = p.asamaId
  }

  const program = taksitProgrami({ toplam: Number(toplam), taksitSayisi: adet, ilkVade, periyotAy: periyot })

  try {
    await prisma.taksitPlani.create({
      data: {
        dosyaId,
        asamaId,
        toplamTutar: toplam,
        indirimTutari: indirim,
        taksitSayisi: adet,
        hatirlatmaGun,
        temerrutSarti: p.temerrutSarti !== false,
        not: (p.not ?? '').trim().slice(0, 2000) || null,
        taksitler: {
          create: program.map((t) => ({ sira: t.sira, vadeTarihi: t.vadeTarihi, tutar: new Prisma.Decimal(t.tutar.toFixed(2)) })),
        },
      },
    })
    await prisma.aktivite.create({ data: { dosyaId, kullaniciId: dbUser.id, eylem: `Taksit planı kuruldu · ${adet} taksit · toplam ${toplam} TL` } })
  } catch (e) {
    return { ok: false, error: `Plan kurulamadı: ${(e as Error).message}` }
  }
  revalidatePath(`/akilli-giris/${dosyaId}`)
  return { ok: true }
}

/** Bir taksiti "ödendi" işaretle → TakipOlayi(TAHSILAT) yaz; tüm taksitler bitince planı TAMAMLANDI + dosya TAHSIL. */
export async function taksitOdendi(taksitId: string): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  const t = await prisma.taksit.findUnique({
    where: { id: taksitId },
    include: { plan: { select: { id: true, dosyaId: true, taksitSayisi: true, dosya: { select: { musteriId: true } } } } },
  })
  if (!t || !izinli.includes(t.plan.dosya.musteriId)) return { ok: false, error: 'Taksit bulunamadı veya yetkiniz yok' }
  if (t.durum === 'ODENDI') return { ok: true }

  const dosyaId = t.plan.dosyaId
  const tutar = new Prisma.Decimal(t.tutar)
  const simdi = new Date()
  try {
    const olay = await prisma.takipOlayi.create({
      data: { dosyaId, tip: 'TAHSILAT', tutar, tarih: simdi, aciklama: `${t.sira}/${t.plan.taksitSayisi}. taksit tahsil edildi` },
    })
    await prisma.taksit.update({
      where: { id: taksitId },
      data: { durum: 'ODENDI', odenenTutar: tutar, odendiTarih: simdi, odemeId: olay.id },
    })
    // tüm taksitler ödendiyse planı + dosyayı kapat
    const kalan = await prisma.taksit.count({ where: { planId: t.plan.id, durum: { not: 'ODENDI' } } })
    if (kalan === 0) {
      await prisma.taksitPlani.update({ where: { id: t.plan.id }, data: { durum: 'TAMAMLANDI' } })
      await prisma.rucuDosyasi.update({ where: { id: dosyaId }, data: { durum: DosyaDurum.TAHSIL } })
      await prisma.aktivite.create({ data: { dosyaId, kullaniciId: dbUser.id, eylem: 'Taksit planı tamamlandı → dosya TAHSİL' } })
    } else {
      await prisma.aktivite.create({ data: { dosyaId, kullaniciId: dbUser.id, eylem: `${t.sira}/${t.plan.taksitSayisi}. taksit tahsil edildi (${tutar} TL)` } })
    }
  } catch (e) {
    return { ok: false, error: `Taksit işaretlenemedi: ${(e as Error).message}` }
  }
  revalidatePath(`/akilli-giris/${dosyaId}`)
  return { ok: true }
}

/** Taksit ödemesini geri al (yanlış işaretlendi) — bağlı TAHSILAT olayını sil, taksiti BEKLIYOR'a çek. */
export async function taksitOdemeGeriAl(taksitId: string): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  const t = await prisma.taksit.findUnique({
    where: { id: taksitId },
    include: { plan: { select: { id: true, dosyaId: true, durum: true, dosya: { select: { musteriId: true } } } } },
  })
  if (!t || !izinli.includes(t.plan.dosya.musteriId)) return { ok: false, error: 'Taksit bulunamadı veya yetkiniz yok' }
  if (t.durum !== 'ODENDI') return { ok: true }
  const dosyaId = t.plan.dosyaId
  try {
    if (t.odemeId) await prisma.takipOlayi.deleteMany({ where: { id: t.odemeId } })
    await prisma.taksit.update({ where: { id: taksitId }, data: { durum: 'BEKLIYOR', odenenTutar: null, odendiTarih: null, odemeId: null, gecikmeBildirildiAt: null } })
    // plan tamamlanmış sayıldıysa geri aç (dosya durumunu otomatik geri almıyoruz — avukat kararı)
    if (t.plan.durum === 'TAMAMLANDI') await prisma.taksitPlani.update({ where: { id: t.plan.id }, data: { durum: 'AKTIF' } })
    await prisma.aktivite.create({ data: { dosyaId, kullaniciId: dbUser.id, eylem: `${t.sira}. taksit ödemesi geri alındı` } })
  } catch (e) {
    return { ok: false, error: `Geri alınamadı: ${(e as Error).message}` }
  }
  revalidatePath(`/akilli-giris/${dosyaId}`)
  return { ok: true }
}

/** Taksit planını iptal et (anlaşma bozuldu / yanlış kuruldu). Ödenen tahsilatlar dosyada kalır. */
export async function taksitPlaniIptal(planId: string): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  const plan = await prisma.taksitPlani.findUnique({ where: { id: planId }, select: { dosyaId: true, dosya: { select: { musteriId: true } } } })
  if (!plan || !izinli.includes(plan.dosya.musteriId)) return { ok: false, error: 'Plan bulunamadı veya yetkiniz yok' }
  await prisma.taksitPlani.update({ where: { id: planId }, data: { durum: 'IPTAL' } })
  await prisma.aktivite.create({ data: { dosyaId: plan.dosyaId, kullaniciId: dbUser.id, eylem: 'Taksit planı iptal edildi' } })
  revalidatePath(`/akilli-giris/${plan.dosyaId}`)
  return { ok: true }
}
