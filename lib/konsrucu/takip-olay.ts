/**
 * KonsRücü — takip süreci olayı kaydı · lib/konsrucu/takip-olay.ts (server)
 * Hem manuel (server action) hem UYAP eklentisi (API route) buradan yazar.
 * Olay tipine göre dosya durumunu ilerletir (TEBLIG→TEBLIG_EDILDI vb.) — kurallar: olayHedefDurum.
 */
import { Prisma, DosyaDurum } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { borcaItirazMi, onemliOlayTespit } from '@/lib/konsrucu/onemli-olay'
import { tebligGorevleriOlustur, tebligGorevleriKapat, gercekTebligMi, kesinlesmeMetniMi } from '@/lib/konsrucu/teblig-gorev'
import { ileriMi } from '@/lib/konsrucu/durum'

export const OLAY_TIPLERI = ['TEBLIG', 'ITIRAZ', 'KESINLESTI', 'TAHSILAT', 'HACIZ', 'KAPANDI', 'DURUM'] as const
export type OlayTip = (typeof OLAY_TIPLERI)[number]

export const OLAY_ETIKET: Record<string, string> = {
  TEBLIG: 'Tebliğ edildi', ITIRAZ: 'İtiraz', KESINLESTI: 'Kesinleşti', TAHSILAT: 'Tahsilat',
  HACIZ: 'Haciz', KAPANDI: 'Kapandı', DURUM: 'Durum / not',
}

/**
 * Eklentinin UYAP durum/aşama metninden ("Açık (durdurulmuş : Takibe İtiraz)") türettiği ITIRAZ olayının
 * açıklama öneki — extension/siniflandir.js ASAMA_ITIRAZ_ACIKLAMA bununla başlar (testte kilitli). Bu olayın
 * tarihi itiraz tarihi DEĞİLDİR (ödeme emri tebliği / takip açılışı = alt sınır); dosya başına BİR KEZ yazılır,
 * dosyada başka ITIRAZ olayı varsa hiç yazılmaz (Faz 1 inceleme: her turda yeni olay + yeni Önemli Olay doğuyordu).
 */
export const ASAMA_ITIRAZ_ONEK = 'Takibe itiraz (UYAP aşama'

// Olay → dosya durumu. DİKKAT: TAHSILAT BİLEREK YOK — kısmi tahsilat dosyayı KAPATMAZ.
// UYAP her tahsilat hareketini ayrı olay gönderir; eskiden bu eşleme açık dosyaları yanlışlıkla
// TAHSIL'e (kapalı) çekiyordu. Kapanış artık yalnızca: KAPANDI olayı, UYAP "KAPALI" durumu ya da
// taksit planının tam tahsili (taksitMahsupEt → TAHSIL).
// HACIZ da BİLEREK YOK (2026-09-27, denetim B23/B24 · D1–D2 K2): UYAP'taki "haciz" evrakı borçlu
// malına icrai haciz olabildiği gibi müvekkilin bu dosyadaki ALACAĞINA başka dosyadan konan haciz
// (dosya alacağına haciz) ya da ihtiyati haciz de olabilir (İİK 257: kesinleşme beklemeden konur —
// teyit gerekli); bunlar ayırt edilemiyor. Eskiden "HACIZ = takip kesinleşmiş" sayılıyordu; D1
// itirazlı ve davadayken bu yüzden KESINLESTI göründü. HACIZ artık yalnız olay olarak kaydedilir.
const OLAY_DURUM: Record<string, DosyaDurum | undefined> = {
  TEBLIG: DosyaDurum.TEBLIG_EDILDI,
  ITIRAZ: DosyaDurum.ITIRAZ,
  KESINLESTI: DosyaDurum.KESINLESTI,
  KAPANDI: DosyaDurum.KAPANDI,
}

