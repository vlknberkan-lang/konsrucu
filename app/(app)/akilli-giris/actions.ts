'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Prisma, BelgeKategori, DosyaDurum, Yol, Brans, BorcluRol, TeyitDurum, CiktiTip } from '@prisma/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { prisma } from '@/lib/prisma'
import { analizEt, enIyiHasarFotolari } from '@/lib/konsrucu/analiz'
import { dosyaLimitKontrol } from '@/lib/konsrucu/ai-kredi'
import { mentorKurallariOku, mentorKurallariMetne } from '@/lib/konsrucu/mentor-kural'
import { takipOlayKaydet } from '@/lib/konsrucu/takip-olay'
import { onemliOlayDosyadanTamamla } from '@/lib/konsrucu/onemli-olay'
import { faizHesapla, oranlariOku, sonDekontTarihi, type DekontGirdi } from '@/lib/konsrucu/faiz'
import { yetkiliIcraOner } from '@/lib/konsrucu/adli-rehber'
import { aciklamaUret } from '@/lib/konsrucu/takip'
import { kanonik, paraTR, tarihTR } from '@/lib/import/hugo'
import { dilekceMetni, type DilekceGirdi } from '@/lib/konsrucu/dilekce'
import { dilekceAnlatim } from '@/lib/konsrucu/dilekce-ai'
import { taksitProgrami } from '@/lib/konsrucu/taksit'
import { dosyadanEmsal } from '@/lib/konsrucu/emsal-ara'
import { sayiTR } from '@/lib/konsrucu/sayi'
import { ileriMi, dosyaDurumIlerlet } from '@/lib/konsrucu/durum'
import { silebilir, SILME_YETKISI_YOK } from '@/lib/konsrucu/db'
import { idariYolOnaylayabilir, idariYolaAlinabilirMi, idariYolAktiviteMetni, IDARI_YOL_YETKI_YOK } from '@/lib/konsrucu/idari-yol'
import { eskiDilekceHattiAcik, gorselAiAcik, yuzeyAcik, GORSEL_KAPALI_MESAJI, KVKK_KAPALI_MESAJI } from '@/lib/ai/bayrak'
import { gorselAdaylari, gorselAktiviteMetni } from '@/lib/ai/gorsel-aday'
import { aiKapiHatasiMi } from '@/lib/ai/cagri'
import { ELLE_YUKLEME_METIN_SINIRI, metniSinirla } from '@/lib/konsrucu/evrak-metin/ortak'
import {
  cikarimBirlestir, alanOnerisiBul, alanOnerisiniKaldir, dekontOnerisiBul, dekontOnerisiniKaldir,
  ayniDeger, degerOku, dekontAnahtari, ALAN_ETIKET, ALANLAR, type AlanAdi, type YazilacakAnahtar,
} from '@/lib/konsrucu/cikarim-birlestir'

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

/** LLM'den gelen tutarı güvenle Decimal'e çevir (sayı/string/biçimli gelebilir; bozuksa null).
 *  Parse tek kaynak: lib/konsrucu/sayi.sayiTR (iki formatı da çözer). */
function guvenliDecimal(v: unknown): Prisma.Decimal | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : sayiTR(v)
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
  const [ayarlar, mentorKurallar] = await Promise.all([
    prisma.ayarlar.findUnique({ where: { musteriId }, select: { aciklamaFooter: true, alacakliUnvan: true } }),
    mentorKurallariOku(musteriId),
  ])
  await dosyaLimitKontrol(musteriId) // FREE plan: 20 aktif dosya kapısı
  // S09: yeni dosyada bilinen kayıt yok → maskeleme desen + etiket sezgisiyle; görsel gönderilmez.
  let aiHata: string | null = null
  let jetonUyarisi = null as string | null // S09 kırmızı kapı: yanıtta açılamayan jeton kaldı
  const analiz = payload.metin
    ? await analizEt(payload.metin, {
        footer: ayarlar?.aciklamaFooter ?? undefined, ogrenilenKurallar: mentorKurallariMetne(mentorKurallar),
        alacakliUnvan: ayarlar?.alacakliUnvan ?? null, onHata: (m) => { aiHata = m }, onUyari: (u) => { jetonUyarisi = u }, ai: { musteriId },
      })
    : null

  // S06 (F18; B12): AI'ın yol önerisi DURUMU DEĞİŞTİRMEZ — "idari" dese de dosya İNCELENİYOR açılır. Öneri
  // yol/yolGuven/yolNeden alanlarında kalır; İDARİ_YOL'a yalnız avukat geçirir (idariYolaAl, Dosya Detay bandı).
  const durum: DosyaDurum = DosyaDurum.INCELENIYOR
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
            ? `Yığın işlendi + asistan analizi → ${analiz.yol} önerisi (güven ${(analiz.yolGuven * 100) | 0}%)${analiz.yol === 'idari' ? ' · durum İnceleniyor, idari yol kararı avukatta' : ''}, ${analiz.borclular.length} borçlu${jetonUyarisi ? ` · ⚠ ${jetonUyarisi}` : ''}`
            : `Yığın işlendi → dosya oluştu (${payload.dosyalar.length} belge, yerel çıkarım)${aiHata ? ` · AI çıkarımı yapılmadı: ${aiHata}` : ''}`,
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

  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true, durum: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) redirect('/akilli-giris')

  await prisma.rucuDosyasi.update({
    where: { id: dosyaId },
    data: {
      icraDairesi: daire || null,
      icraDosyaNo: icraDosyaNo || null,
      takipTarihi: tarihStr ? new Date(tarihStr) : null,
      // yalnız ileri yön: TEBLIG_EDILDI/DAVA'daki dosyada icra bilgisi düzeltmek durumu geri çekmesin
      durum: ileriMi(dosya.durum, DosyaDurum.TAKIP_ACILDI) ? DosyaDurum.TAKIP_ACILDI : undefined,
    },
  })
  await prisma.aktivite.create({
    data: { dosyaId, kullaniciId: dbUser.id, eylem: `Takip açıldı & eşleştirildi: ${icraDosyaNo || '—'} · ${daire || '—'}` },
  })

  revalidatePath(`/akilli-giris/${dosyaId}`)
}

// ───────────────── S07 · yeniden çıkarım koruması: alan okuma/yazma yardımcıları ─────────────────

/** Birleştiricinin karşılaştırdığı kolonlar (aciklama cikarimJson'dadır). */
const ALAN_SELECT = {
  yol: true, brans: true, sigortaliUnvan: true, sigortaliTelefon: true, sigortaliPlaka: true, karsiPlaka: true,
  il: true, kazaYeri: true, olusSekli: true, kusurDurumu: true, asilAlacak: true, rucuTutari: true, rucuOrani: true,
  yetkiliIcra: true, muhatapOzet: true,
} as const

type AlanKaydi = Prisma.RucuDosyasiGetPayload<{ select: typeof ALAN_SELECT }>

/** DB kaydı → birleştiricinin saf alan değerleri (Decimal → sayı). */
function mevcutAlanlar(d: AlanKaydi): Partial<Record<Exclude<AlanAdi, 'aciklama'>, unknown>> {
  const o: Partial<Record<Exclude<AlanAdi, 'aciklama'>, unknown>> = {}
  for (const k of Object.keys(ALAN_SELECT) as (keyof typeof ALAN_SELECT)[]) o[k] = d[k]
  o.asilAlacak = d.asilAlacak != null ? Number(d.asilAlacak) : null
  o.rucuTutari = d.rucuTutari != null ? Number(d.rucuTutari) : null
  return o
}

/** Kolon karşılığı olan yazılabilir anahtarlar (beyaz liste — öneri JSON'undan gelen anahtar kolona körlemesine gitmez). */
const YAZILABILIR = new Set<string>([...ALANLAR.filter((a) => a !== 'aciklama'), 'yolGuven', 'yolNeden'])

/** Birleştiricinin saf değerleri → Prisma update verisi (para → Decimal, enum doğrulanır, bilinmeyen anahtar atlanır). */
function alanVerisi(yaz: Partial<Record<YazilacakAnahtar, string | number | null>>): Prisma.RucuDosyasiUpdateInput {
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(yaz)) {
    if (v == null || !YAZILABILIR.has(k)) continue
    if (k === 'asilAlacak' || k === 'rucuTutari') { const d = guvenliDecimal(v); if (d) data[k] = d }
    else if (k === 'yol') { if (typeof v === 'string' && v in Yol) data.yol = v as Yol }
    else if (k === 'brans') { if (typeof v === 'string' && v in Brans) data.brans = v as Brans }
    else if (k === 'yolGuven') { if (typeof v === 'number' && Number.isFinite(v)) data.yolGuven = v }
    else data[k] = String(v)
  }
  return data as Prisma.RucuDosyasiUpdateInput
}

