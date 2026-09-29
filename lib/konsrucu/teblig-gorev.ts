/**
 * KonsRücü — Tebliğ sonrası YASAL SÜRE görevleri · lib/konsrucu/teblig-gorev.ts (server)
 *
 * Ödeme emri TEBLİĞ olayı kaydedilince takip görevi doğar (takipOlayKaydet kancası):
 *   • HACİZ İSTEME SÜRESİ — İİK m.78: tebliğden itibaren 1 YIL içinde haciz istenmezse HACİZ İSTEME
 *     HAKKI DÜŞER, dosya işlemden kaldırılır (yenilenebilir — m.78/4-5, teyit gerekli). Uyarı görevi son
 *     günden 30 gün önce vadelenir (marj), başlıkta gerçek son gün yazar.
 *
 * İTİRAZ PENCERESİ (İİK m.62, tebliğ + 7 gün) görevi ARTIK OTOMATİK ÜRETİLMEZ — ekip bu görevi
 * takip edemediğini bildirdi (2026-07-09, Yelda); mail/görev gürültüsü kaldırıldı. ITIRAZ_GOREV_ONEK
 * ve kapanış kancası, eski/kalmış itiraz görevlerini kapatabilmek için KORUNUR. Yeniden istenirse
 * aşağıdaki `gorevler` dizisine itiraz bloğu geri eklenir (git geçmişinde mevcut).
 *
 * NOT: Süre uzunlukları genel kuraldır; dosya özelinde (borçlu türü/tebligat şekli) avukat teyidi
 * gerekir — görev açıklamasında hatırlatılır.
 *
 * TEBLİĞ TARİHİ (2026-09-27, denetim B24 · D1–D2 K3): TEBLIG tipli her UYAP olayı tebliğ DEĞİLDİR. İADE /
 * bila tebliğ / tebliğ edilemedi (tebliğ yok) ve tebligat TALEBİ (tebliğden önceki işlem) olaylarından
 * görev ÜRETİLMEZ — bkz. gercekTebligMi. Elle girilen TEBLIG her zaman gerçek sayılır (avukat kararı);
 * süzgeç yalnız UYAP kaynaklı olaya uygulanır. Karar takipOlayKaydet kancasında verilir (tebligSayilirMi).
 *
 * EN ERKEN TEBLİĞ (2026-09-27, Faz 1 inceleme): UYAP bir dosyada birden çok tebliğ kaydı getirir (yapısal
 * "Tebliğ (UYAP)", mazbata, geç dönen mazbata…). Dosyada vadesi bu görevinkinden ERKEN ya da AYNI GÜN
 * olan ACIK/ISLEMDE/TAMAMLANDI bir İİK 78 görevi varsa yenisi AÇILMAZ — yalnız en erken tebliğden kurulan
 * görev yaşar (avukat erken görevi "mükerrer" sanıp kapatırsa geç tarihli görev kalmasın). IPTAL görev
 * SAYILMAZ (eski HACIZ kancasının yanlışlıkla kapattığı görevler yeniden kurulabilsin). Bu kontrol başlık
 * yerine önek + vade ile yapıldığı için başlık metni değiştirilebildi.
 *
 * İTİRAZ (2026-09-27, denetim B01/B21 · Faz 1 inceleme ENGELLEYİCİ bulgusu): İİK m.78/2 — itiraz ya da dava
 * vukuundan hükmün kesinleşmesine kadar geçen süre haciz isteme süresine SAYILMAZ (teyit gerekli). Ama:
 *   • kısmi itirazda itiraz edilmeyen kısım, itiraz etmeyen başka borçlu ve süresi geçmiş itiraz (İİK 65)
 *     için süre İŞLER; metinden güvenle ayrılamaz;
 *   • itirazlı dosyada bu görev fiilen TEK hatırlatıcıdır (İİK 67 dava süresinin görevi yok — B01) ve
 *     vadesi (tebliğ + 1 yıl − 30 gün) gerçek son günden ERKENDİR → güvenli taraf.
 * Bu yüzden itiraz görevi ASKIYA ALMAZ / İPTAL ETMEZ ve itiraz varken de görev AÇILIR. ITIRAZ olayı gelince
 * açık İİK 78 görevinin açıklamasına ve dosya aktivitesine "itiraz var — süre işlemiyor olabilir, İİK 67
 * süresini kontrol edin" notu düşer (itirazNotu). Şemada ASKIDA durumu yok; kalan süreyle yeniden kurma
 * süre motoru işidir (B21).
 *
 * Kapanış kancaları: KAPANDI her ikisini kapatır (IPTAL); ITIRAZ/KESINLESTI kalmış itiraz-penceresi
 * görevlerini kapatır — kuyruğa bayat görev birikmesin. HACIZ HİÇBİR görevi KAPATMAZ (2026-09-27):
 * UYAP'taki "haciz" evrakı müvekkilin alacağına başka dosyadan konan DOSYA ALACAĞINA HACİZ ya da
 * İHTİYATİ HACİZ olabilir (D1'de 6 olay böyleydi); borçlu malına icrai haciz ile ayırt edilemediği için
 * İİK 78 görevini kapatmak süreyi sessizce kaçırtır. Haciz gerçekten işlendiyse avukat görevi elle kapatır.
 */