// ITIRAZ olayının ASLA değiştirmediği durumlar: itirazdan sonraki evreler (arabuluculuk/dava/infaz),
// kapanmış dosya ve idari yol (icra dışı yan yol; eski davranışta sıra 2 < 5 olduğu için ITIRAZ'a
// çekiliyordu). IDARI_YOL dışındakiler zaten ileriMi ile korunuyor — liste niyeti açık yazar.
const ITIRAZ_DOKUNULMAZ: ReadonlySet<DosyaDurum> = new Set<DosyaDurum>([
  DosyaDurum.ARABULUCULUK, DosyaDurum.DAVA, DosyaDurum.INFAZ,
  DosyaDurum.TAHSIL, DosyaDurum.KAPANDI, DosyaDurum.IDARI_YOL,
])

type OlayOzu = { tip: string; aciklama?: string | null; hamJson?: unknown }

/** Olay UYAP eklentisinden mi geldi? (senkron route hamJson.kaynak='uyap' yazar; elle girişte hamJson yok) */
export function uyapKaynakliMi(hamJson: unknown): boolean {
  return !!hamJson && typeof hamJson === 'object' && !Array.isArray(hamJson) && (hamJson as { kaynak?: unknown }).kaynak === 'uyap'
}

/**
 * TEBLIG olayı süre başlatan GERÇEK tebliğ mi? ELLE girilen tebliğ her zaman gerçektir — avukat kararı
 * makineden üstündür (durum.ts ilkesi): "Bila dönen tebligat 21/2 ile yeniden tebliğ edildi" yazan avukatın
 * görevi açılmalı. Metin süzgeci (gercekTebligMi) yalnız UYAP kaynaklı olaya uygulanır.
 */
export function tebligSayilirMi(o: Pick<OlayOzu, 'aciklama' | 'hamJson'>): boolean {
  return !uyapKaynakliMi(o.hamJson) || gercekTebligMi(o.aciklama)
}

/**
 * KESINLESTI olayı GERÇEK bir kesinleşme kaydı mı? UYAP'tan gelen talep/silme/iptal kaydı ("Takibin
 * Kesinleştirilmesi Talebi", "Kesinleşme Bilgisi Silindi") sayılmaz — eski veride eklenti bunları KESINLESTI
 * gönderdi. Elle girilen KESINLESTI her zaman sayılır (avukat kararı).
 */
export function kesinlesmeKaydiMi(o: Pick<OlayOzu, 'aciklama' | 'hamJson'>): boolean {
  return !uyapKaynakliMi(o.hamJson) || kesinlesmeMetniMi(o.aciklama)
}

/** Eklentinin durum/aşama metninden türettiği (tarihi itiraz tarihi olmayan) ITIRAZ olayı mı? */
export function asamaTureviItirazMi(o: Pick<OlayOzu, 'tip' | 'aciklama'>): boolean {
  return o.tip === 'ITIRAZ' && (o.aciklama ?? '').startsWith(ASAMA_ITIRAZ_ONEK)
}

/**
 * Olay Önemli Olay (borca itiraz) kuyruğuna aday mı? UYAP kaynaklı olayda YALNIZ ITIRAZ tipi: eklenti borca
 * itirazı yalnız ITIRAZ gönderir; DURUM'a katlanan türev/başka nitelikte itirazların metni ("Borca İtirazdan
 * Feragat", "Bilirkişi Raporuna İtiraz Dilekçesi") tetik desenini içerebilir ve yanlış kuyruk kaydı açardı.
 * Elle girilen olayda açıklama deseni de sayılır (eski davranış: "ikisi de").
 */
export function onemliOlayAdayiMi(o: OlayOzu): boolean {
  if (uyapKaynakliMi(o.hamJson) && o.tip !== 'ITIRAZ') return false
  return borcaItirazMi(o.tip, o.aciklama)
}