/** Öneri değerini ekranda/aktivitede göstermek için kısa metin. */
function oneriMetni(alan: AlanAdi, v: string | number): string {
  if (alan === 'asilAlacak' || alan === 'rucuTutari') return `${Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
  const s = String(v).replace(/\s+/g, ' ').trim()
  return s.length > 80 ? `${s.slice(0, 77)}…` : s
}

/** "AI ile Çıkarım Yap": dosyanın belge metnini bizim AI'ya (analizEt) verir, sonucu dosyayla BİRLEŞTİRİR.
 *  S07 (F13; B36, B37) — yeniden çıkarım koruması (lib/konsrucu/cikarim-birlestir):
 *   - yalnız BOŞ alan yazılır; dolu alanda farklı değer cikarimJson.oneriler.alanlar'a gider ([Uygula]);
 *   - cikarimJson birleştirilir: tevzi, dayanakFotoIds ve öteki anahtarlar korunur;
 *   - borçlu SİLİNMEZ; mevcutla eşleşmeyen AI borçlusu teyitsiz eklenir;
 *   - AI dekontları Odeme'ye YAZILMAZ, cikarimJson.oneriler.dekontlar'a gider ([Ödemeye ekle]);
 *     faizBaslangic değişmez. */
export async function aiCikar(dosyaId: string): Promise<{ ok: boolean; error?: string; korunanBorclu?: number; oneriSayisi?: number; uyari?: string }> {
  const { dbUser, izinli } = await ctx()
  const dosya = await prisma.rucuDosyasi.findUnique({
    where: { id: dosyaId },
    select: {
      musteriId: true, durum: true, cikarimJson: true, ...ALAN_SELECT,
      belgeler: { select: { extractedText: true, kategori: true, dosyaAdi: true, storagePath: true } },
      borclular: { select: { adUnvan: true, tcVkn: true, telefon: true, teyitDurumu: true }, orderBy: { id: 'asc' } },
      odemeler: { select: { tarih: true, tutar: true, haricMi: true } },
    },
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

  // GÖRSELLER (S02/S09; 06, 5.5): çıkarım GÖRSELSİZ çalışır — görüntü maskelenemez. Sağlık ve kimlik
  // görselleri (alkol raporu, ehliyet, ruhsat, kimlik) hiçbir zaman, ötekiler KVKK kararına kadar gitmez.
  // Aday listesi yalnız Aktivite'deki "0 görsel gönderildi (N görsel KVKK nedeniyle atlandı)" satırı için.
  const gorselDurumu = gorselAdaylari(dosya.belgeler, { gorselAcik: false })
  const gorselNotu = gorselAktiviteMetni(gorselDurumu, 0)

  const [ayarlar, mentorKurallar] = await Promise.all([
    prisma.ayarlar.findUnique({ where: { musteriId: dosya.musteriId }, select: { aciklamaFooter: true, alacakliUnvan: true } }),
    mentorKurallariOku(dosya.musteriId),
  ])
  let aiHata: string | null = null
  let jetonUyarisi = null as string | null // S09 kırmızı kapı: yanıtta açılamayan jeton kaldı (Aktivite'ye yazılır)
  const analiz = await analizEt(metin, {
    footer: ayarlar?.aciklamaFooter ?? undefined, ogrenilenKurallar: mentorKurallariMetne(mentorKurallar),
    alacakliUnvan: ayarlar?.alacakliUnvan ?? null, onHata: (m) => { aiHata = m }, onUyari: (u) => { jetonUyarisi = u },
    ai: { musteriId: dosya.musteriId, dosyaId },
    // bilinen kayıtlar DB sırasıyla → deterministik jetonlar ([KİŞİ-1] = ilk borçlu); yanıt sunucuda geri açılır
    maske: {
      kisiler: [...dosya.borclular.map((b) => b.adUnvan), dosya.sigortaliUnvan],
      kimlikler: dosya.borclular.map((b) => b.tcVkn),
      telefonlar: [...dosya.borclular.map((b) => b.telefon), dosya.sigortaliTelefon],
      plakalar: [dosya.sigortaliPlaka, dosya.karsiPlaka],
    },
  })
  if (!analiz) {
    const neden: string | null = aiHata
    // KVKK kapısı (S02/S09): kapalı yüzey mesajı olduğu gibi gösterilir; AI'a hiçbir şey gitmemiştir.
    if (neden === KVKK_KAPALI_MESAJI) return { ok: false, error: neden }
    return { ok: false, error: neden ? `AI çıkarımı başarısız: ${neden}` : 'AI çıkarımı sonuç vermedi (model yanıtı boş).' }
  }

  // Rücu oranını TUTARLARDAN deterministik türet (LLM yaya→%100 derken tutarı yarı verebiliyor).
  const aaNum = guvenliDecimal(analiz.asilAlacak), rtNum = guvenliDecimal(analiz.rucuTutari)
  let rucuOraniSon = analiz.rucuOrani || undefined
  if (aaNum && rtNum && Number(aaNum) > 0) {
    const oran = Math.round((Number(rtNum) / Number(aaNum)) * 100)
    if (oran > 0 && oran <= 100) rucuOraniSon = `%${oran}`
  }

  // yetkili icra = KAZA YERİ → Adlî Rehber'den bağlı adliye (deterministik; LLM önerisine fallback)
  const icraOneri = yetkiliIcraOner(analiz.kazaYeri || analiz.il, analiz.il)
  const yetkiliIcraSon = icraOneri?.icraDairesi || analiz.yetkiliIcra || undefined

  // S07 · BİRLEŞTİR (saf; lib/konsrucu/cikarim-birlestir): boş alan yazılır, dolu alanda farklı değer öneri olur;
  // cikarimJson korunarak birleşir (tevzi, dayanakFotoIds…); borçlu silinmez; AI dekontu öneri olur (Odeme'ye
  // yazılmaz, faizBaslangic değişmez). Mükerrer dekont (mevcut Odeme ya da bekleyen öneri) tekrar önerilmez.
  const birlesim = cikarimBirlestir({
    mevcut: {
      alanlar: mevcutAlanlar(dosya),
      cikarimJson: dosya.cikarimJson,
      borclular: dosya.borclular,
      odemeler: dosya.odemeler.map((o) => ({ tarih: o.tarih, tutar: o.tutar != null ? Number(o.tutar) : null })),
    },
    ai: {
      alanlar: {
        yol: yolDb(analiz.yol), brans: bransDb(analiz.brans),
        sigortaliUnvan: analiz.sigortaliUnvan, sigortaliTelefon: analiz.sigortaliTelefon,
        sigortaliPlaka: analiz.sigortaliPlaka, karsiPlaka: analiz.karsiPlaka,
        il: analiz.il, kazaYeri: analiz.kazaYeri, olusSekli: analiz.olusSekli, kusurDurumu: analiz.kusurDurumu,
        asilAlacak: aaNum != null ? Number(aaNum) : null, rucuTutari: rtNum != null ? Number(rtNum) : null,
        rucuOrani: rucuOraniSon, yetkiliIcra: yetkiliIcraSon, muhatapOzet: analiz.muhatapOzet,
        aciklama: analiz.aciklama,
      },
      yolGuven: analiz.yolGuven ?? null,
      yolNeden: analiz.yolNeden ?? null,
      analiz: {
        olayTuru: analiz.olayTuru ?? null,
        olayBaglami: analiz.olayBaglami ?? null,
        sonrakiAdimlar: analiz.sonrakiAdimlar ?? [],
        teyit: analiz.teyit ?? [],
        llm: {
          brans: analiz.brans ?? null, kazaYeri: analiz.kazaYeri ?? null, asilAlacak: analiz.asilAlacak ?? null,
          yetkiliIcra: analiz.yetkiliIcra ?? null, kusurDurumu: analiz.kusurDurumu ?? null, olusSekli: analiz.olusSekli ?? null,
        },
      },
      borclular: analiz.borclular ?? [],
      dekontlar: dekontlardanOdemeler(analiz.dekontlar),
    },
  })
  const { yeniBorclular } = birlesim
  const yazilanAlanlar = Object.keys(birlesim.yazilacak).filter((k) => k !== 'yolGuven' && k !== 'yolNeden')
  // yeniden çıkarımda eklenen borçlu hep TEYİTSİZ: AI "TEYIT_EDILDI" dese de avukat teyidi yerine geçmez
  const yeniBorcluTeyit = (t?: string): TeyitDurum => (t === TeyitDurum.SUPHE ? TeyitDurum.SUPHE : TeyitDurum.TEYIT_GEREK)

  try {
    await prisma.$transaction([
      prisma.rucuDosyasi.update({
        where: { id: dosyaId },
        data: {
          ...alanVerisi(birlesim.yazilacak),
          cikarimJson: birlesim.cikarimJson as Prisma.InputJsonValue,
          durum: dosya.durum === DosyaDurum.HAVUZDA ? DosyaDurum.INCELENIYOR : undefined,
          borclular: yeniBorclular.length
            ? {
                create: yeniBorclular.map((b) => ({
                  adUnvan: b.adUnvan, tcVkn: b.tcVkn || null, telefon: b.telefon || null, adres: b.adres || null,
                  rol: rolDb(b.rol), kaynak: b.kaynak || null, teyitDurumu: yeniBorcluTeyit(b.teyit),
                })),
              }
            : undefined,
        },
      }),
      prisma.aktivite.create({
        data: {
          dosyaId, kullaniciId: dbUser.id,
          eylem: `AI çıkarımı çalıştı → ${analiz.yol} önerisi (güven %${(analiz.yolGuven * 100) | 0}): ${yazilanAlanlar.length} boş alan dolduruldu, ` +
            `${birlesim.oneriler.length} farklı değer öneri listesinde, ${yeniBorclular.length} yeni borçlu (teyitsiz), ` +
            `${birlesim.dekontOnerileri.length} dekont öneride (ödemeye yazılmadı); mevcut ${dosya.borclular.length} borçlu korundu` +
            (birlesim.degisti ? ' · onay sıfırlandı' : '') +
            (gorselNotu ? ` · ${gorselNotu}` : '') +
            (jetonUyarisi ? ` · ⚠ ${jetonUyarisi}` : ''),
          detayJson: {
            tur: 'AI_CIKARIM_BIRLESTIR',
            yazilan: yazilanAlanlar,
            oneriAlanlari: birlesim.oneriler.map((o) => o.alan),
            dekontOnerisi: birlesim.dekontOnerileri.length,
            yeniBorclu: yeniBorclular.length,
            // S02: görsel sayıları (değer/ad yok) — "0 gönderildi, N KVKK nedeniyle atlandı"
            gorselGonderilen: 0,
            gorselKvkkAtlanan: gorselDurumu.hassas.length + gorselDurumu.kapali.length,
            gorselHassas: gorselDurumu.hassas.length,
            acilamayanJeton: !!jetonUyarisi,
          } as Prisma.InputJsonValue,
        },
      }),
    ])
  } catch (e) {
    return { ok: false, error: `Çıkarım yazılamadı: ${(e as Error).message}` }
  }

  revalidatePath(`/akilli-giris/${dosyaId}`)
  return { ok: true, korunanBorclu: dosya.borclular.length, oneriSayisi: birlesim.oneriler.length + birlesim.dekontOnerileri.length, ...(jetonUyarisi ? { uyari: jetonUyarisi } : {}) }
}

const GORUNTULEYEN_YAZAMAZ = 'Görüntüleyen rolü dosyada değişiklik yapamaz.'

/** cikarimJson nesnesinden avukat onayını düşür (takibe giden veri değişti). */
function onaysiz(cj: Record<string, unknown>): Record<string, unknown> {
  const yeni = { ...cj }
  delete yeni.onay
  return yeni
}

/** S07 · "AI farklı değer önerdi" → [Uygula]: öneriyi alana yazar, listeden düşürür, Aktivite'ye yazar.
 *  Alan öneriden sonra elle değiştiyse öneri bayattır: uygulanmaz, listeden düşer. Onay sıfırlanır. */
export async function aiOneriUygula(dosyaId: string, alan: string): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  if (dbUser.rol === 'GORUNTULEYEN') return { ok: false, error: GORUNTULEYEN_YAZAMAZ }
  if (!(alan in ALAN_ETIKET)) return { ok: false, error: 'Geçersiz alan' }
  const a = alan as AlanAdi
  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true, cikarimJson: true, ...ALAN_SELECT } })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }
  const oneri = alanOnerisiBul(dosya.cikarimJson, a)
  if (!oneri) return { ok: false, error: 'Öneri bulunamadı (başka biri uygulamış ya da kaldırmış olabilir). Sayfayı yenileyin.' }

  const cjObj = (dosya.cikarimJson && typeof dosya.cikarimJson === 'object' && !Array.isArray(dosya.cikarimJson) ? dosya.cikarimJson : {}) as Record<string, unknown>
  const guncel = a === 'aciklama' ? cjObj.aciklama : mevcutAlanlar(dosya)[a]
  const cjYeni = alanOnerisiniKaldir(dosya.cikarimJson, a)
  if (!ayniDeger(a, guncel, oneri.mevcut)) {
    await prisma.rucuDosyasi.update({ where: { id: dosyaId }, data: { cikarimJson: cjYeni as Prisma.InputJsonValue } })
    revalidatePath(`/akilli-giris/${dosyaId}`)
    return { ok: false, error: `${ALAN_ETIKET[a]} öneriden sonra değişti; öneri bayatladı ve listeden kaldırıldı.` }
  }

  const deger = degerOku(a, oneri.onerilen)
  if (deger == null) return { ok: false, error: 'Öneri değeri okunamadı' }
  const cjSon = onaysiz(a === 'aciklama' ? { ...cjYeni, aciklama: String(deger) } : cjYeni)
  const kolon = a === 'aciklama'
    ? {}
    : alanVerisi({ [a]: deger, ...(a === 'yol' && oneri.ek ? { yolGuven: oneri.ek.yolGuven, yolNeden: oneri.ek.yolNeden } : {}) })
  try {
    await prisma.$transaction([
      prisma.rucuDosyasi.update({ where: { id: dosyaId }, data: { ...kolon, cikarimJson: cjSon as Prisma.InputJsonValue } }),
      prisma.aktivite.create({
        data: {
          dosyaId, kullaniciId: dbUser.id,
          eylem: `AI önerisi uygulandı · ${ALAN_ETIKET[a]}: ${oneriMetni(a, oneri.mevcut)} → ${oneriMetni(a, oneri.onerilen)} (onay sıfırlandı)`,
          detayJson: { tur: 'AI_ONERI_UYGULA', alan: a, mevcut: oneri.mevcut, onerilen: oneri.onerilen, oneriZamani: oneri.zaman } as Prisma.InputJsonValue,
        },
      }),
    ])
  } catch (e) {
    return { ok: false, error: `Öneri uygulanamadı: ${(e as Error).message}` }
  }
  revalidatePath(`/akilli-giris/${dosyaId}`)
  return { ok: true }
}

/** S07 · AI dekont önerisi → [Ödemeye ekle]: Odeme kaydı açar (aynı gün+tutar varsa açmaz), öneriyi düşürür.
 *  faizBaslangic alanına DOKUNMAZ (elle girilmişse korunur; boşsa faiz paneli son dekontu kendisi hesaplar). */
export async function aiDekontOdemeyeEkle(dosyaId: string, anahtar: string): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  if (dbUser.rol === 'GORUNTULEYEN') return { ok: false, error: GORUNTULEYEN_YAZAMAZ }
  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true, cikarimJson: true, odemeler: { select: { tarih: true, tutar: true } } } })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }
  const d = dekontOnerisiBul(dosya.cikarimJson, anahtar)
  if (!d) return { ok: false, error: 'Dekont önerisi bulunamadı. Sayfayı yenileyin.' }
  const zatenVar = dosya.odemeler.some((o) => dekontAnahtari(o.tarih, o.tutar != null ? Number(o.tutar) : null) === d.anahtar)
  const cjSon = onaysiz(dekontOnerisiniKaldir(dosya.cikarimJson, anahtar))
  const tutarMetni = `${d.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
  try {
    await prisma.$transaction([
      ...(zatenVar
        ? []
        : [prisma.odeme.create({ data: { dosyaId, tarih: d.tarih ? new Date(d.tarih) : null, tutar: new Prisma.Decimal(d.tutar), haricMi: d.haricMi, aciklama: d.aciklama } })]),
      prisma.rucuDosyasi.update({ where: { id: dosyaId }, data: { cikarimJson: cjSon as Prisma.InputJsonValue } }),
      prisma.aktivite.create({
        data: {
          dosyaId, kullaniciId: dbUser.id,
          eylem: zatenVar
            ? `AI dekont önerisi zaten ödeme listesinde: ${d.tarih ?? 'tarihsiz'} · ${tutarMetni} (öneri kaldırıldı)`
            : `AI dekontu ödemeye eklendi: ${d.tarih ?? 'tarihsiz'} · ${tutarMetni}${d.haricMi ? ' (ekspertiz, faize dahil değil)' : ''} — faiz başlangıcı alanı değiştirilmedi (onay sıfırlandı)`,
          detayJson: { tur: 'AI_DEKONT_ODEME', anahtar: d.anahtar, tarih: d.tarih, tutar: d.tutar, haricMi: d.haricMi, eklendi: !zatenVar } as Prisma.InputJsonValue,
        },
      }),
    ])
  } catch (e) {
    return { ok: false, error: `Dekont eklenemedi: ${(e as Error).message}` }
  }
  revalidatePath(`/akilli-giris/${dosyaId}`)
  return { ok: true }
}

/** S07 · Öneriyi yoksay: listeden düşürür (veri değişmez → onay korunur), Aktivite'ye yazar. */
export async function aiOneriYoksay(dosyaId: string, tur: 'alan' | 'dekont', anahtar: string): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  if (dbUser.rol === 'GORUNTULEYEN') return { ok: false, error: GORUNTULEYEN_YAZAMAZ }
  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true, cikarimJson: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }
  const alanO = tur === 'alan' ? alanOnerisiBul(dosya.cikarimJson, anahtar) : null
  const dekontO = tur === 'dekont' ? dekontOnerisiBul(dosya.cikarimJson, anahtar) : null
  if (!alanO && !dekontO) return { ok: false, error: 'Öneri bulunamadı. Sayfayı yenileyin.' }
  const cjSon = alanO ? alanOnerisiniKaldir(dosya.cikarimJson, anahtar) : dekontOnerisiniKaldir(dosya.cikarimJson, anahtar)
  await prisma.$transaction([
    prisma.rucuDosyasi.update({ where: { id: dosyaId }, data: { cikarimJson: cjSon as Prisma.InputJsonValue } }),
    prisma.aktivite.create({
      data: {
        dosyaId, kullaniciId: dbUser.id,
        eylem: alanO
          ? `AI önerisi yoksayıldı · ${ALAN_ETIKET[alanO.alan]}: ${oneriMetni(alanO.alan, alanO.onerilen)} (mevcut değer korundu)`
          : `AI dekont önerisi yoksayıldı: ${dekontO!.tarih ?? 'tarihsiz'} · ${dekontO!.tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`,
      },
    }),
  ])
  revalidatePath(`/akilli-giris/${dosyaId}`)
  return { ok: true }
}