import { yilEkle, gunBasi } from '@/lib/konsrucu/sure/takvim'
import { Rol, type DosyaDurum } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { tarihTR } from './format'
import { dosyaAktif } from './aktiflik'

const GUN_MS = 86_400_000
export const ITIRAZ_SURESI_GUN = 7 // İİK m.62 (genel kural) — artık görev üretiminde kullanılmıyor; referans/tarihçe için korunur
export const HACIZ_UYARI_ERKEN_GUN = 30

// Görev başlık önekleri — kapanış kancaları, mükerrer kontrolü ve cron bunlarla eşleşir; DEĞİŞTİRİRSEN eski görevler kapanmaz.
export const ITIRAZ_GOREV_ONEK = 'İtiraz penceresi'
export const HACIZ_GOREV_ONEK = 'Haciz isteme süresi'
/** İİK 78 görevine itiraz notu düşüldüğünü gösteren işaret — aynı not ikinci kez eklenmez. */
export const ITIRAZ_NOT_ISARETI = '⚠ İTİRAZ KAYDI'

// ITIRAZ olayı yoksa itirazın varlığı durumdan okunur: bu evrelere yalnız itirazdan sonra gelinir
// (itiraz → arabuluculuk → itirazın iptali davası). Yalnız görev açıklamasındaki not için kullanılır.
const ITIRAZ_SONRASI_DURUMLAR: readonly DosyaDurum[] = ['ITIRAZ', 'ARABULUCULUK', 'DAVA']

/** Türkçe-duyarlı normalize — onemli-olay.ts `norm` ile aynı kural (orada dışa açık değil) + şapkalı harfler. */
function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' })[c] ?? c)
    .replace(/̇/g, '') // birleşik nokta (İ → i + U+0307)
    .replace(/\s+/g, ' ')
}

// Posta TÜRÜ adları — iade SONUCU değil: "İadeli Taahhütlü …", "İade-i Taahhütlü …". Desenlerden ÖNCE silinir.
const IADE_TAAHHUT = /iade\s*-?\s*i\s+taahhut|iadeli\s+taahhut/g

// TEBLIG tipli UYAP olayının açıklaması bunlardan birine uyuyorsa GERÇEK tebliğ DEĞİLDİR (denetim B24, D1–D2 K1/K3).
// Kelime başı sınırı: "ziyade" gibi kelime içi eşleşmeler yanlış negatif üretmesin.
const TEBLIG_DEGIL: readonly RegExp[] = [
  /(^|[^a-z])bila([^a-z]|$)/, // "Bila Tebliğ Mazbatası" — tebliğ yapılamadı
  /(^|[^a-z])iade(?!li)/, // "Tebligat İade", İADE mazbatası — tebliğ yapılamadı ("iadeli" posta türü hariç)
  /edilemed|yapilamad/, // "tebliğ edilemedi / yapılamadı"
  /imkansiz/, // "tebliğ imkânsız"
  /teblig\w*\s+(cikarilmasi\s+|gonderilmesi\s+|yapilmasi\s+)?tale[pb]/, // "Tebligat Talebi" — tebliğden ÖNCEKİ işlem
]

// Tebliğin YAPILDIĞINI açıkça söyleyen ifade — olumsuz desenlerden ÜSTÜN. TK 21/1 mazbatasında "tebliğ
// edilemediğinden muhtara teslim, ihbarname kapıya yapıştırıldı" geçer; bu GEÇERLİ bir tebliğdir (tebliğ
// tarihi ihbarnamenin yapıştırıldığı gün — TK 21, teyit gerekli). İİK 78 için fazla/erken görev güvenli
// taraftır, kaçan görev değil. extension/siniflandir.js `tebligPozitif` ile AYNI (testte çapraz kilitli).
const TEBLIG_POZITIF =
  /teblig\s+(edildi|edilmistir|olundu)|tebellug|muhtara\s+teslim(?!\s+edilemed)|(kapiya|kapisina|haber\s+kagidi)\s+(\S+\s+)?yapistir|\btk\s*(m(adde|d)?\.?\s*)?(21|35)\b|\b(21|35)\s*\.\s*madde/