/**
 * Olayın dosyayı götüreceği durum; değişiklik yoksa undefined. Saf fonksiyon (DB yok).
 *
 * Genel kural: durum yalnız İLERİ yönde güncellenir (lib/konsrucu/durum · ileriMi) — UYAP'tan GEÇ gelen
 * bir TEBLIG olayı KESINLESTI/DAVA'daki dosyayı geri çekemez. Bu yapı YENİDEN YAZILMADI; iki dar istisna:
 *
 *   1) TEBLIG ama gerçek tebliğ değil (UYAP'tan İADE / bila tebliğ / tebliğ edilemedi / tebligat talebi —
 *      tebligSayilirMi): dosya TEBLIG_EDILDI'ye çıkmaz; bu kayıtlar süre başlatmaz (denetim B24, D2).
 *
 *   2) ITIRAZ, KESINLESTI'yi GERİ alabilir — yalnız kesinleşme gerçek bir kesinleşme kaydına dayanmıyorsa
 *      (baglam.gercekKesinlesmeVar=false; talep/silme kaydı sayılmaz — kesinlesmeKaydiMi). Gerekçe:
 *      KESINLESTI'ye olay yoluyla yalnız iki kapıdan gelinirdi — KESINLESTI olayı ya da (artık kaldırılan)
 *      HACIZ eşlemesi. Kesinleşme kaydı yoksa durum haciz/talep kaynaklıdır; süresinde itiraz takibi
 *      durdurur, takip kesinleşmemiştir (İİK 62, 66/1 — teyit gerekli). Geri dönüş hedefi dosyanın AŞAMA
 *      kayıtlarına göre seçilir: DAVA aşaması varsa DAVA, yoksa ARABULUCULUK aşaması varsa ARABULUCULUK,
 *      yoksa ITIRAZ (baglam.asamaEvresi) — D1 HACIZ ile KESINLESTI'ye çekilmeden önce DAVA'daydı.
 *      Gerçek kesinleşme kaydı VARSA gelen itiraz gecikmiş itiraz (İİK 65), başka borçlunun ya da kısmi
 *      itiraz olabilir → makine karar vermez, durum korunur; avukat gerekirse elle düzeltir
 *      (dosyaDurumIlerlet zorla). ARABULUCULUK/DAVA/INFAZ/TAHSIL/KAPANDI/IDARI_YOL hiçbir koşulda
 *      geri alınmaz (ITIRAZ_DOKUNULMAZ).
 */
export function olayHedefDurum(
  o: OlayOzu,
  mevcut: DosyaDurum,
  baglam: { gercekKesinlesmeVar?: boolean; asamaEvresi?: 'DAVA' | 'ARABULUCULUK' | null } = {},
): DosyaDurum | undefined {
  const hedef = OLAY_DURUM[o.tip]
  if (!hedef) return undefined
  if (o.tip === 'TEBLIG' && !tebligSayilirMi(o)) return undefined
  if (o.tip === 'ITIRAZ') {
    if (ITIRAZ_DOKUNULMAZ.has(mevcut)) return undefined
    if (mevcut === DosyaDurum.KESINLESTI) {
      if (baglam.gercekKesinlesmeVar) return undefined
      return baglam.asamaEvresi ? DosyaDurum[baglam.asamaEvresi] : DosyaDurum.ITIRAZ
    }
  }
  return ileriMi(mevcut, hedef) ? hedef : undefined
}