/** S06 (F18; B12) · "İdari yola al": AI'ın idari yol önerisini AVUKAT ya da ADMIN onaylar → durum İDARİ_YOL.
 *  Rol kontrolü SUNUCUDA (düğme gizli olsa da action doğrudan çağrılabilir). Yalnız takip öncesi dosya.
 *  Koşullu yazım (durum hâlâ okunan değer mi) çift tıklamayı ve eşzamanlı durum değişimini yakalar.
 *  Onay Aktivite'ye yazılır; `yolOnaylayanId` kolonu 003 SQL'iyle gelir (B1b) — o zamana kadar tek iz detayJson. */
export async function idariYolaAl(dosyaId: string): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  if (!idariYolOnaylayabilir(dbUser)) return { ok: false, error: IDARI_YOL_YETKI_YOK }
  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true, durum: true, yol: true, yolGuven: true, yolNeden: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }
  if (dosya.durum === DosyaDurum.IDARI_YOL) return { ok: false, error: 'Dosya zaten idari yolda.' }
  if (!idariYolaAlinabilirMi(dosya.durum)) return { ok: false, error: 'Takibi açılmış dosya idari yola alınamaz (yalnız takip öncesi dosyalar).' }

  try {
    const sonuc = await prisma.$transaction(async (tx) => {
      const g = await tx.rucuDosyasi.updateMany({
        where: { id: dosyaId, durum: dosya.durum },
        data: { durum: DosyaDurum.IDARI_YOL, yol: Yol.IDARI },
      })
      if (g.count === 0) return false
      await tx.aktivite.create({
        data: {
          dosyaId, kullaniciId: dbUser.id,
          eylem: idariYolAktiviteMetni({ yolGuven: dosya.yolGuven, yolNeden: dosya.yolNeden, oncekiDurum: dosya.durum }),
          detayJson: {
            tur: 'IDARI_YOL_ONAY', oncekiDurum: dosya.durum, aiYol: dosya.yol, yolGuven: dosya.yolGuven, yolNeden: dosya.yolNeden,
            onaylayanId: dbUser.id, onaylayanRol: dbUser.rol,
          } as Prisma.InputJsonValue,
        },
      })
      return true
    })
    if (!sonuc) return { ok: false, error: 'Dosyanın durumu bu sırada değişti; sayfayı yenileyip tekrar deneyin.' }
  } catch (e) {
    return { ok: false, error: `İdari yola alınamadı: ${(e as Error).message}` }
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

type EklenecekBelge = { dosyaAdi: string; kategori: string; guven?: number; extractedText: string | null; genislik?: number; yukseklik?: number; kamera?: string; exifTarih?: string; storagePath?: string; metinKesildi?: boolean }

/** Mevcut dosyaya manuel belge ekle (tarayıcıda çıkarılmış metin + meta ile). */
export async function belgeEkle(dosyaId: string, belgeler: EklenecekBelge[]): Promise<{ ok: boolean; error?: string; eklenen?: number }> {
  const { dbUser, izinli } = await ctx()
  if (!Array.isArray(belgeler) || belgeler.length === 0) return { ok: false, error: 'Eklenecek belge bulunamadı' }
  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { musteriId: true, durum: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya bu dosyada yetkiniz yok' }

  // S16 (B40): sınırı aşan metin SESSİZCE kesilmez — kesildiği metnin içinde yazar (tarayıcı da aynı sınırı uygular).
  let kesilen = 0
  const metinHazirla = (b: EklenecekBelge): string | null => {
    if (!b.extractedText) return null
    const k = metniSinirla(nulSuz(b.extractedText) ?? '', ELLE_YUKLEME_METIN_SINIRI)
    if (k.kesildi || b.metinKesildi === true) kesilen++
    return k.metin || null
  }
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.belge.createMany({
      data: belgeler.map((b) => ({
        dosyaId,
        kategori: katDb(b.kategori),
        confidence: b.guven ?? null,
        dosyaAdi: (nulSuz(b.dosyaAdi) ?? '').slice(0, 255),
        storagePath: nulSuz(b.storagePath) ?? '', // 'evrak' bucket'taki yol (bayt yüklendiyse)
        extractedText: metinHazirla(b),
        genislik: b.genislik ?? null,
        yukseklik: b.yukseklik ?? null,
        kamera: nulSuz(b.kamera),
        exifTarih: b.exifTarih ? new Date(b.exifTarih) : null,
      })),
    }),
    prisma.aktivite.create({ data: { dosyaId, kullaniciId: dbUser.id, eylem: `${belgeler.length} belge eklendi (yerel çıkarım)${kesilen ? ` · ${kesilen} belgenin metni boyut sınırında kesildi` : ''}` } }),
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

  try {
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
  } catch (e) {
    // unique(musteriId, hukukDosyaNo) kısıtı: elle girilen hukuk no başka dosyada kayıtlıysa dostça hata
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: `Bu hukuk dosya no (${str('hukukDosyaNo') ?? '—'}) bu şirkette başka bir dosyada zaten kayıtlı.` }
    }
    return { ok: false, error: `Kaydedilemedi: ${(e as Error).message}` }
  }
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
  // otomatik bitiş = İSTANBUL günü başı (saatli "şimdi" alınırsa TR 15:00 sonrası kayıtta gün
  // sayısı panel önizlemesinden 1 fazla çıkıyordu)
  const bitEt = fBitGirdi ?? new Date(new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10))
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

  // Dosya durumunu + (icra ise) mevcut alanları senkronla.
  // Kural (lib/konsrucu/durum): mevcut aşamayı DÜZENLEMEK yalnız ileri yönde günceller (ufak bir
  // düzeltme DAVA'daki dosyayı TAKIP_ACILDI'ya çekmesin); YENİ aşama açmak bilinçli evre kararıdır → zorla.
  if (tur === 'ICRA_TAKIBI') {
    await prisma.rucuDosyasi.update({
      where: { id: dosyaId },
      data: { icraDosyaNo: kimlikNo ?? undefined, icraDairesi: birim ?? undefined, takipTarihi: baslangic ?? undefined },
    })
    await dosyaDurumIlerlet(dosyaId, DosyaDurum.TAKIP_ACILDI)
  } else {
    const durumMap = { ARABULUCULUK: DosyaDurum.ARABULUCULUK, DAVA: DosyaDurum.DAVA, INFAZ: DosyaDurum.INFAZ } as const
    await dosyaDurumIlerlet(dosyaId, durumMap[tur], { zorla: !mevcut })
  }
  await prisma.aktivite.create({ data: { dosyaId, kullaniciId: dbUser.id, eylem: `${tur} aşaması kaydedildi${kimlikNo ? ' · ' + kimlikNo : ''}` } })

  // Dosya üzerinden arabuluculuk başlatıldıysa → açık önemli olayı da Tamamlanan'a geçir (kuyruktan kalksın).
  if (tur === 'ARABULUCULUK') {
    const kapatilan = await onemliOlayDosyadanTamamla({ dosyaId, basvuruNo: kimlikNo, basvuruTarihi: baslangic, kullaniciId: dbUser.id })
    if (kapatilan > 0) { revalidatePath('/onemli-olaylar'); revalidatePath('/tamamlanan-olaylar') }
  }
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
const ETKINLIK_DURUMLARI = ['PLANLANDI', 'YAPILDI', 'YAPILMADI', 'ERTELENDI', 'IPTAL'] as const