/**
 * UYAP'tan gelen TEBLIG tipli olayın METNİ gerçek bir tebliğ mi? İADE/bila tebliğde süre başlamaz (yerleşik
 * görüş — teyit gerekli); tebligat talebinin tarihi tebliğ günü değildir. Açık pozitif ifade (TK 21/35,
 * muhtara teslim, kapıya yapıştırma, "tebliğ edildi") olumsuz ifadeye üstün gelir. Açıklama boşsa gerçek
 * sayılır — güvenli taraf: görev açılsın. ELLE girilen olaya uygulanmaz (takip-olay.ts tebligSayilirMi).
 * SINIR: UYAP bazen İADE tebligatı da "Tebliğ Edildi" diye yazıyor (D2) — metinden yakalanamaz;
 * hukuki tebliğ tarihi mazbatadan/UETS kaydından avukat onayıyla alınmalı (B24 önerisi, ayrı iş).
 */
export function gercekTebligMi(aciklama: string | null | undefined): boolean {
  const a = norm(aciklama).replace(IADE_TAAHHUT, ' ')
  if (TEBLIG_POZITIF.test(a)) return true
  return !TEBLIG_DEGIL.some((r) => r.test(a))
}

/**
 * İtiraz açıklaması KISMİ itiraz olabilir mi? "kısmi", "kısmen", faize / faiz oranına, fer'ilere itiraz
 * (asıl alacağa itiraz yok) — itiraz edilmeyen kısım kesinleşir, süre o kısım için işler (İİK 62/5, 78/2 —
 * teyit gerekli). Yalnız görev notunun metnini etkiler; hiçbir görevi açıp kapatmaz.
 */
export function kismiItirazMi(aciklama: string | null | undefined): boolean {
  return /(^|[^a-z])kismi|kismen|(^|[^a-z])faiz|(^|[^a-z])fer'?i(ler|lere|leri|ye)?([^a-z]|$)/.test(norm(aciklama))
}

// UYAP KESINLESTI kaydı talep / silme / iptal ise kesinleşme DEĞİLDİR ("Takibin Kesinleştirilmesi Talebi",
// "Kesinleşme Bilgisi Silindi"). Eski veride eklenti bunları KESINLESTI gönderdi (Faz 1 inceleme).
const KESINLESME_DEGIL: readonly RegExp[] = [/(^|[^a-z])tale[pb]/, /kesinlestiril/, /silin|(^|[^a-z])silme|(^|[^a-z])iptal/]

/** UYAP'tan gelen KESINLESTI olayının METNİ gerçek bir kesinleşme kaydı mı? (talep/silme/iptal değil) */
export function kesinlesmeMetniMi(aciklama: string | null | undefined): boolean {
  const a = norm(aciklama)
  return !KESINLESME_DEGIL.some((r) => r.test(a))
}

/**
 * İİK m.78 son günü: tebliğ + 1 yıl; o gün sonraki yılda yoksa (29 Şubat) ayın SON günü (İİK m.19 —
 * teyit gerekli). İstanbul takvim günüyle hesaplanır (sure/takvim yilEkle; sonuç o günün İstanbul gece yarısı):
 * sunucu saatiyle hesap, İstanbul gece yarısı saklanan tebliğde (UTC 21:00) bir önceki günden sayıyordu.
 */
export function hacizSonGun(tebligTarihi: Date): Date {
  return yilEkle(tebligTarihi, 1)
}

/** Dosyada itiraz izi var mı? (ITIRAZ olayı ya da itiraz sonrası durum) — yalnız görev notu için. */
async function itirazIziVarMi(dosyaId: string, durum: DosyaDurum): Promise<boolean> {
  if (ITIRAZ_SONRASI_DURUMLAR.includes(durum)) return true
  return !!(await prisma.takipOlayi.findFirst({ where: { dosyaId, tip: 'ITIRAZ' }, select: { id: true } }))
}

/**
 * İİK 78 görevine / aktiviteye düşen itiraz notu. Görev bilerek AÇIK kalır (dosya başı notu).
 * Hukuki içerik teyit gerektirir; metin avukatı yönlendirir, karar vermez.
 */