export async function takipOlayKaydet(
  dosyaId: string,
  kullaniciId: string | null,
  o: { tip: string; tarih: Date | null; tutar: Prisma.Decimal | null; aciklama: string | null; hamJson?: Prisma.InputJsonValue },
) {
  // Aşama türevi itiraz: dosya başına BİR KEZ; dosyada herhangi bir ITIRAZ olayı varsa hiç yazılmaz
  // (tarihi her turda değişebilir — sayfa 1'deki evrak kayar; route'un tip+tarih+açıklama tekrarı bunu eleyemez).
  if (asamaTureviItirazMi(o)) {
    const varOlan = await prisma.takipOlayi.findFirst({ where: { dosyaId, tip: 'ITIRAZ' }, select: { id: true } })
    if (varOlan) return
  }

  // Durum kuralları olayHedefDurum'da. Olayın kendisi her koşulda kaydedilir.
  const hedefDurum = OLAY_DURUM[o.tip]
  const mevcut = hedefDurum ? await prisma.rucuDosyasi.findUnique({ where: { id: dosyaId }, select: { durum: true } }) : null
  // Yalnız ITIRAZ + KESINLESTI'de sorulur: kesinleşme gerçek bir kesinleşme kaydına mı dayanıyor; değilse
  // dosyanın dava/arabuluculuk aşaması var mı (geri dönüş hedefi).
  const baglam: { gercekKesinlesmeVar?: boolean; asamaEvresi?: 'DAVA' | 'ARABULUCULUK' | null } = {}
  if (o.tip === 'ITIRAZ' && mevcut?.durum === DosyaDurum.KESINLESTI) {
    // Dosya başına KESINLESTI olayı az; talep/silme süzgeci metinde (Türkçe İ) — bu yüzden JS'te süzülür.
    const kesin = await prisma.takipOlayi.findMany({ where: { dosyaId, tip: 'KESINLESTI' }, select: { aciklama: true, hamJson: true } })
    baglam.gercekKesinlesmeVar = kesin.some(kesinlesmeKaydiMi)
    if (!baglam.gercekKesinlesmeVar) {
      const asamalar = await prisma.asama.findMany({
        where: { dosyaId, tur: { in: ['ARABULUCULUK', 'DAVA'] }, durum: { not: 'IPTAL' } },
        select: { tur: true },
      })
      baglam.asamaEvresi = asamalar.some((a) => a.tur === 'DAVA') ? 'DAVA' : asamalar.length ? 'ARABULUCULUK' : null
    }
  }
  const yeniDurum = mevcut ? olayHedefDurum(o, mevcut.durum, baglam) : undefined
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.takipOlayi.create({ data: { dosyaId, tip: o.tip, tarih: o.tarih, tutar: o.tutar, aciklama: o.aciklama, hamJson: o.hamJson } }),
    prisma.aktivite.create({ data: { dosyaId, kullaniciId, eylem: `Takip olayı: ${OLAY_ETIKET[o.tip] ?? o.tip}${o.tutar != null ? ` · ${o.tutar} TL` : ''}` } }),
  ]
  if (yeniDurum) ops.unshift(prisma.rucuDosyasi.update({ where: { id: dosyaId }, data: { durum: yeniDurum } }))
  const res = await prisma.$transaction(ops)

  // Borca itiraz → Önemli Olaylar kuyruğu (idempotent; tespit hatası olay kaydını bozmaz).
  // Aşama türevi itirazda başlık "itiraz tarihi bilinmiyor — UYAP'tan bakın" der; tetik tarihi ödeme emri
  // tebliği/takip açılışıdır (gerçek itirazdan ÖNCE → İİK 67 için güvenli taraf) ve olay dosya başına bir kez yazılır.
  if (onemliOlayAdayiMi(o)) {
    const olayId = (res[yeniDurum ? 1 : 0] as { id?: string } | undefined)?.id ?? null
    try {
      await onemliOlayTespit({ dosyaId, tetikTarihi: o.tarih, kaynakOlayId: olayId, baslik: o.aciklama ?? 'Borca itiraz', kullaniciId })
    } catch {
      /* tespit başarısız olsa da takip olayı kaydı geçerli kalır */
    }
  }

  // TEBLIG → yasal süre görevi: haciz isteme (İİK m.78, 1 yıl) — yalnız GERÇEK tebliğden (UYAP'tan gelen
  // İADE/bila tebliğ ve tebligat talebi süre başlatmaz; elle girilen tebliğ her zaman sayılır). ITIRAZ →
  // haciz görevine not (görev AÇIK kalır, m.78/2); ITIRAZ/KESINLESTI/KAPANDI → bayat görevleri kapat.
  // HACIZ görev kapatmaz (bkz. teblig-gorev). Kanca hatası olay kaydını bozmaz.
  try {
    if (o.tip === 'TEBLIG') {
      if (o.tarih && !Number.isNaN(o.tarih.getTime()) && tebligSayilirMi(o)) {
        await tebligGorevleriOlustur(dosyaId, o.tarih, kullaniciId)
      }
    } else {
      await tebligGorevleriKapat(dosyaId, o.tip, { aciklama: o.aciklama, tarih: o.tarih, kullaniciId })
    }
  } catch {
    /* görev üretimi/kapanışı başarısız olsa da takip olayı kaydı geçerli kalır */
  }
}