/** Takvim/dosya etkinliğini sil (tenant-kapsamlı + rol/bayrak kapılı). */
export async function etkinlikSil(formData: FormData): Promise<void> {
  const { dbUser, izinli } = await ctx()
  if (!silebilir(dbUser)) return // yetkisiz kullanıcıda buton işlevsizdir (void form action)
  const id = String(formData.get('id') ?? '')
  if (!id) return
  const etk = await prisma.etkinlik.findUnique({ where: { id }, select: { dosyaId: true, dosya: { select: { musteriId: true } } } })
  if (!etk || !izinli.includes(etk.dosya.musteriId)) return
  await prisma.etkinlik.delete({ where: { id } })
  revalidatePath(`/akilli-giris/${etk.dosyaId}`)
  revalidatePath('/takvim')
}

/** Etkinliği düzenle: tür/başlık/başlangıç-bitiş/yer/online/hatırlatma (tenant-kapsamlı).
 *  Başlangıç DEĞİŞİRSE hatırlatma damgası sıfırlanır — ertelenen toplantının yeni tarihi
 *  hatırlatmasız kalmasın (cron hatirlatmaGonderildiAt=null şartı arar). */
export async function etkinlikGuncelle(formData: FormData): Promise<void> {
  const { izinli } = await ctx()
  const id = String(formData.get('id') ?? '')
  if (!id) return
  const etk = await prisma.etkinlik.findUnique({ where: { id }, select: { dosyaId: true, baslar: true, dosya: { select: { musteriId: true } } } })
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
  const durumRaw = String(formData.get('durum') ?? '')
  const durum = (ETKINLIK_DURUMLARI as readonly string[]).includes(durumRaw) ? (durumRaw as (typeof ETKINLIK_DURUMLARI)[number]) : undefined
  const sonucNot = String(formData.get('sonucNot') ?? '').trim() || null
  // hatırlatma alanı formda VARSA güncellenir (boş "—" = hatırlatma kapalı); yoksa mevcut değer korunur
  const hatirlatmaHam = formData.get('hatirlatmaDk')
  const hatirlatmaDkNum = Number(hatirlatmaHam)
  const hatirlatmaDk = hatirlatmaHam == null ? undefined : Number.isFinite(hatirlatmaDkNum) && hatirlatmaDkNum > 0 ? Math.round(hatirlatmaDkNum) : null
  if (!ETKINLIK_TURLERI.includes(tur) || !baslik || !baslar || Number.isNaN(baslar.getTime())) return
  const baslarDegisti = etk.baslar.getTime() !== baslar.getTime()
  await prisma.etkinlik.update({
    where: { id },
    data: {
      tur, baslik, baslar, biter, yer, online, sonucNot,
      ...(durum ? { durum } : {}),
      ...(hatirlatmaDk !== undefined ? { hatirlatmaDk } : {}),
      ...(baslarDegisti ? { hatirlatmaGonderildiAt: null } : {}),
    },
  })
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
  // Geçerli "YYYY/N" değilse '' → icraDosyaNo doldurulmaz, durum TAKIP_ACILDI'ya geçmez (yanlış-açılma fix).
  const esasNo = (s: string) => { const m = s.match(/((?:19|20)\d{2})\s*\/\s*(\d{1,7})/); return m ? `${m[1]}/${m[2]}` : '' }

  // Yalnız AKTİF şirket (cookie) kapsamı: aynı hukuk no iki tenant'ta da varsa (Ray + Zurich)
  // izinli-listesi araması yanlış şirketin dosyasına yazabilirdi.
  const aktifCookie = cookies().get('aktif_musteri')?.value
  const aktifMusteriId = aktifCookie && izinli.includes(aktifCookie) ? aktifCookie : izinli[0]
  if (!aktifMusteriId) return { ok: false, eslesen: 0, bulunamayan: [], toplam: rows.length, hata: 'Aktif müşteri seçili değil' }

  let eslesen = 0
  const bulunamayan: string[] = []
  for (const row of rows) {
    const hukukNo = kolon(row, ['hukuk', 'dosyano', 'dosya'])
    const icraNo = esasNo(kolon(row, ['icrano', 'icradosya', 'esas', 'takipno']))
    const daire = kolon(row, ['daire', 'icradairesi', 'birim', 'mudurluk', 'müdürlük'])
    if (!hukukNo) continue
    const dosya = await prisma.rucuDosyasi.findFirst({ where: { hukukDosyaNo: hukukNo, musteriId: aktifMusteriId }, select: { id: true, durum: true } })
    if (!dosya) { bulunamayan.push(hukukNo); continue }
    // durum yalnız ileri yönde: toplu eşleştirme, DAVA/KESINLESTI'deki dosyayı TAKIP_ACILDI'ya geri çekmesin
    await prisma.rucuDosyasi.update({ where: { id: dosya.id }, data: { icraDosyaNo: icraNo || undefined, icraDairesi: daire || undefined, durum: icraNo && ileriMi(dosya.durum, DosyaDurum.TAKIP_ACILDI) ? DosyaDurum.TAKIP_ACILDI : undefined } })
    if (icraNo) { // İcra aşamasını YALNIZ geçerli icra no varsa aç (daire tek başına stage açmaz → yanlış-açılma fix)
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
  // İcra ESAS no YALNIZ geçerli "YYYY/N" biçimindeyse kabul edilir; aksi halde null.
  // (Eskiden ham metni döndürüyordu → "—"/"açılacak"/not gibi dolu hücreler icraDosyaNo'yu doldurup
  //  dosyayı yanlışlıkla TAKIP_ACILDI yapıyordu. Bkz. bug: import sonrası takip-açılmış görünme.)
  const esas = (v: unknown) => { const s = txt(v); if (!s) return null; const m = s.match(/((?:19|20)\d{2})\s*\/\s*(\d{1,7})/); return m ? `${m[1]}/${m[2]}` : null }
  const tel = (v: unknown) => { const s = String(v ?? ''); const d = s.replace(/\D/g, ''); return d.length >= 10 && d.length <= 12 ? s.trim().slice(0, 40) : null }

  // Yalnız AKTİF şirket (cookie) kapsamı — çapraz tenant yazımına karşı (bkz. icraEslestir).
  const aktifCookie = cookies().get('aktif_musteri')?.value
  const aktifMusteriId = aktifCookie && izinli.includes(aktifCookie) ? aktifCookie : izinli[0]
  if (!aktifMusteriId) return { ...bos, hata: 'Aktif müşteri seçili değil' }

  let eslesen = 0, borcluEklenen = 0
  const bulunamayan: string[] = []
  for (const row of rows) {
    const r = norm(row)
    const hukukNo = txt(r.hukukNo)
    if (!hukukNo) continue
    const dosya = await prisma.rucuDosyasi.findFirst({
      where: { hukukDosyaNo: hukukNo, musteriId: aktifMusteriId },
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
    if (icraNo) { // İcra aşamasını YALNIZ geçerli icra no varsa aç (yalnız daire → stage açmaz → yanlış-açılma fix)
      const mevcut = await prisma.asama.findFirst({ where: { dosyaId: dosya.id, tur: 'ICRA_TAKIBI' } })
      if (!mevcut) { const max = await prisma.asama.aggregate({ where: { dosyaId: dosya.id }, _max: { sira: true } }); await prisma.asama.create({ data: { dosyaId: dosya.id, tur: 'ICRA_TAKIBI', kimlikNo: icraNo, birim: icraDaire ?? null, sira: (max._max.sira ?? 0) + 1 } }) }
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

/** Borçlu sil. Onay sıfırlanır. Rol/bayrak kapılı. */
export async function borcluSil(borcluId: string): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  if (!silebilir(dbUser)) return { ok: false, error: SILME_YETKISI_YOK }
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

/** Takip süreci olayını sil. Rol/bayrak kapılı. */
export async function olaySil(olayId: string): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  if (!silebilir(dbUser)) return { ok: false, error: SILME_YETKISI_YOK }
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

/**
 * Mentor geri bildirimi → öğrenilen kural. Avukat, AI'ın "Önerilen Adımlar"/"Riskler ve Öneriler"
 * çıktısını düzeltir; kural tenant'a yazılır ve sonraki çıkarımlarda sistem promptuna enjekte edilir.
 * geneleUygula=false ise kural yalnız bu dosyanın olay türünde geçerli olur.
 */
export async function mentorKuralEkle(p: {
  dosyaId: string
  kaynak: 'ADIM' | 'TEYIT'
  tur: 'KALDIR' | 'DUZELT'
  hedef?: string
  yorum?: string
  geneleUygula?: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  const dosya = await prisma.rucuDosyasi.findUnique({ where: { id: p.dosyaId }, select: { musteriId: true, cikarimJson: true } })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }

  const kaynak = p.kaynak === 'TEYIT' ? 'TEYIT' : 'ADIM'
  const tur = p.tur === 'DUZELT' ? 'DUZELT' : 'KALDIR'
  const hedef = (p.hedef ?? '').trim().slice(0, 1000) || null
  const yorum = (p.yorum ?? '').trim().slice(0, 2000)
  // DÜZELT yönerge ister; KALDIR'da yorum yoksa hedeften türet (en azından "şunu kaldır" bağlamı kalsın).
  if (tur === 'DUZELT' && !yorum) return { ok: false, error: 'Düzeltme için bir yönerge yazın.' }
  if (!yorum && !hedef) return { ok: false, error: 'Geri bildirim boş olamaz.' }

  const cj = (dosya.cikarimJson ?? {}) as { olayTuru?: string | null }
  const olayTuru = p.geneleUygula ? null : (typeof cj.olayTuru === 'string' && cj.olayTuru.trim() ? cj.olayTuru.trim().slice(0, 200) : null)

  await prisma.mentorKural.create({
    data: { musteriId: dosya.musteriId, kaynak, tur, hedef, yorum: yorum || (hedef ?? ''), olayTuru, dosyaId: p.dosyaId, kullaniciId: dbUser.id },
  })
  await prisma.aktivite.create({
    data: { dosyaId: p.dosyaId, kullaniciId: dbUser.id, eylem: `Mentor'a kural öğretildi (${tur === 'KALDIR' ? 'bu öneriyi verme' : 'düzeltme'}${olayTuru ? `; yalnız "${olayTuru}"` : '; tüm dosyalar'})` },
  })
  revalidatePath(`/akilli-giris/${p.dosyaId}`)
  return { ok: true }
}

/** İcra dayanağı: hasar fotoğrafları arasından AI vision ile araçtaki hasarın en net göründüğü 2'yi seçip cikarimJson.dayanakFotoIds'e yazar. */
export async function hasarFotoSecAI(dosyaId: string): Promise<{ ok: boolean; secilen?: string[]; error?: string }> {
  const { dbUser, izinli } = await ctx()
  // KVKK kapısı (S02/S09; 06, 5.5): görüntü maskelenemez — görsel AI (AI_GORSEL) ve 'foto' yüzeyi açık
  // değilse fotoğraf indirilmez, hiçbir şey gönderilmez; seçim elle yapılır.
  if (!gorselAiAcik() || !yuzeyAcik('foto')) return { ok: false, error: `${GORSEL_KAPALI_MESAJI} İcra dayanağı hasar fotoğraflarını elle seçin.` }
  const dosya = await prisma.rucuDosyasi.findUnique({
    where: { id: dosyaId },
    select: { musteriId: true, cikarimJson: true, belgeler: { where: { kategori: BelgeKategori.HASAR_FOTO }, select: { id: true, storagePath: true, dosyaAdi: true, kategori: true } } },
  })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }
  // Yanlış sınıflanmış kimlik/ehliyet/sağlık görseli (dosya adından) HASAR_FOTO olsa da gönderilmez.
  const adaylar = gorselAdaylari(dosya.belgeler, { gorselAcik: true, kategoriler: new Set(['HASAR_FOTO']) }).gonderilecek
  if (!adaylar.length) return { ok: false, error: 'Dosyada yapay zekâya gönderilebilecek hasar fotoğrafı yok' }

  const admin = createAdminClient()
  const gorseller: { mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; b64: string }[] = []
  const idMap: string[] = []
  for (const b of adaylar) {
    if (gorseller.length >= 12) break
    try {
      const { data, error } = await admin.storage.from('evrak').download(b.storagePath as string)
      if (error || !data) continue
      const buf = Buffer.from(await data.arrayBuffer())
      const mime = imgMime(buf)
      if (!mime || buf.length > 4_500_000) continue
      gorseller.push({ mime, b64: buf.toString('base64') })
      idMap.push(b.id)
    } catch { /* görsel atlanır */ }
  }
  if (!gorseller.length) return { ok: false, error: 'Fotoğraflar indirilemedi ya da uygun biçimde değil' }

  let fotoHata: string | null = null
  const idx = await enIyiHasarFotolari(gorseller, 2, { musteriId: dosya.musteriId, dosyaId }, (m) => { fotoHata = m })
  if (idx == null) return { ok: false, error: fotoHata ?? 'AI seçim sonucu vermedi (API anahtarı yok ya da yanıt boş).' }
  const secilen = idx.map((i) => idMap[i]).filter(Boolean)

  const cj = (dosya.cikarimJson && typeof dosya.cikarimJson === 'object' && !Array.isArray(dosya.cikarimJson) ? { ...(dosya.cikarimJson as object) } : {}) as Record<string, unknown>
  cj.dayanakFotoIds = secilen
  await prisma.rucuDosyasi.update({ where: { id: dosyaId }, data: { cikarimJson: cj as Prisma.InputJsonValue } })
  await prisma.aktivite.create({ data: { dosyaId, kullaniciId: dbUser.id, eylem: `İcra dayanağı: AI ${secilen.length} hasar fotoğrafı seçti` } })
  revalidatePath(`/akilli-giris/${dosyaId}`)
  return { ok: true, secilen }
}

/** Bir EmsalKarar'ı dilekçeye yazılacak atıf cümlesine çevir. */
function emsalAtif(e: { daire: string; kararTarihi: string; esasNo: string; kararNo: string; alaka: string }): string {
  return `T.C. Yargıtay ${e.daire}'nin ${e.kararTarihi} tarihli, E. ${e.esasNo} K. ${e.kararNo} sayılı kararı uyarınca; ${e.alaka}`
}

/**
 * Talep-anında Yargıtay emsali bul: dosya bağlamından (olay/branş/kusur) canlı arar, AI ile süzer,
 * EmsalKarar olarak kaydeder (yargitayId ile dedup → korpus organik birikir). Dava sekmesi butonu.
 */
export async function emsalBul(dosyaId: string): Promise<{ ok: boolean; error?: string; kelime?: string; eklenen?: number }> {
  const { dbUser, izinli } = await ctx()
  if (!yuzeyAcik('emsal')) return { ok: false, error: KVKK_KAPALI_MESAJI } // S02/S09 KVKK kapısı
  const dosya = await prisma.rucuDosyasi.findUnique({
    where: { id: dosyaId },
    select: {
      id: true, musteriId: true, brans: true, kusurDurumu: true, cikarimJson: true,
      // yalnız maskeleme için: olay bağlamındaki ad/plaka jetonlanır (S09)
      sigortaliUnvan: true, sigortaliPlaka: true, karsiPlaka: true, borclular: { select: { adUnvan: true }, orderBy: { id: 'asc' } },
    },
  })
  if (!dosya || !izinli.includes(dosya.musteriId)) return { ok: false, error: 'Dosya bulunamadı veya yetkiniz yok' }
  const cj = (dosya.cikarimJson ?? {}) as { olayBaglami?: string | null; olayTuru?: string | null }
  try {
    const { kelime, emsaller } = await dosyadanEmsal({
      olayBaglami: cj.olayBaglami ?? null, olayTuru: cj.olayTuru ?? null, brans: dosya.brans ?? null, kusurDurumu: dosya.kusurDurumu ?? null,
    }, 4, { musteriId: dosya.musteriId, dosyaId }, {
      kisiler: [...dosya.borclular.map((b) => b.adUnvan), dosya.sigortaliUnvan],
      plakalar: [dosya.sigortaliPlaka, dosya.karsiPlaka],
    })
    if (!emsaller.length) return { ok: true, kelime, eklenen: 0 }
    for (const e of emsaller) {
      await prisma.emsalKarar.upsert({
        where: { dosyaId_yargitayId: { dosyaId, yargitayId: e.id } },
        update: { alaka: e.alaka, metin: e.metin, aramaKelime: kelime }, // tekrar bulunduysa gerekçeyi tazele
        create: { dosyaId, yargitayId: e.id, daire: e.daire, esasNo: e.esasNo, kararNo: e.kararNo, kararTarihi: e.kararTarihi, alaka: e.alaka, metin: e.metin, aramaKelime: kelime },
      })
    }
    await prisma.aktivite.create({ data: { dosyaId, kullaniciId: dbUser.id, eylem: `Yargıtay emsali arandı ("${kelime}") — ${emsaller.length} karar` } })
    revalidatePath(`/akilli-giris/${dosyaId}`)
    return { ok: true, kelime, eklenen: emsaller.length }
  } catch (e) {
    if (aiKapiHatasiMi(e)) return { ok: false, error: e.message }
    console.error('emsalBul hata:', e instanceof Error ? e.name : 'bilinmeyen')
    return { ok: false, error: 'Yargıtay araması başarısız (kaynak geçici erişilemez olabilir).' }
  }
}

/** Emsalin dilekçeye dayanak olarak eklenip eklenmeyeceğini değiştir (checkbox). */
export async function emsalSecimDegistir(emsalId: string, secili: boolean): Promise<{ ok: boolean; error?: string }> {
  const { izinli } = await ctx()
  const e = await prisma.emsalKarar.findUnique({ where: { id: emsalId }, select: { id: true, dosyaId: true, dosya: { select: { musteriId: true } } } })
  if (!e || !izinli.includes(e.dosya.musteriId)) return { ok: false, error: 'Yetkiniz yok' }
  await prisma.emsalKarar.update({ where: { id: emsalId }, data: { secili } })
  revalidatePath(`/akilli-giris/${e.dosyaId}`)
  return { ok: true }
}

/** Emsali dosyadan kaldır. Rol/bayrak kapılı. */
export async function emsalSil(emsalId: string): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  if (!silebilir(dbUser)) return { ok: false, error: SILME_YETKISI_YOK }
  const e = await prisma.emsalKarar.findUnique({ where: { id: emsalId }, select: { id: true, dosyaId: true, dosya: { select: { musteriId: true } } } })
  if (!e || !izinli.includes(e.dosya.musteriId)) return { ok: false, error: 'Yetkiniz yok' }
  await prisma.emsalKarar.delete({ where: { id: emsalId } })
  revalidatePath(`/akilli-giris/${e.dosyaId}`)
  return { ok: true }
}

/** Dava dilekçesi taslağı üret: dosya verisi + faiz (takip çıkışı) + arabuluculuk + AI olay anlatımı → UretilenCikti TASLAK. */
export async function dilekceUret(dosyaId: string): Promise<{ ok: boolean; error?: string; metin?: string; ciktiId?: string }> {
  // Eski hat kapalı (denetim B05–B09, B18, B19): sabit olgu/atıf basıyordu. Dilekçeler Dilekçe Masası'ndan üretilir.
  // Yalnız bilinçli geri açma için: ESKI_DILEKCE_HATTI=acik
  if (!eskiDilekceHattiAcik()) { // bayrak tek yerde: lib/ai/bayrak.ts
    return { ok: false, error: "Bu eski üretim hattı kapatıldı. Dilekçeleri Dilekçe Masası'ndan hazırlayın." }
  }
  const { dbUser, izinli } = await ctx()
  const dosya = await prisma.rucuDosyasi.findUnique({
    where: { id: dosyaId },
    include: {
      borclular: { orderBy: { id: 'asc' } }, odemeler: true,
      belgeler: { select: { id: true, extractedText: true, kategori: true, dosyaAdi: true, storagePath: true } }, asamalar: true,
      emsaller: { where: { secili: true }, orderBy: { createdAt: 'asc' } },
    },
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

  // GÖRSELLER: gönderilmez (S02/S09) — ehliyet/ruhsat/alkol raporu gibi görüntüler maskelenemez.

  // dekont kalemleri (deterministik gösterim + AI'a ipucu)
  const dekontlar = dosya.odemeler.map((o) => ({ tarih: o.tarih ? o.tarih.toISOString().slice(0, 10) : null, tutar: o.tutar != null ? Number(o.tutar) : null, aciklama: o.aciklama ?? null, haricMi: o.haricMi }))

  const anlatim = await dilekceAnlatim({
    olayBaglami: cj.olayBaglami ?? null, olayTuru: cj.olayTuru ?? null, brans: dosya.brans ?? null,
    sigortaliPlaka: dosya.sigortaliPlaka ?? null, karsiPlaka: dosya.karsiPlaka ?? null, sigortaliUnvan: dosya.sigortaliUnvan ?? null,
    kazaTarihi: dosya.kazaTarihi ? dosya.kazaTarihi.toISOString().slice(0, 10) : null, kazaYeri: dosya.kazaYeri ?? dosya.il ?? null,
    davalilar: dosya.borclular.map((b) => ({ ad: b.adUnvan, rol: b.rol as string })),
    asilAlacak: anapara || null, rucuOrani: dosya.rucuOrani ?? null, kusurDurumu: dosya.kusurDurumu ?? null, odemeBilgi: null,
    belgeMetni, dekontlar, alacakliUnvan: ayarlar?.alacakliUnvan ?? null,
  }, { musteriId: dosya.musteriId, dosyaId: dosya.id }, {
    kisiler: [...dosya.borclular.map((b) => b.adUnvan), dosya.sigortaliUnvan],
    kimlikler: dosya.borclular.map((b) => b.tcVkn),
    plakalar: [dosya.sigortaliPlaka, dosya.karsiPlaka],
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
    emsaller: dosya.emsaller.map(emsalAtif),
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
  const c = await prisma.uretilenCikti.findUnique({ where: { id: ciktiId }, select: { durum: true, dosya: { select: { id: true, musteriId: true } } } })
  if (!c || !izinli.includes(c.dosya.musteriId)) return { ok: false, error: 'Çıktı bulunamadı veya yetkiniz yok' }
  // Mahkemeye gönderilmiş dilekçe kayıt olarak korunur; üzerine yazılmaz (denetim B27).
  if (c.durum === 'GONDERILDI') return { ok: false, error: 'Gönderildi olarak işaretlenmiş dilekçe değiştirilemez.' }
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
  revalidatePath('/taksitler')
  return { ok: true }
}

// ── TAKSİT defter (ledger) modeli — gerçek tahsilatlar TakipOlayi(TAHSILAT, hamJson.planId); taksit durumları FIFO mahsupla TÜRETİLİR ──

/** Planın plan-etiketli TAHSİLATLARINI FIFO (eski taksitten) mahsup eder → her taksitin
 *  durum/odenenTutar/odendiTarih'ini türetir; plan kapanışını ayarlar.
 *  ATOMİKLİK: çağıranın transaction'ı (tx) içinde çalışır — olay create/delete ile mahsup ya birlikte
 *  yazılır ya birlikte geri alınır (yarım kalan mahsup + retry çift tahsilat üretmesin).
 *  Dosya durumu (TAHSIL) tx DIŞINDA, dönüş değerine göre çağıran tarafından ilerletilir. */
async function taksitMahsupEt(planId: string, tx: Prisma.TransactionClient): Promise<{ tamam: boolean; dosyaId: string } | null> {
  const plan = await tx.taksitPlani.findUnique({ where: { id: planId }, include: { taksitler: { orderBy: { sira: 'asc' } } } })
  if (!plan) return null
  const tahsilatlar = await tx.takipOlayi.findMany({
    where: { dosyaId: plan.dosyaId, tip: 'TAHSILAT', hamJson: { path: ['planId'], equals: planId } },
    select: { tutar: true, tarih: true, createdAt: true },
    orderBy: [{ tarih: 'asc' }, { createdAt: 'asc' }],
  })
  const toplamTahsil = tahsilatlar.reduce((s, o) => s + (o.tutar != null ? Number(o.tutar) : 0), 0)

  // FIFO: her tahsilat sırayla taksitleri doldurur (odendiTarih = dolduran ödemenin tarihi)
  const st = plan.taksitler.map((t) => ({ id: t.id, tutar: Number(t.tutar), dolan: 0, son: null as Date | null }))
  let ti = 0
  for (const o of tahsilatlar) {
    let kalan = o.tutar != null ? Number(o.tutar) : 0
    const tar = o.tarih ?? o.createdAt
    while (kalan > 0.005 && ti < st.length) {
      const ekle = Math.min(kalan, st[ti].tutar - st[ti].dolan)
      st[ti].dolan += ekle; kalan -= ekle; st[ti].son = tar
      if (st[ti].dolan >= st[ti].tutar - 0.005) ti++
    }
  }

  for (const s of st) {
    const odendi = s.dolan >= s.tutar - 0.005
    const kismi = !odendi && s.dolan > 0.005
    await tx.taksit.update({
      where: { id: s.id },
      data: { durum: odendi ? 'ODENDI' : kismi ? 'KISMI' : 'BEKLIYOR', odenenTutar: s.dolan > 0.005 ? new Prisma.Decimal(s.dolan.toFixed(2)) : null, odendiTarih: odendi ? (s.son ?? new Date()) : null, odemeId: null },
    })
  }
  const tamam = toplamTahsil >= Number(plan.toplamTutar) - 0.005
  if (plan.durum !== 'IPTAL') await tx.taksitPlani.update({ where: { id: planId }, data: { durum: tamam ? 'TAMAMLANDI' : 'AKTIF' } })
  return { tamam, dosyaId: plan.dosyaId }
}

/** Serbest tahsilat gir (herhangi tutar + tarih) → TakipOlayi(TAHSILAT, planId) + FIFO mahsup. Dağınık ödemeleri plana oturtur. */
export async function taksitTahsilatGir(planId: string, tutarStr: string, tarihStr: string, aciklama?: string): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  const plan = await prisma.taksitPlani.findUnique({ where: { id: planId }, select: { dosyaId: true, durum: true, dosya: { select: { musteriId: true } } } })
  if (!plan || !izinli.includes(plan.dosya.musteriId)) return { ok: false, error: 'Plan bulunamadı veya yetkiniz yok' }
  if (plan.durum === 'IPTAL') return { ok: false, error: 'İptal edilmiş plana tahsilat girilemez' }
  const tutar = guvenliDecimal(tutarStr)
  if (!tutar || Number(tutar) <= 0) return { ok: false, error: 'Geçerli bir tahsilat tutarı girin.' }
  const tarih = tarihStr && /^\d{4}-\d{2}-\d{2}/.test(tarihStr) ? new Date(tarihStr) : new Date()
  try {
    // olay + mahsup TEK transaction: yarım kalırsa ikisi de geri alınır → retry çift tahsilat üretmez
    const sonuc = await prisma.$transaction(async (tx) => {
      await tx.takipOlayi.create({ data: { dosyaId: plan.dosyaId, tip: 'TAHSILAT', tutar, tarih, aciklama: (aciklama ?? '').trim().slice(0, 200) || 'Taksit tahsilatı', hamJson: { planId, kaynak: 'taksit' } as Prisma.InputJsonValue } })
      return taksitMahsupEt(planId, tx)
    })
    if (sonuc?.tamam) await dosyaDurumIlerlet(plan.dosyaId, DosyaDurum.TAHSIL) // KAPANDI dosya TAHSIL'e geri dönmez
    await prisma.aktivite.create({ data: { dosyaId: plan.dosyaId, kullaniciId: dbUser.id, eylem: `Taksit tahsilatı girildi: ${tutar} TL` } })
  } catch (e) {
    return { ok: false, error: `Tahsilat girilemedi (kayıt yazılmadı — tekrar deneyebilirsiniz): ${(e as Error).message}` }
  }
  revalidatePath(`/akilli-giris/${plan.dosyaId}`)
  revalidatePath('/taksitler')
  return { ok: true }
}

/** Plan tahsilatını geri al (yanlış giriş) → TAHSILAT olayını sil + yeniden mahsup. Rol/bayrak kapılı. */
export async function taksitTahsilatGeriAl(olayId: string): Promise<{ ok: boolean; error?: string }> {
  const { dbUser, izinli } = await ctx()
  if (!silebilir(dbUser)) return { ok: false, error: SILME_YETKISI_YOK }
  const olay = await prisma.takipOlayi.findUnique({ where: { id: olayId }, select: { id: true, dosyaId: true, hamJson: true, dosya: { select: { musteriId: true } } } })
  if (!olay || !izinli.includes(olay.dosya.musteriId)) return { ok: false, error: 'Tahsilat bulunamadı veya yetkiniz yok' }
  const planId = (olay.hamJson as { planId?: string } | null)?.planId
  if (!planId) return { ok: false, error: 'Bu kayıt bir taksit tahsilatı değil' }
  try {
    const sonuc = await prisma.$transaction(async (tx) => {
      await tx.takipOlayi.delete({ where: { id: olayId } })
      return taksitMahsupEt(planId, tx)
    })
    await prisma.aktivite.create({ data: { dosyaId: olay.dosyaId, kullaniciId: dbUser.id, eylem: 'Taksit tahsilatı geri alındı' } })
    // Geri alma planı yeniden AKTIF yaptıysa ama dosya TAHSIL'de (kapalı) kaldıysa uyar — dosya
    // aktiflik kapısı yüzünden otomasyondan düşmüş olur; önceki durum bilinemediğinden elle düzeltilir.
    if (sonuc && !sonuc.tamam) {
      const d = await prisma.rucuDosyasi.findUnique({ where: { id: olay.dosyaId }, select: { durum: true } })
      if (d?.durum === DosyaDurum.TAHSIL) {
        await prisma.aktivite.create({ data: { dosyaId: olay.dosyaId, kullaniciId: dbUser.id, eylem: 'DİKKAT: tahsilat geri alındı ama dosya durumu TAHSIL (kapalı) — plan tamam değil, durumu elle düzeltin' } })
      }
    }
  } catch (e) {
    return { ok: false, error: `Geri alınamadı: ${(e as Error).message}` }
  }
  revalidatePath(`/akilli-giris/${olay.dosyaId}`)
  revalidatePath('/taksitler')
  return { ok: true }
}

/** Bir taksiti "ödendi" işaretle = o taksitin KALANI kadar tahsilat gir (ledger) → FIFO mahsup. */
export async function taksitOdendi(taksitId: string): Promise<{ ok: boolean; error?: string }> {
  const { izinli } = await ctx()
  const t = await prisma.taksit.findUnique({ where: { id: taksitId }, include: { plan: { select: { id: true, durum: true, dosya: { select: { musteriId: true } } } } } })
  if (!t || !izinli.includes(t.plan.dosya.musteriId)) return { ok: false, error: 'Taksit bulunamadı veya yetkiniz yok' }
  if (t.plan.durum === 'IPTAL') return { ok: false, error: 'İptal planda işlem yapılamaz' }
  const kalan = Number(t.tutar) - (t.odenenTutar != null ? Number(t.odenenTutar) : 0)
  if (kalan <= 0.005) return { ok: true }
  // tahsilat tarihi = İSTANBUL günü (UTC günüyle 00:00–03:00 arası tıklamada bir gün önceye kayardı)
  return taksitTahsilatGir(t.plan.id, kalan.toFixed(2), new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10), `${t.sira}. taksit`)
}

/** Taksit "geri al" = planın EN SON tahsilatını sil (undo-last) + yeniden mahsup. */
export async function taksitOdemeGeriAl(taksitId: string): Promise<{ ok: boolean; error?: string }> {
  const { izinli } = await ctx()
  const t = await prisma.taksit.findUnique({ where: { id: taksitId }, select: { plan: { select: { id: true, dosyaId: true, dosya: { select: { musteriId: true } } } } } })
  if (!t || !izinli.includes(t.plan.dosya.musteriId)) return { ok: false, error: 'Taksit bulunamadı veya yetkiniz yok' }
  const son = await prisma.takipOlayi.findFirst({ where: { dosyaId: t.plan.dosyaId, tip: 'TAHSILAT', hamJson: { path: ['planId'], equals: t.plan.id } }, orderBy: [{ tarih: 'desc' }, { createdAt: 'desc' }], select: { id: true } })
  if (!son) return { ok: false, error: 'Geri alınacak tahsilat yok' }
  return taksitTahsilatGeriAl(son.id)
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