export function itirazNotu(aciklama?: string | null, tarih?: Date | null): string {
  const kismi = kismiItirazMi(aciklama)
  return (
    `${ITIRAZ_NOT_ISARETI}${tarih && !Number.isNaN(tarih.getTime()) ? ` (${tarihTR(tarih)})` : ''}: dosyada itiraz var` +
    `${kismi ? ' — açıklamaya göre KISMİ itiraz olabilir' : ''}. İİK m.78/2: itiraz/dava süresince haciz isteme süresi ` +
    `işlemeyebilir; bu görevin son günü bu yüzden ERKEN tarafta kalır. Kısmi itirazda itiraz edilmeyen kısım, itiraz ` +
    `etmeyen başka borçlu ve süresi geçmiş itiraz (İİK 65) için süre işlemeye devam eder (teyit gerekli). Görev bilerek ` +
    `AÇIK bırakıldı. İİK m.67: itirazın iptali davası / kaldırılması için 1 yıllık süre itirazın alacaklıya ` +
    `tebliğinden işler — ayrıca kontrol edin (teyit gerekli).`
  )
}

/**
 * TEBLIG olayından yasal süre görevlerini üret (idempotent). Tebliğ olayının gerçekliği çağıranda süzülür
 * (takip-olay.ts tebligSayilirMi). Dosyada daha erken ya da aynı günlü İİK 78 görevi varsa yenisi açılmaz.
 */
export async function tebligGorevleriOlustur(dosyaId: string, tebligTarihi: Date, kullaniciId: string | null): Promise<void> {
  const dosya = await prisma.rucuDosyasi.findUnique({
    where: { id: dosyaId },
    select: { musteriId: true, atananKullaniciId: true, durum: true, uyapDurum: true },
  })
  if (!dosya) return
  // Kapanmış dosyada (TAHSIL/KAPANDI/IDARI_YOL veya UYAP-kapalı) süre görevi üretme — uyarı yanlış olur.
  if (!dosyaAktif(dosya)) return

  const hacizSon = hacizSonGun(tebligTarihi)
  const hacizUyari = new Date(hacizSon.getTime() - HACIZ_UYARI_ERKEN_GUN * GUN_MS)

  // Mükerrer koruması: AYNI tebliğ gününün görevi varsa yenisi açılmaz (IPTAL sayılmaz: yanlış görev temizlenip
  // gerçek tebliğ gelince görev yeniden kurulur). Farklı
  // günlü tebliğ (çok borçlu dosyada ikinci borçlu) kendi görevini alır: süre borçlu bazında işler; birinci
  // borçlunun görevi tamamlanınca/erken tarihli olunca ikincinin süresini ÖRTMEZ (eski "en erken tebliğ" kuralı
  // örtüyordu). Teorik yarış (eşzamanlı iki TEBLIG işleme) kabul edilmiş risk: UYAP senkronu olayları sıralı işler.
  const ayniGun = await prisma.takipGorevi.findFirst({
    where: {
      dosyaId,
      baslik: { startsWith: HACIZ_GOREV_ONEK },
      durum: { in: ['ACIK', 'ISLEMDE', 'TAMAMLANDI'] },
      sonTarih: { gte: gunBasi(hacizUyari), lt: new Date(gunBasi(hacizUyari).getTime() + GUN_MS) },
    },
    select: { id: true },
  })
  if (ayniGun) return

  // İtiraz varsa görev YİNE açılır (m.78/2 durması metinden güvenle kurulamaz; erken hatırlatma güvenli taraf) — notla.
  const itirazVar = await itirazIziVarMi(dosyaId, dosya.durum)

  // sorumlu: dosyanın atananı; yoksa tenant ADMIN'i (hatırlatma maili sorumluya gider — boş kalmasın)
  let sorumluId = dosya.atananKullaniciId
  if (!sorumluId) {
    const admin = await prisma.kullanici.findFirst({
      where: { rol: Rol.ADMIN, aktif: true, musteriler: { some: { musteriId: dosya.musteriId } } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    sorumluId = admin?.id ?? null
  }

  // İtiraz penceresi (İİK m.62) görevi bilinçli olarak ÜRETİLMEZ — bkz. dosya başı notu (ekip takip edemiyor).
  const gorevler = [
    {
      baslik: `${HACIZ_GOREV_ONEK} (İİK m.78): son gün ${tarihTR(hacizSon)} — geçerse haciz isteme hakkı düşer`,
      sonTarih: hacizUyari,
      aciklama:
        `Ödeme emri ${tarihTR(tebligTarihi)} tarihinde tebliğ edildi. İİK m.78 uyarınca tebliğden itibaren 1 YIL içinde ` +
        `haciz istenmezse haciz isteme hakkı düşer, dosya işlemden kaldırılır (yenileme gerekir — teyit gerekli). ` +
        `Gerçek son gün: ${tarihTR(hacizSon)}. Bu görev ${HACIZ_UYARI_ERKEN_GUN} gün önce hatırlatılır. İtiraz/dava ` +
        `süresince süre işlemeyebilir (m.78/2) — görev yine de açık kalır. Haciz işlendiyse görevi elle kapatın — ` +
        `dosya alacağına/ihtiyati haciz bu süreyi karşılamayabilir (teyit gerekli).` +
        (itirazVar ? `\n\n${itirazNotu()}` : ''),
    },
  ]

  for (const g of gorevler) {
    await prisma.takipGorevi.create({
      data: { dosyaId, baslik: g.baslik, aciklama: g.aciklama, sonTarih: g.sonTarih, sorumluId, atayanId: kullaniciId },
    })
    await prisma.aktivite.create({
      data: { dosyaId, kullaniciId, eylem: `Otomatik takip görevi: ${g.baslik}` },
    })
  }
}

/**
 * ITIRAZ → açık İİK 78 görevlerine itiraz notu (idempotent: işaretli görev atlanır) + dosya aktivitesi.
 * Görev KAPANMAZ / İPTAL EDİLMEZ (dosya başı notu).
 */
async function itirazNotuDus(
  dosyaId: string,
  opts?: { aciklama?: string | null; tarih?: Date | null; kullaniciId?: string | null },
): Promise<void> {
  const acik = await prisma.takipGorevi.findMany({
    where: { dosyaId, durum: { in: ['ACIK', 'ISLEMDE'] }, baslik: { startsWith: HACIZ_GOREV_ONEK } },
    select: { id: true, aciklama: true },
  })
  const not = itirazNotu(opts?.aciklama, opts?.tarih)
  let notDusulen = 0
  for (const g of acik) {
    if ((g.aciklama ?? '').includes(ITIRAZ_NOT_ISARETI)) continue
    await prisma.takipGorevi.update({
      where: { id: g.id },
      data: { aciklama: [g.aciklama?.trim(), not].filter(Boolean).join('\n\n') },
    })
    notDusulen++
  }
  await prisma.aktivite.create({
    data: {
      dosyaId,
      kullaniciId: opts?.kullaniciId ?? null,
      eylem:
        (notDusulen
          ? `İtiraz kaydedildi: ${notDusulen} açık İİK m.78 haciz isteme görevine not düşüldü, görev AÇIK bırakıldı ` +
            `(m.78/2 — süre işlemiyor olabilir, teyit gerekli). `
          : `İtiraz kaydedildi (İİK m.78/2 — haciz isteme süresi işlemiyor olabilir, teyit gerekli). `) +
        `İİK m.67 dava süresini (itirazın alacaklıya tebliğinden 1 yıl) kontrol edin.`,
    },
  })
}

/**
 * Olay tipine göre bayatlayan süre görevlerini kapat (IPTAL) / itiraz notu düş. Bkz. dosya başı notu.
 * opts.aciklama / opts.tarih: ITIRAZ olayının açıklaması ve tarihi (not metni); opts.kullaniciId: aktivite için.
 */
export async function tebligGorevleriKapat(
  dosyaId: string,
  olayTip: string,
  opts?: { aciklama?: string | null; tarih?: Date | null; kullaniciId?: string | null },
): Promise<void> {
  // Kalmış itiraz-penceresi görevleri: itiraz geldi / takip kesinleşti / dosya kapandı → pencere bayat.
  // HACIZ bu listede YOK: haciz kesinleşme göstergesi değil (dosya alacağına / ihtiyati haciz olabilir).
  const onekler: string[] = []
  if (olayTip === 'ITIRAZ' || olayTip === 'KESINLESTI') onekler.push(ITIRAZ_GOREV_ONEK)
  if (olayTip === 'KAPANDI') onekler.push(ITIRAZ_GOREV_ONEK, HACIZ_GOREV_ONEK)
  if (onekler.length) {
    await prisma.takipGorevi.updateMany({
      where: { dosyaId, durum: { in: ['ACIK', 'ISLEMDE'] }, OR: onekler.map((o) => ({ baslik: { startsWith: o } })) },
      data: { durum: 'IPTAL' },
    })
  }

  // ITIRAZ → İİK m.78 haciz görevi AÇIK KALIR; açıklamaya ve aktiviteye not düşer (m.78/2 — teyit gerekli).
  if (olayTip === 'ITIRAZ') await itirazNotuDus(dosyaId, opts)
}
