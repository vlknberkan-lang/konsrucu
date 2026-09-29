/**
 * KonsRücü — raporlar ve panolar için SAF üreticiler (DB yok) · lib/konsrucu/rapor-mail.ts
 *
 * 1) Sabah takvim raporu e-postası (HTML + düz metin). Önümüzdeki N günün etkinliklerini güne göre gruplar;
 *    e-posta-güvenli (tablo düzeni + inline stil). Hem /takvim/rapor önizlemesi hem de zamanlı gönderim aynı
 *    kaynağı kullanır. ÇOK-ŞİRKET: rapor "bolumler" alır ama TEK zaman çizelgesi basar — hafta bölünmez (Yelda:
 *    "takibini bölemez"), tüm şirketlerin etkinlikleri aynı gün listesinde birleşir, satırın sağında kısa şirket
 *    etiketi (Ray / Zurich) görünür. Tek şirkette etiket basılmaz.
 * 2) S30 · Ray takip raporu (30 sütun): Ray takip Excel'inin sütun düzeniyle (docs 04 §4.2), her sütun bir model
 *    alanından ya da türetilmiş eksenden (06 §3.5'in tersi). Teyitsiz hücre ve satır işaretlenir. Rapor programın
 *    kendi verisinden üretilir; GÖNDERİLMEZ — avukat kontrol edip elle gönderir (B17). E-posta yalnız taslaktır.
 * 3) S30 · Dava Panosu özeti: satır ve durum güveni lib/konsrucu/dava/pano.ts'ten (Davalar tablosuyla aynı kaynak);
 *    burada yalnız girdi kurulur ve özet kartlarının sayıları çıkar (teyitsiz, 30 gün içinde süre, 60 gündür sessiz,
 *    karşı taraf davası).
 * 4) S30 · Bugün masası: bütün dosyaların Şimdi kartları (RucuDosyasi.yolHaritasiJson önbelleği) tek listede,
 *    06 §8.2 öncelik merdiveniyle; süre riski (GN-04, GN-05) önbellekten bağımsız olarak Sure tablosundan okunur.
 *
 * Sunucu UTC çalışır: tüm tarih/saat gösterimi + gün gruplaması İSTANBUL gününe göredir (lib/konsrucu/format).
 * Hukuki etiketler: süre günleri "önerilen"dir, avukat onaylar; madde atıfları "teyit gerekli" etiketi taşır.
 */
import { tarihTR, kalanGun, bugunIstBasi, paraTR } from './format'
import { asamaBilgi } from './asama'
import { dosyaAktif } from './aktiflik'
import { panoSuz, panoSirala, type DurumGuveni, type PanoGirdi, type PanoSatiri, type PanoSuzgec } from './dava/pano'
import { kayitIsaretiOku } from './dava/kayit'

export type RaporEtkinlik = {
  tur: string
  baslik: string
  baslar: string // ISO
  biter: string | null
  yer: string | null
  online: boolean
  hukukNo: string | null
  borclu: string | null
}

export type RaporZamanasimi = { hukukNo: string | null; borclu: string | null; tarih: string; kalanGun: number }

/** Bir şirketin (tenant) rapor verisi — alıcı kaç şirkete üyeyse o kadar bölüm; çıktı tek çizelge. */
export type RaporBolum = {
  musteriAd: string | null // null → şirket etiketi basılmaz (tek-tenant önizleme)
  etkinlikler: RaporEtkinlik[]
  zamanasimi?: RaporZamanasimi[] // pencerede dolan zamanaşımları (ops.)
  zamanasimiGecti?: RaporZamanasimi[] // tarihi GEÇMİŞ, takibi açılmamış dosyalar — kırmızı alarm (ops.)
  zamanasimiBosSayisi?: number // zamanaşımı tarihi hiç girilmemiş açık dosya sayısı (ops.)
}

export type RaporGirdi = {
  aliciAd: string
  bugun: string // ISO ('YYYY-MM-DD' veya tam ISO) — raporun referans günü
  gunSayisi?: number // varsayılan 7
  bolumler: RaporBolum[]
  panelUrl?: string // "Takvime git" linki
}

// Mailde tek bölümde en fazla bu kadar satır listelenir; kalanı SAYIYLA belirtilir (sessiz kırpma yok).
const LISTE_MAX = 40

// ── tür sözlüğü (takvimle aynı dil) ──
const TUR: Record<string, { label: string; bg: string; fg: string }> = {
  DURUSMA: { label: 'Duruşma', bg: '#eef2ff', fg: '#4338ca' },
  ARABULUCULUK_TOPLANTISI: { label: 'Arabuluculuk', bg: '#e6f6f7', fg: '#0f6b72' },
  GORUSME: { label: 'Görüşme', bg: '#f1f5f9', fg: '#475569' },
  SURE: { label: 'Süre', bg: '#fef3c7', fg: '#b45309' },
  HATIRLATMA: { label: 'Hatırlatma', bg: '#e0f2fe', fg: '#0369a1' },
}
const turMeta = (t: string) => TUR[t] ?? TUR.GORUSME

// Şirket etiketi renkleri — tür rozetleriyle karışmasın diye ayrı ton ailesi (yeşil/mor/turuncu)
const ETIKET_RENK = [
  { bg: '#ecfdf5', fg: '#047857' },
  { bg: '#fdf4ff', fg: '#a21caf' },
  { bg: '#fff7ed', fg: '#c2410c' },
]

const AKSAN = '#1897a0'
const INK = '#1e293b'
const MUTED = '#64748b'
const BORDER = '#e2e8f0'
const TZ = 'Europe/Istanbul'

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// İstanbul takvim günü anahtarı: +3 saat kaydırıp UTC alanlarını oku (TR sabit UTC+3, DST yok) —
// gece etkinlikleri sunucu UTC'yken bir önceki güne düşmesin.
const gunKey = (d: Date) => { const x = new Date(d.getTime() + 3 * 3_600_000); return `${x.getUTCFullYear()}-${x.getUTCMonth()}-${x.getUTCDate()}` }
const saat = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
const tarihUzun = (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ })
const gunAdi = (d: Date) => d.toLocaleDateString('tr-TR', { weekday: 'long', timeZone: TZ })

function gunEtiketi(d: Date, bugun: Date): string {
  const fark = kalanGun(d, bugun)
  const tarih = `${d.toLocaleDateString('tr-TR', { day: 'numeric', timeZone: TZ })} ${d.toLocaleDateString('tr-TR', { month: 'long', timeZone: TZ })} ${gunAdi(d)}`
  if (fark === 0) return `Bugün · ${tarih}`
  if (fark === 1) return `Yarın · ${tarih}`
  return tarih
}

/** "Ray Sigorta A.Ş." → "Ray" — kısa etiket; ilk kelimeler çakışırsa tam ad kullanılır. */
function kisaEtiketler(adlar: (string | null)[]): (string | null)[] {
  const kisa = adlar.map((a) => (a ? a.split(/\s+/)[0] : null))
  const cakisiyor = new Set(kisa.filter((k, i) => k && kisa.findIndex((x) => x === k) !== i))
  return kisa.map((k, i) => (k && cakisiyor.has(k) ? adlar[i] : k))
}

/** Sabah takvim raporu → { konu, html, text }. Tüm şirketler TEK çizelgede, satır sağında şirket etiketi. */
export function haftalikRaporHtml(g: RaporGirdi): { konu: string; html: string; text: string } {
  const gunSayisi = g.gunSayisi ?? 7
  const bugun = new Date(g.bugun)
  const bas = bugunIstBasi(bugun)
  const son = new Date(bas.getTime() + gunSayisi * 86_400_000)
  const gunler = Array.from({ length: gunSayisi }, (_, i) => new Date(bas.getTime() + i * 86_400_000))
  const aralik = `${tarihUzun(bas)} – ${tarihUzun(new Date(son.getTime() - 86_400_000))}`
  const cok = g.bolumler.length > 1
  const etiketler = kisaEtiketler(g.bolumler.map((b) => b.musteriAd))

  // ── birleşik listeler: etkinlik + zamanaşımı satırlarına şirket etiketi işle ──
  type Ek = { etiket: string | null; renk: (typeof ETIKET_RENK)[number] }
  const ek = (i: number): Ek => ({ etiket: cok ? etiketler[i] : null, renk: ETIKET_RENK[i % ETIKET_RENK.length] })

  const pencere = g.bolumler
    .flatMap((b, i) => b.etkinlikler.map((e) => ({ ...e, ...ek(i) })))
    .filter((e) => { const t = new Date(e.baslar).getTime(); return t >= bas.getTime() && t < son.getTime() })
    .sort((a, z) => a.baslar.localeCompare(z.baslar))
  const gunMap = new Map<string, typeof pencere>()
  for (const e of pencere) { const k = gunKey(new Date(e.baslar)); if (!gunMap.has(k)) gunMap.set(k, []); gunMap.get(k)!.push(e) }

  const za = g.bolumler.flatMap((b, i) => (b.zamanasimi ?? []).map((z) => ({ ...z, ...ek(i) }))).sort((a, z) => a.tarih.localeCompare(z.tarih))
  const zaGecti = g.bolumler.flatMap((b, i) => (b.zamanasimiGecti ?? []).map((z) => ({ ...z, ...ek(i) }))).sort((a, z) => a.tarih.localeCompare(z.tarih))
  const bolumSayilar = g.bolumler.map((b, i) => ({ etiket: etiketler[i] ?? b.musteriAd ?? '—', adet: b.etkinlikler.filter((e) => { const t = new Date(e.baslar).getTime(); return t >= bas.getTime() && t < son.getTime() }).length, zaBos: b.zamanasimiBosSayisi ?? 0 }))
  const zaBosNot = bolumSayilar.filter((b) => b.zaBos > 0)

  // ── konu ──
  const tarihAraligi = `${tarihTR(bas)}–${tarihTR(new Date(son.getTime() - 86_400_000))}`
  const zaGectiEk = zaGecti.length ? ` · ⛔ ${zaGecti.length} zamanaşımı geçti` : ''
  const konu = cok
    ? `Sabah Özeti · ${pencere.length} etkinlik (${bolumSayilar.map((b) => `${b.etiket} ${b.adet}`).join(' · ')})${zaGectiEk} · ${tarihAraligi}`
    : `${gunSayisi >= 7 ? 'Haftalık Takvim' : 'Sabah Özeti'} · ${pencere.length} etkinlik${zaGectiEk} · ${tarihAraligi}${g.bolumler[0]?.musteriAd ? ` · ${g.bolumler[0].musteriAd}` : ''}`

  const etiketHtml = (e: Ek) => (e.etiket ? `<span style="display:inline-block;background:${e.renk.bg};color:${e.renk.fg};font-size:10.5px;font-weight:bold;padding:1px 8px;border-radius:999px;white-space:nowrap;">${esc(e.etiket)}</span>` : '')

  // ── HTML: tek 7 günlük çizelge ──
  const gunBloklari = gunler.map((d) => {
    const evs = gunMap.get(gunKey(d)) ?? []
    const bos = evs.length === 0
    const satirlar = bos
      ? `<tr><td style="padding:8px 16px;color:${MUTED};font-size:13px;">— etkinlik yok</td></tr>`
      : evs.map((e) => {
          const m = turMeta(e.tur)
          const yer = e.yer ? `${e.online ? '🎥 ' : '📍 '}${esc(e.yer)}` : ''
          const kim = esc(e.borclu ?? e.baslik)
          const no = e.hukukNo ? `<span style="font-family:monospace;color:${MUTED};font-size:12px;"> · ${esc(e.hukukNo)}</span>` : ''
          const aralikSaat = `${saat(e.baslar)}${e.biter ? '–' + saat(e.biter) : ''}`
          return `<tr>
            <td valign="top" style="padding:8px 8px 8px 16px;white-space:nowrap;font-family:monospace;font-size:13px;font-weight:bold;color:${AKSAN};">${aralikSaat}</td>
            <td valign="top" style="padding:8px 8px 8px 0;">
              <span style="display:inline-block;background:${m.bg};color:${m.fg};font-size:11px;font-weight:bold;padding:2px 8px;border-radius:999px;">${m.label}</span>
              <div style="margin-top:3px;font-size:14px;font-weight:600;color:${INK};">${kim}${no}</div>
              ${yer ? `<div style="font-size:12px;color:${MUTED};margin-top:2px;">${yer}</div>` : ''}
            </td>
            ${e.etiket ? `<td valign="top" align="right" style="padding:10px 16px 8px 0;">${etiketHtml(e)}</td>` : ''}
          </tr>`
        }).join('')
    return `
      <tr><td style="padding:16px 0 6px;">
        <div style="font-size:13px;font-weight:bold;color:${INK};border-bottom:2px solid ${BORDER};padding-bottom:4px;">${esc(gunEtiketi(d, bugun))}${bos ? '' : ` <span style="color:${MUTED};font-weight:normal;">· ${evs.length}</span>`}</div>
      </td></tr>
      <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${satirlar}</table></td></tr>`
  }).join('')

  const zaGoster = za.slice(0, LISTE_MAX)
  const zaKalan = za.length - zaGoster.length
  const zaBlok = za.length === 0 ? '' : `
    <tr><td style="padding:18px 0 6px;">
      <div style="font-size:13px;font-weight:bold;color:#b45309;">⏳ Yaklaşan Zamanaşımı (${za.length})</div>
    </td></tr>
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
        ${zaGoster.map((z) => `<tr>
          <td style="padding:7px 14px;font-size:13px;color:${INK};">${esc(z.borclu ?? z.hukukNo ?? '—')}<span style="font-family:monospace;color:${MUTED};font-size:12px;"> · ${esc(z.hukukNo ?? '')}</span>${z.etiket ? ' ' + etiketHtml(z) : ''}</td>
          <td align="right" style="padding:7px 14px;font-family:monospace;font-size:12.5px;font-weight:bold;color:${z.kalanGun <= 30 ? '#b91c1c' : '#b45309'};">${tarihTR(z.tarih)} · ${z.kalanGun}g</td>
        </tr>`).join('')}
        ${zaKalan > 0 ? `<tr><td colspan="2" style="padding:7px 14px;font-size:12px;color:${MUTED};">… ve ${zaKalan} dosya daha — tam liste panelde.</td></tr>` : ''}
      </table>
    </td></tr>`

  // tarihi GEÇMİŞ zamanaşımları — takibi açılmamış dosyalar için kırmızı alarm (asla sessizce gizlenmez)
  const zaGectiGoster = zaGecti.slice(0, LISTE_MAX)
  const zaGectiKalan = zaGecti.length - zaGectiGoster.length
  const zaGectiBlok = zaGecti.length === 0 ? '' : `
    <tr><td style="padding:18px 0 6px;">
      <div style="font-size:13px;font-weight:bold;color:#b91c1c;">⛔ ZAMANAŞIMI GEÇTİ — takip açılmamış (${zaGecti.length})</div>
    </td></tr>
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;">
        ${zaGectiGoster.map((z) => `<tr>
          <td style="padding:7px 14px;font-size:13px;color:${INK};">${esc(z.borclu ?? z.hukukNo ?? '—')}<span style="font-family:monospace;color:${MUTED};font-size:12px;"> · ${esc(z.hukukNo ?? '')}</span>${z.etiket ? ' ' + etiketHtml(z) : ''}</td>
          <td align="right" style="padding:7px 14px;font-family:monospace;font-size:12.5px;font-weight:bold;color:#b91c1c;">${tarihTR(z.tarih)} · ${Math.abs(z.kalanGun)}g önce</td>
        </tr>`).join('')}
        ${zaGectiKalan > 0 ? `<tr><td colspan="2" style="padding:7px 14px;font-size:12px;color:${MUTED};">… ve ${zaGectiKalan} dosya daha — tam liste panelde.</td></tr>` : ''}
      </table>
    </td></tr>`

  const giris = `Önümüzdeki ${gunSayisi} günde <b style="color:${INK};">${pencere.length} etkinlik</b> var${cok ? ` (${bolumSayilar.map((b) => `${esc(b.etiket)} ${b.adet}`).join(' · ')})` : ''}.${za.length ? ` Ayrıca <b style="color:#b45309;">${za.length}</b> dosyada zamanaşımı yaklaşıyor.` : ''}${zaGecti.length ? ` <b style="color:#b91c1c;">${zaGecti.length} dosyada zamanaşımı GEÇMİŞ görünüyor.</b>` : ''}${zaBosNot.length ? ` <span style="color:#b45309;">${zaBosNot.map((b) => (cok ? `${esc(b.etiket)}: ${b.zaBos}` : `${b.zaBos}`)).join(', ')} açık dosyada zamanaşımı tarihi boş — radar dışındalar.</span>` : ''}`

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(konu)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${BORDER};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
        <tr><td style="background:${AKSAN};padding:20px 24px;">
          <div style="color:#bdeef1;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-family:monospace;">KonsRücu · Ajanda</div>
          <div style="color:#ffffff;font-size:22px;font-weight:800;margin-top:4px;">${cok || gunSayisi < 7 ? 'Sabah Özeti' : 'Haftalık Takvim Raporu'}</div>
          <div style="color:#d7f3f5;font-size:13px;margin-top:4px;">${esc(aralik)}${cok ? ` · ${g.bolumler.map((b) => esc(b.musteriAd ?? '—')).join(' + ')}` : ''}</div>
        </td></tr>
        <tr><td style="padding:20px 24px 4px;">
          <div style="font-size:15px;color:${INK};">Günaydın <b>${esc(g.aliciAd)}</b>,</div>
          <div style="font-size:13.5px;color:${MUTED};margin-top:4px;">${giris}</div>
        </td></tr>
        <tr><td style="padding:4px 24px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${zaGectiBlok}
            ${gunBloklari}
            ${zaBlok}
          </table>
        </td></tr>
        ${g.panelUrl ? `<tr><td style="padding:8px 24px 20px;">
          <a href="${esc(g.panelUrl)}" style="display:inline-block;background:${AKSAN};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px;">Takvimi aç →</a>
        </td></tr>` : ''}
        <tr><td style="background:#f8fafc;border-top:1px solid ${BORDER};padding:14px 24px;">
          <div style="font-size:11.5px;color:${MUTED};">Pazartesi 07:00'de haftalık tam özet; diğer sabahlar yalnız bugün ve yarının işleri (iş yoksa gönderilmez) · <a href="mailto:info@konstraerp.com" style="color:${AKSAN};text-decoration:none;">info@konstraerp.com</a></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  // ── düz metin ──
  const tag = (e: { etiket: string | null }) => (e.etiket ? ` [${e.etiket}]` : '')
  const textGun = gunler.map((d) => {
    const evs = gunMap.get(gunKey(d)) ?? []
    const head = gunEtiketi(d, bugun)
    if (evs.length === 0) return `${head}\n  — etkinlik yok`
    return `${head}\n` + evs.map((e) => `  ${saat(e.baslar)}${e.biter ? '–' + saat(e.biter) : ''}  [${turMeta(e.tur).label}] ${e.borclu ?? e.baslik}${e.hukukNo ? ' · ' + e.hukukNo : ''}${e.yer ? ' · ' + e.yer : ''}${tag(e)}`).join('\n')
  }).join('\n\n')
  const textZa = za.length ? `\n\nYAKLAŞAN ZAMANAŞIMI (${za.length}):\n` + zaGoster.map((z) => `  ${z.borclu ?? z.hukukNo ?? '—'} · ${z.hukukNo ?? ''} · ${tarihTR(z.tarih)} (${z.kalanGun}g)${tag(z)}`).join('\n') + (zaKalan > 0 ? `\n  … ve ${zaKalan} dosya daha (panelde)` : '') : ''
  const textZaGecti = zaGecti.length ? `\n\n⛔ ZAMANAŞIMI GEÇTİ — TAKİP AÇILMAMIŞ (${zaGecti.length}):\n` + zaGectiGoster.map((z) => `  ${z.borclu ?? z.hukukNo ?? '—'} · ${z.hukukNo ?? ''} · ${tarihTR(z.tarih)} (${Math.abs(z.kalanGun)}g önce)${tag(z)}`).join('\n') + (zaGectiKalan > 0 ? `\n  … ve ${zaGectiKalan} dosya daha (panelde)` : '') : ''
  const textZaBos = zaBosNot.length ? `\n\nUYARI: ${zaBosNot.map((b) => (cok ? `${b.etiket}: ${b.zaBos}` : `${b.zaBos}`)).join(', ')} açık dosyada zamanaşımı tarihi boş — bu dosyalar zamanaşımı radarının DIŞINDA.` : ''
  const text = `Günaydın ${g.aliciAd},\nÖnümüzdeki ${gunSayisi} günde ${pencere.length} etkinlik${cok ? ` (${bolumSayilar.map((b) => `${b.etiket} ${b.adet}`).join(' · ')})` : ''}.\n${aralik}${textZaGecti}\n\n${textGun}${textZa}${textZaBos}\n\n—\nPazartesi 07:00'de haftalık tam özet; diğer sabahlar yalnız bugün ve yarının işleri · info@konstraerp.com`

  return { konu, html, text }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// S30 · ORTAK YARDIMCILAR (pano + Ray raporu)
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Prisma Decimal, sayı ya da metin. */
export type DecimalBenzeri = number | string | { toString(): string } | null | undefined
type TarihBenzeri = Date | string | null | undefined

/** Decimal/sayı/metin → sayı (boş ya da okunamaz → null). */
export function sayiOku(x: DecimalBenzeri): number | null {
  if (x == null) return null
  const ham = typeof x === 'number' ? x : String(x).trim()
  if (ham === '') return null
  const n = typeof ham === 'number' ? ham : Number(ham)
  return Number.isFinite(n) ? n : null
}

function tarihOku(x: unknown): Date | null {
  if (x == null || x === '') return null
  if (x instanceof Date) return Number.isNaN(x.getTime()) ? null : x
  if (typeof x === 'string' || typeof x === 'number') {
    const d = new Date(x)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/**
 * Excel tarih hücresi: İstanbul takvim günü → o günün UTC gece yarısı. ExcelJS tarihi UTC olarak yazar; İstanbul
 * gece yarısı (= önceki gün 21:00 UTC) olarak saklanan tarih aksi hâlde Excel'de BİR GÜN ERKEN görünür.
 */
export function excelGunu(d: TarihBenzeri): Date | null {
  const x = tarihOku(d)
  if (!x) return null
  const ist = new Date(x.getTime() + 3 * 3_600_000)
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()))
}

type Izli = { silindiAt?: TarihBenzeri; teyit?: string | null }
/** Silinmemiş ve reddedilmemiş kayıt (hukuki kayıt silinmez; silindiAt dolu olan rapora ve panoya girmez). */
const etkin = (x: Izli) => !x.silindiAt && x.teyit !== 'REDDEDILDI'
const adayMi = (x: { teyit?: string | null }) => x.teyit === 'ADAY'
const enKucuk = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a.getTime() <= b.getTime() ? a : b)
const metinVeya = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null)
const trSirala = (a: string, b: string) => a.localeCompare(b, 'tr')

function nesne(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null
}
function strOku(x: unknown): string | null {
  return typeof x === 'string' && x.trim() ? x.trim() : null
}
function sayiAlan(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null
}

/** RucuDosyasi.eksenJson → eksen başına teyit ('TEYITLI' | 'TEYITSIZ' | …). Şekil: {icra:{teyit,…}, arab:{…}, dava:{…}}. */
export function eksenTeyitleri(json: unknown): { icra: string | null; arab: string | null; dava: string | null } {
  const o = nesne(json)
  const t = (k: string) => strOku(nesne(o?.[k])?.teyit)
  return { icra: t('icra'), arab: t('arab'), dava: t('dava') }
}

// ── etiket sözlükleri (eksen dili: RucuDosyasi.icraEksen/arabEksen/davaEksen ve Dava kolonları) ──
export const ICRA_EKSEN_ETIKET: Record<string, string> = {
  TAKIP_YOK: 'Takip açılmadı',
  IDARI_YOL: 'İdari yol',
  TEVZI: 'Takip açıldı (tevzi)',
  TEBLIG_BEKLENIYOR: 'Tebliğ bekleniyor',
  ITIRAZ_SURESI: 'İtiraz süresi işliyor',
  DURDU_ITIRAZ: 'Durdu (itiraz)',
  KISMEN_DURDU: 'Kısmen durdu',
  KESINLESTI: 'Kesinleşti',
  INFAZ: 'İnfaz',
  TAHSIL: 'Tahsil',
  KAPALI: 'Kapalı',
  BILINMIYOR: "Bilinmiyor, UYAP'ta teyit edin",
}
export const ARAB_EKSEN_ETIKET: Record<string, string> = {
  HAZIRLIK: 'Hazırlık',
  DEVAM: 'Sürüyor',
  SON_TUTANAK_ANLASMA: 'Anlaşma (son tutanak)',
  SON_TUTANAK_DIGER: 'Anlaşma yok (son tutanak)',
}
export const DAVA_EKSEN_ETIKET: Record<string, string> = {
  HAZIRLIK: 'Hazırlık',
  DERDEST: 'Derdest',
  ISLEMDEN_KALDIRILDI: 'İşlemden kaldırıldı',
  KARAR: 'Karar',
  KANUN_YOLU: 'Kanun yolunda',
  KESINLESTI: 'Kesinleşti',
}
export const DAVA_EVRE_ETIKET: Record<string, string> = {
  TENSIP_BEKLENIYOR: 'Tensip bekleniyor',
  DILEKCELER: 'Dilekçeler',
  ON_INCELEME: 'Ön inceleme',
  TAHKIKAT: 'Tahkikat',
  KARAR_BEKLENIYOR: 'Karar bekleniyor',
}
export const HUKUM_ETIKET: Record<string, string> = { KABUL: 'Kabul', KISMEN_KABUL: 'Kısmen kabul', RET: 'Ret', DIGER: 'Diğer' }
export const MAHKEME_TURU_ETIKET: Record<string, string> = {
  ASLIYE_HUKUK: 'Asliye Hukuk Mahkemesi',
  ASLIYE_TICARET: 'Asliye Ticaret Mahkemesi',
  TUKETICI: 'Tüketici Mahkemesi',
  SULH_HUKUK: 'Sulh Hukuk Mahkemesi',
  ICRA_HUKUK: 'İcra Hukuk Mahkemesi',
  BAM: 'Bölge Adliye Mahkemesi',
  YARGITAY: 'Yargıtay',
}
export const KAPANIS_ETIKET: Record<string, string> = {
  TAHSIL: 'Tahsil',
  HARICEN_TAHSIL: 'Haricen tahsil',
  SULH: 'Sulh',
  FERAGAT: 'Feragat',
  ISLEMDEN_KALDIRMA: 'İşlemden kaldırma',
  ACIZ: 'Aciz',
  BILINMIYOR: 'Sebep bilinmiyor',
}
const IHTIYATI_SONUC_ETIKET: Record<string, string> = { KABUL: 'Kabul', RED: 'Ret', KISMEN: 'Kısmen kabul' }

/** "İstanbul 5. Asliye Hukuk Mahkemesi" — kısaltma yok (06, Görsel dil). Bilgi yoksa null. */
export function mahkemeAdi(d: { mahkemeTuru?: string | null; mahkemeYer?: string | null; mahkemeNo?: string | null }): string | null {
  const tur = d.mahkemeTuru ? MAHKEME_TURU_ETIKET[d.mahkemeTuru] ?? d.mahkemeTuru : null
  const no = metinVeya(d.mahkemeNo) ? `${metinVeya(d.mahkemeNo)!.replace(/\.$/, '')}.` : null
  const parca = d.mahkemeTuru === 'BAM' || d.mahkemeTuru === 'YARGITAY'
    ? [metinVeya(d.mahkemeYer), tur, no ? `${no} Hukuk Dairesi` : null]
    : [metinVeya(d.mahkemeYer), no, tur]
  const s = parca.filter(Boolean).join(' ')
  return s || null
}

/** Esas no "2026/123"; yıl ya da sıra eksikse null (yarım numara gösterilmez). */
export function esasNo(d: { esasYil?: number | null; esasSira?: number | null }): string | null {
  return d.esasYil && d.esasSira ? `${d.esasYil}/${d.esasSira}` : null
}

/** Dosyanın ana davası: silinmemiş; önce davacı olduğumuz, sonra ilk derece, sonra en yeni kayıt. */
export function anaDava<T extends { rolumuz?: string | null; derece?: number | null; createdAt?: TarihBenzeri; silindiAt?: TarihBenzeri }>(
  davalar: T[] | null | undefined,
): T | null {
  const liste = (davalar ?? []).filter((d) => !d.silindiAt)
  if (!liste.length) return null
  return [...liste].sort((a, b) => {
    const rol = (a.rolumuz === 'DAVALI' ? 1 : 0) - (b.rolumuz === 'DAVALI' ? 1 : 0)
    if (rol) return rol
    const derece = (a.derece ?? 1) - (b.derece ?? 1)
    if (derece) return derece
    return (tarihOku(b.createdAt)?.getTime() ?? 0) - (tarihOku(a.createdAt)?.getTime() ?? 0)
  })[0]
}

/** Bugünden itibaren en yakın duruşma / ön inceleme (geçmiş tarih "sonraki" sayılmaz). */
function sonrakiDurusmaTarihi(d: { sonrakiDurusma?: TarihBenzeri; onIncelemeTarihi?: TarihBenzeri }, bugun: Date): Date | null {
  const bas = bugunIstBasi(bugun).getTime()
  return [tarihOku(d.sonrakiDurusma), tarihOku(d.onIncelemeTarihi)]
    .filter((t): t is Date => !!t && t.getTime() >= bas)
    .reduce<Date | null>((a, b) => enKucuk(a, b), null)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// S30 · RAY TAKİP RAPORU (30 SÜTUN)
// Ray takip Excel'inin sütun düzeni (docs 04 §4.2). Her sütun bir alandan ya da türetilmiş eksenden gelir
// (06 §3.5'in tersi); "yeri olmadığı için boş" sütun yoktur. Teyitsiz hücre ve satır işaretlenir.
// ════════════════════════════════════════════════════════════════════════════════════════════════

export type RayHucreTuru = 'metin' | 'tarih' | 'para'
export type RaySutun = { no: number; baslik: string; kaynak: string; tur: RayHucreTuru; genislik: number }

/** Başlıklar Ray takip Excel'indeki yazımla BİREBİR (değiştirmeyin; Ray kendi Excel'ine yapıştırır). */
export const RAY_30_SUTUNLAR: readonly RaySutun[] = [
  { no: 1, baslik: 'HUKUK DOSYA NO', kaynak: 'RucuDosyasi.hukukDosyaNo', tur: 'metin', genislik: 18 },
  { no: 2, baslik: 'HASAR DOSYA NO', kaynak: 'RucuDosyasi.hasarDosyaNo', tur: 'metin', genislik: 18 },
  { no: 3, baslik: 'HASAR TARİHİ', kaynak: 'RucuDosyasi.hasarTarihi', tur: 'tarih', genislik: 12 },
  { no: 4, baslik: 'ZAMAN AŞIMI', kaynak: "RucuDosyasi.zamanasimi (Ray'in tarihi)", tur: 'tarih', genislik: 12 },
  { no: 5, baslik: 'RÜCU SEBEBİ', kaynak: 'RucuDosyasi.rucuSebebi (ham; yoksa rucuSebebiKod)', tur: 'metin', genislik: 26 },
  { no: 6, baslik: 'RÜCU ORANI', kaynak: 'RucuDosyasi.rucuOrani', tur: 'metin', genislik: 10 },
  { no: 7, baslik: 'RÜCU TUTARI', kaynak: 'RucuDosyasi.rucuTutari', tur: 'para', genislik: 15 },
  { no: 8, baslik: 'DAVA MİKTARI', kaynak: 'RucuDosyasi.davaMiktari', tur: 'para', genislik: 15 },
  { no: 9, baslik: 'KADROLU AVUKAT', kaynak: 'RucuDosyasi.kadroluAvukat', tur: 'metin', genislik: 18 },
  { no: 10, baslik: 'SÖZLEŞMELİ AVUKAT', kaynak: 'RucuDosyasi.sozlesmeliAvukat', tur: 'metin', genislik: 18 },
  { no: 11, baslik: 'İNCELEMEYE GÖNDEREN KİŞİ', kaynak: 'RucuDosyasi.kaynakJson.incelemeyeGonderen', tur: 'metin', genislik: 18 },
  { no: 12, baslik: 'İNCELEYEN KİŞİ', kaynak: 'RucuDosyasi.kaynakJson.inceleyen', tur: 'metin', genislik: 18 },
  { no: 13, baslik: 'AVUKAT YARD. GÖNDEREN KİŞİ', kaynak: 'RucuDosyasi.kaynakJson.yardimciyaGonderen (eski: avYardGonderen)', tur: 'metin', genislik: 18 },
  { no: 14, baslik: 'İŞLEM YAPAN AVUKAT YARD.', kaynak: 'RucuDosyasi.islemYapanYrd', tur: 'metin', genislik: 18 },
  { no: 15, baslik: 'İCRA MÜDÜRLÜĞÜ', kaynak: 'RucuDosyasi.icraDairesi', tur: 'metin', genislik: 24 },
  { no: 16, baslik: 'İCRA ESAS', kaynak: 'RucuDosyasi.icraDosyaNo', tur: 'metin', genislik: 14 },
  { no: 17, baslik: 'TAKİP TARİHİ', kaynak: 'RucuDosyasi.takipTarihi', tur: 'tarih', genislik: 12 },
  { no: 18, baslik: 'TAKİP ÇIKIŞI', kaynak: 'TakipTalebi.toplam (geçerli sürüm)', tur: 'para', genislik: 15 },
  { no: 19, baslik: 'SON DURUM', kaynak: 'Türetilmiş: icraEksen + arabEksen + davaEksen (kapanışta kapanisSebebi)', tur: 'metin', genislik: 34 },
  { no: 20, baslik: 'MAHKEME', kaynak: 'Dava.mahkemeYer + mahkemeNo + mahkemeTuru (yoksa Asama(DAVA).birim)', tur: 'metin', genislik: 30 },
  { no: 21, baslik: 'ESAS', kaynak: 'Dava.esasYil / esasSira (yoksa Asama(DAVA).kimlikNo)', tur: 'metin', genislik: 12 },
  { no: 22, baslik: 'DAVALI', kaynak: 'DavaTaraf(rol = DAVALI)', tur: 'metin', genislik: 26 },
  { no: 23, baslik: 'ÜST DOSYA NO', kaynak: 'Dava.ustDosyaNoHam', tur: 'metin', genislik: 14 },
  { no: 24, baslik: 'DAVA SON DURUM', kaynak: 'Türetilmiş: davaEksen + Dava.evre / hüküm', tur: 'metin', genislik: 28 },
  { no: 25, baslik: 'DAVA AÇILIŞ TARİHİ', kaynak: 'Dava.acilisTarihi (yoksa Asama(DAVA).baslangic)', tur: 'tarih', genislik: 12 },
  { no: 26, baslik: 'DURUŞMA TARİHİ', kaynak: 'Dava.sonrakiDurusma / onIncelemeTarihi + Etkinlik(DURUSMA)', tur: 'tarih', genislik: 14 },
  { no: 27, baslik: 'İHTİYATİ HACİZ', kaynak: 'IhtiyatiHaciz (talep, sonuç, karar tarihi, teminat)', tur: 'metin', genislik: 26 },
  { no: 28, baslik: 'DEKONT', kaynak: 'DavaIslem(tur = DEKONT_SUNUMU, referansNo = iş emri no)', tur: 'metin', genislik: 22 },
  { no: 29, baslik: 'DELİL DİLEKÇESİ', kaynak: 'DavaIslem(tur = DELIL_DILEKCESI)', tur: 'tarih', genislik: 14 },
  { no: 30, baslik: 'MÜZEKKERE CEVAP', kaynak: 'DavaIslem(tur = MUZEKKERE / MUZEKKERE_CEVABI)', tur: 'metin', genislik: 26 },
]

/** Hücre: değer (metin, sayı ya da Excel günü) + teyitsizse sebebi. */
export type RayHucre = { deger: string | number | Date | null; teyitsiz: string | null }
export type RaySatir = { hucreler: RayHucre[]; teyitsiz: boolean; teyitNotlari: string[]; davaAsamasinda: boolean }

export type RayTaraf = { rol: string; borcluId?: string | null; adHam?: string | null; teyit?: string | null; silindiAt?: TarihBenzeri }
export type RayIslem = { tur: string; tarih?: TarihBenzeri; referansNo?: string | null; excelHam?: string | null; teyit?: string | null; silindiAt?: TarihBenzeri }
export type RayIhtiyatiHaciz = {
  talepTarihi?: TarihBenzeri; sonuc?: string | null; kararTarihi?: TarihBenzeri; teminatOrani?: string | null
  teminatTutari?: DecimalBenzeri; excelHam?: string | null; teyit?: string | null; silindiAt?: TarihBenzeri
}
export type RayDava = {
  rolumuz?: string | null; derece?: number | null
  mahkemeTuru?: string | null; mahkemeYer?: string | null; mahkemeNo?: string | null; esasYil?: number | null; esasSira?: number | null
  ustDosyaNoHam?: string | null; acilisTarihi?: TarihBenzeri; sonrakiDurusma?: TarihBenzeri; onIncelemeTarihi?: TarihBenzeri
  evre?: string | null; durum?: string | null; hukum?: string | null; kararTarihi?: TarihBenzeri; kararOnayAt?: TarihBenzeri
  kesinlesmeTarihi?: TarihBenzeri; silindiAt?: TarihBenzeri; createdAt?: TarihBenzeri
  /** Asama(DAVA).detayJson — kayıt işareti {kaynakTuru, teyit}; ADAY ise dava künyesi teyitsiz (lib/konsrucu/dava/kayit.ts). */
  asamaDetayJson?: unknown
  taraflar?: RayTaraf[]; islemler?: RayIslem[]
}
export type RayDosyaGirdi = {
  hukukDosyaNo: string | null; hasarDosyaNo: string | null; hasarTarihi: TarihBenzeri; zamanasimi: TarihBenzeri
  rucuSebebi: string | null; rucuSebebiKod?: string | null; rucuOrani: string | null; rucuTutari: DecimalBenzeri; davaMiktari: DecimalBenzeri
  kadroluAvukat: string | null; sozlesmeliAvukat: string | null; kaynakJson: unknown; islemYapanYrd: string | null
  icraDairesi: string | null; icraDosyaNo: string | null; takipTarihi: TarihBenzeri
  durum: string; icraEksen?: string | null; arabEksen?: string | null; davaEksen?: string | null; eksenJson?: unknown; kapanisSebebi?: string | null
  borclular?: { id: string; adUnvan: string }[]
  takipTalepleri?: { toplam: DecimalBenzeri; gecerli?: boolean | null; surum?: number | null; onaylayanId?: string | null; dondurulduAt?: TarihBenzeri; silindiAt?: TarihBenzeri }[]
  asamalar?: { tur: string; birim?: string | null; kimlikNo?: string | null; baslangic?: TarihBenzeri; sonuc?: string | null; durum?: string | null }[]
  etkinlikler?: { tur: string; baslar: TarihBenzeri; durum?: string | null; kaynak?: string | null; teyit?: string | null }[]
  ihtiyatiHacizler?: RayIhtiyatiHaciz[]
  davalar?: RayDava[]
}

function kaynakMetin(json: unknown, ...anahtarlar: string[]): string | null {
  const o = nesne(json)
  for (const k of anahtarlar) {
    const v = strOku(o?.[k])
    if (v) return v
  }
  return null
}

/** #19 SON DURUM: üç eksenden türetilir (06 §3.6: tek doğruluk kaynağı eksenlerdir). Eksen yoksa eski durum, teyitsiz. */
export function genelSonDurum(d: Pick<RayDosyaGirdi, 'durum' | 'icraEksen' | 'arabEksen' | 'davaEksen' | 'eksenJson' | 'kapanisSebebi'>): { metin: string; teyitsiz: string | null } {
  if (d.kapanisSebebi) return { metin: `Kapandı: ${KAPANIS_ETIKET[d.kapanisSebebi] ?? d.kapanisSebebi}`, teyitsiz: null }
  const t = eksenTeyitleri(d.eksenJson)
  const parca: string[] = []
  const teyitsiz: string[] = []
  if (d.icraEksen) {
    parca.push(`İcra: ${ICRA_EKSEN_ETIKET[d.icraEksen] ?? d.icraEksen}`)
    if (t.icra !== 'TEYITLI') teyitsiz.push('icra')
  }
  if (d.arabEksen && d.arabEksen !== 'YOK') {
    parca.push(`Arabuluculuk: ${ARAB_EKSEN_ETIKET[d.arabEksen] ?? d.arabEksen}`)
    if (t.arab !== 'TEYITLI') teyitsiz.push('arabuluculuk')
  }
  if (d.davaEksen && d.davaEksen !== 'YOK') {
    parca.push(`Dava: ${DAVA_EKSEN_ETIKET[d.davaEksen] ?? d.davaEksen}`)
    if (t.dava !== 'TEYITLI') teyitsiz.push('dava')
  }
  if (!parca.length) return { metin: asamaBilgi(d.durum).label, teyitsiz: 'Durum eksenleri henüz hesaplanmadı; eski durum alanı gösteriliyor' }
  return { metin: parca.join(' · '), teyitsiz: teyitsiz.length ? `Teyitsiz eksen: ${teyitsiz.join(', ')}` : null }
}

/** #24 DAVA SON DURUM: davaEksen + evre / hüküm. Kesinleşme şerhi yoksa "kesinleşti" yazılmaz. */
export function davaSonDurum(
  d: Pick<RayDosyaGirdi, 'davaEksen' | 'eksenJson'>,
  dava: RayDava | null,
  davaAsama: { sonuc?: string | null; durum?: string | null } | null,
): { metin: string | null; teyitsiz: string | null } {
  const eksenVar = !!d.davaEksen && d.davaEksen !== 'YOK'
  if (!dava) {
    if (davaAsama) return { metin: metinVeya(davaAsama.sonuc) ?? (davaAsama.durum === 'DEVAM' ? 'Derdest' : davaAsama.durum ?? null), teyitsiz: 'Dava kaydı yok; eski aşama kaydından' }
    if (eksenVar) return { metin: DAVA_EKSEN_ETIKET[d.davaEksen!] ?? d.davaEksen!, teyitsiz: 'Dava kaydı yok; yalnız eksenden' }
    return { metin: null, teyitsiz: null }
  }
  const kod = eksenVar ? d.davaEksen! : dava.durum ?? 'DERDEST'
  const notlar: string[] = []
  let metin = DAVA_EKSEN_ETIKET[kod] ?? kod
  if (kod === 'KESINLESTI') {
    if (tarihOku(dava.kesinlesmeTarihi)) metin = `Kesinleşti (${tarihTR(dava.kesinlesmeTarihi)})`
    else { metin = 'Karar (kesinleşme şerhi görülmedi)'; notlar.push('Kesinleşme şerhi yok') }
  }
  if (kod === 'DERDEST' && dava.evre) metin += ` · ${DAVA_EVRE_ETIKET[dava.evre] ?? dava.evre}`
  if ((kod === 'KARAR' || kod === 'KANUN_YOLU') && dava.hukum && dava.kararOnayAt) {
    metin += ` · ${HUKUM_ETIKET[dava.hukum] ?? dava.hukum}${dava.kararTarihi ? ` (${tarihTR(dava.kararTarihi)})` : ''}`
  }
  if (!eksenVar) notlar.push('Dava ekseni hesaplanmadı; dava kaydındaki durum')
  else if (eksenTeyitleri(d.eksenJson).dava !== 'TEYITLI') notlar.push('Dava durumu teyit edilmedi')
  return { metin, teyitsiz: notlar.length ? notlar.join(' · ') : null }
}

function davaliHucresi(dava: RayDava | null, borclular: { id: string; adUnvan: string }[] = []): RayHucre {
  const taraflar = (dava?.taraflar ?? []).filter((t) => etkin(t) && t.rol === 'DAVALI')
  if (!taraflar.length) return { deger: null, teyitsiz: null }
  const adlar = taraflar
    .map((t) => borclular.find((b) => b.id === t.borcluId)?.adUnvan ?? metinVeya(t.adHam))
    .filter((x): x is string => !!x)
  return { deger: adlar.length ? Array.from(new Set(adlar)).join('; ') : null, teyitsiz: taraflar.some(adayMi) ? 'Davalı önerisi onaylanmadı' : null }
}

/** #26: en yakın (bugün ve sonrası) duruşma / ön inceleme. UYAP ile Excel tarihi farklıysa ikisi yan yana, teyitsiz. */
function durusmaHucresi(dava: RayDava | null, etkinlikler: RayDosyaGirdi['etkinlikler'], bugun: Date): RayHucre {
  const bas = bugunIstBasi(bugun).getTime()
  type Aday = { t: Date; kaynak: string; aday: boolean }
  const adaylar: Aday[] = []
  for (const t of [tarihOku(dava?.sonrakiDurusma), tarihOku(dava?.onIncelemeTarihi)]) if (t) adaylar.push({ t, kaynak: 'DAVA', aday: false })
  for (const e of etkinlikler ?? []) {
    const t = tarihOku(e.baslar)
    if (!t || e.tur !== 'DURUSMA' || e.durum === 'IPTAL' || e.teyit === 'REDDEDILDI') continue
    adaylar.push({ t, kaynak: e.kaynak ?? 'ELLE', aday: adayMi(e) })
  }
  const gelecek = adaylar.filter((a) => a.t.getTime() >= bas).sort((a, b) => a.t.getTime() - b.t.getTime())
  if (!gelecek.length) return { deger: null, teyitsiz: null }
  const uyap = gelecek.find((a) => a.kaynak === 'UYAP')
  const excel = gelecek.find((a) => a.kaynak === 'EXCEL')
  if (uyap && excel && kalanGun(uyap.t, excel.t) !== 0) {
    return { deger: `${tarihTR(uyap.t)} (UYAP) / ${tarihTR(excel.t)} (Excel)`, teyitsiz: 'Duruşma tarihi UYAP ile Excel arasında farklı' }
  }
  const ilk = gelecek[0]
  return { deger: excelGunu(ilk.t), teyitsiz: ilk.aday ? 'Duruşma tarihi önerisi onaylanmadı' : null }
}

function ihtiyatiHacizHucresi(liste: RayIhtiyatiHaciz[] | undefined): RayHucre {
  const secili = (liste ?? []).filter(etkin)
  if (!secili.length) return { deger: null, teyitsiz: null }
  let ayristirilamadi = false
  const metinler = secili
    .map((h) => {
      const p: string[] = []
      if (tarihOku(h.talepTarihi)) p.push(`Talep ${tarihTR(h.talepTarihi)}`)
      if (h.sonuc && h.sonuc !== 'BEKLIYOR') p.push(`${IHTIYATI_SONUC_ETIKET[h.sonuc] ?? h.sonuc}${tarihOku(h.kararTarihi) ? ` ${tarihTR(h.kararTarihi)}` : ''}`)
      else if (p.length) p.push('karar bekleniyor')
      const teminat = metinVeya(h.teminatOrani) ?? (sayiOku(h.teminatTutari) != null ? paraTR(sayiOku(h.teminatTutari)) : null)
      if (teminat) p.push(`teminat ${teminat}`)
      if (p.length) return p.join(' · ')
      const ham = metinVeya(h.excelHam)
      if (ham) { ayristirilamadi = true; return `${ham} (ayrıştırılamadı, elle tamamlayın)` }
      return null
    })
    .filter((x): x is string => !!x)
  const notlar = [secili.some(adayMi) ? 'İhtiyati haciz kaydı onaylanmadı' : null, ayristirilamadi ? 'Excel hücresi ayrıştırılamadı' : null].filter(Boolean)
  return { deger: metinler.length ? metinler.join('; ') : null, teyitsiz: notlar.length ? notlar.join(' · ') : null }
}

function islemHucresi(islemler: RayIslem[], turler: string[], bicim: (i: RayIslem) => string | null, adayNotu: string, tekTarih = false): RayHucre {
  const secili = islemler
    .filter((i) => turler.includes(i.tur))
    .sort((a, b) => (tarihOku(a.tarih)?.getTime() ?? 0) - (tarihOku(b.tarih)?.getTime() ?? 0))
  if (!secili.length) return { deger: null, teyitsiz: null }
  const notlar = [secili.some(adayMi) ? adayNotu : null]
  if (tekTarih && secili.length === 1 && tarihOku(secili[0].tarih)) {
    return { deger: excelGunu(secili[0].tarih), teyitsiz: notlar.filter(Boolean).join(' · ') || null }
  }
  let ayristirilamadi = false
  const parca = secili
    .map((i) => {
      const m = bicim(i)
      if (m) return m
      const ham = metinVeya(i.excelHam)
      if (ham) { ayristirilamadi = true; return `${ham} (ayrıştırılamadı, elle tamamlayın)` }
      return null
    })
    .filter((x): x is string => !!x)
  if (ayristirilamadi) notlar.push('Excel hücresi ayrıştırılamadı')
  const n = notlar.filter(Boolean)
  return { deger: parca.length ? parca.join('; ') : null, teyitsiz: n.length ? n.join(' · ') : null }
}

/** Tek dosya → Ray raporunun bir satırı (30 hücre, RAY_30_SUTUNLAR sırasıyla). */
export function raySatiri(d: RayDosyaGirdi, bugun: Date = new Date()): RaySatir {
  const h = new Map<number, RayHucre>()
  const koy = (no: number, deger: RayHucre['deger'], teyitsiz: string | null = null) => h.set(no, { deger: deger === '' ? null : deger, teyitsiz })
  const koyH = (no: number, c: RayHucre) => h.set(no, c)

  koy(1, metinVeya(d.hukukDosyaNo))
  koy(2, metinVeya(d.hasarDosyaNo))
  koy(3, excelGunu(d.hasarTarihi))
  koy(4, excelGunu(d.zamanasimi))
  koy(5, metinVeya(d.rucuSebebi) ?? metinVeya(d.rucuSebebiKod))
  koy(6, metinVeya(d.rucuOrani))
  koy(7, sayiOku(d.rucuTutari))
  koy(8, sayiOku(d.davaMiktari))
  koy(9, metinVeya(d.kadroluAvukat))
  koy(10, metinVeya(d.sozlesmeliAvukat))
  koy(11, kaynakMetin(d.kaynakJson, 'incelemeyeGonderen'))
  koy(12, kaynakMetin(d.kaynakJson, 'inceleyen'))
  koy(13, kaynakMetin(d.kaynakJson, 'yardimciyaGonderen', 'avYardGonderen'))
  koy(14, metinVeya(d.islemYapanYrd))
  koy(15, metinVeya(d.icraDairesi))
  koy(16, metinVeya(d.icraDosyaNo))
  koy(17, excelGunu(d.takipTarihi))

  // #18 — geçerli takip talebi (en yüksek sürüm); onaylanmamış ya da dondurulmamışsa teyitsiz
  const tt = (d.takipTalepleri ?? [])
    .filter((t) => !t.silindiAt && t.gecerli !== false)
    .sort((a, b) => (b.surum ?? 0) - (a.surum ?? 0))[0]
  const ttTutar = tt ? sayiOku(tt.toplam) : null
  koy(18, ttTutar, ttTutar != null && !tt!.onaylayanId && !tarihOku(tt!.dondurulduAt) ? 'Takip talebi tutarı avukat onayı bekliyor' : null)

  const genel = genelSonDurum(d)
  koy(19, genel.metin, genel.teyitsiz)

  const dava = anaDava(d.davalar)
  const davaAsama = (d.asamalar ?? []).find((a) => a.tur === 'DAVA') ?? null
  // Excel'den ya da geri doldurmadan gelen, avukatın henüz onaylamadığı dava kaydı: künye hücreleri işaretli
  const kunyeNotu = dava && kayitIsaretiOku(dava.asamaDetayJson).teyit === 'ADAY' ? 'Dava kaydı önerisi onaylanmadı' : null
  const mahkeme = (dava ? mahkemeAdi(dava) : null) ?? metinVeya(davaAsama?.birim)
  const esas = (dava ? esasNo(dava) : null) ?? metinVeya(davaAsama?.kimlikNo)
  koy(20, mahkeme, mahkeme ? kunyeNotu : null)
  koy(21, esas, esas ? kunyeNotu : null)
  koyH(22, davaliHucresi(dava, d.borclular))
  koy(23, metinVeya(dava?.ustDosyaNoHam))
  const ds = davaSonDurum(d, dava, davaAsama)
  koy(24, ds.metin, ds.teyitsiz)
  const acilis = excelGunu(dava?.acilisTarihi ?? davaAsama?.baslangic)
  koy(25, acilis, acilis ? kunyeNotu : null)
  koyH(26, durusmaHucresi(dava, d.etkinlikler, bugun))
  koyH(27, ihtiyatiHacizHucresi(d.ihtiyatiHacizler))

  const islemler = (d.davalar ?? []).filter((x) => !x.silindiAt).flatMap((x) => x.islemler ?? []).filter(etkin)
  koyH(28, islemHucresi(
    islemler, ['DEKONT_SUNUMU'],
    (i) => [tarihOku(i.tarih) ? tarihTR(i.tarih) : null, metinVeya(i.referansNo) ? `iş emri no ${metinVeya(i.referansNo)}` : null].filter(Boolean).join(' · ') || null,
    'Dekont sunumu önerisi onaylanmadı',
  ))
  koyH(29, islemHucresi(
    islemler, ['DELIL_DILEKCESI'],
    (i) => (tarihOku(i.tarih) ? tarihTR(i.tarih) : null),
    'Delil dilekçesi önerisi onaylanmadı',
    true,
  ))
  koyH(30, islemHucresi(
    islemler, ['MUZEKKERE', 'MUZEKKERE_CEVABI'],
    (i) => {
      const t = tarihOku(i.tarih) ? tarihTR(i.tarih) : null
      const ref = metinVeya(i.referansNo)
      if (!t && !ref) return null
      return [i.tur === 'MUZEKKERE_CEVABI' ? 'Cevap' : 'Müzekkere', t, ref ? `(${ref})` : null].filter(Boolean).join(' ')
    },
    'Müzekkere önerisi onaylanmadı',
  ))

  const hucreler = RAY_30_SUTUNLAR.map((s) => h.get(s.no) ?? { deger: null, teyitsiz: null })
  const teyitNotlari = RAY_30_SUTUNLAR.flatMap((s, i) => (hucreler[i].teyitsiz ? [`#${s.no} ${s.baslik}: ${hucreler[i].teyitsiz}`] : []))
  const davaAsamasinda = !!dava || !!davaAsama || d.durum === 'DAVA' || (!!d.davaEksen && d.davaEksen !== 'YOK')
  return { hucreler, teyitsiz: teyitNotlari.length > 0, teyitNotlari, davaAsamasinda }
}

/** Bütün dosyalar → rapor tablosu (başlıklar + satırlar + özet). Excel'e yazmak export route'unun işidir. */
export function rayRaporTablo(dosyalar: RayDosyaGirdi[], bugun: Date = new Date()) {
  const satirlar = dosyalar.map((d) => raySatiri(d, bugun))
  return {
    basliklar: RAY_30_SUTUNLAR.map((s) => s.baslik),
    satirlar,
    ozet: {
      dosya: satirlar.length,
      davaAsamasinda: satirlar.filter((s) => s.davaAsamasinda).length,
      teyitsizSatir: satirlar.filter((s) => s.teyitsiz).length,
    },
  }
}

/**
 * Ray raporuna eşlik edecek e-posta TASLAĞI. Program göndermez (B17): avukat raporu kontrol eder ve kendi
 * e-postasından elle gönderir. Gövdede kişisel veri yoktur (yalnız sayılar); `uyarilar` avukata gösterilir, e-postaya girmez.
 */
export function rayRaporMailTaslagi(g: {
  musteriAd: string | null
  hazirlayanAd: string
  bugun: Date
  dosyaSayisi: number
  davaSayisi: number
  teyitsizSatir?: number | null
}): { konu: string; govde: string; uyarilar: string[] } {
  const tarih = tarihTR(g.bugun)
  const konu = `Rücu dosyaları takip raporu · ${tarih}`
  const hitap = g.musteriAd ? `Sayın ${g.musteriAd} yetkilisi,` : 'Sayın yetkili,'
  const govde = [
    hitap,
    '',
    `${tarih} tarihli rücu dosyaları takip raporunu ekte sunarız. Raporda ${g.dosyaSayisi} dosya yer alıyor; bunların ${g.davaSayisi} tanesi dava aşamasında (mahkeme, esas ve duruşma bilgileriyle).`,
    '',
    'Rapor, takip Excel\'inizin 30 sütunluk düzenindedir.',
    '',
    'Saygılarımızla,',
    g.hazirlayanAd,
  ].join('\n')
  const uyarilar = ['Program bu e-postayı göndermez. Raporu kontrol edin, kendi e-postanızdan elle gönderin.']
  if (g.teyitsizSatir && g.teyitsizSatir > 0) {
    uyarilar.push(`${g.teyitsizSatir} satırda teyitsiz bilgi var (sarı hücreler). Göndermeden önce teyit edin ya da işaretli bırakın.`)
  }
  return { konu, govde, uyarilar }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// S30 · DAVA PANOSU ÖZETİ
// Satır ve "durum güveni" TEK kaynaktan: lib/konsrucu/dava/pano.ts (panoSatiri / panoSuz / panoSirala). Böylece Davalar
// tablosu ile Pano'daki özet kartları aynı sayıyı gösterir. Burada yalnız (1) veritabanı satırlarından PanoGirdi kurulur,
// (2) özet sayılır. Dava açılmamış ama açık İİK 67 süresi olan dosya "(dava açılmadı)" satırıdır (06 §2(j) taslağı).
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Beş durum rolüyle (06, Görsel dil): tamam = yeşil, bilgi (UYAP, teyitsiz) = mavi, soluk = gri; her biri yazıyla. */
export const DAVA_GUVEN_ETIKET: Record<DurumGuveni, { etiket: string; ton: 'success' | 'info' | 'steel' }> = {
  TEYITLI: { etiket: 'TEYİTLİ', ton: 'success' },
  TEYITSIZ: { etiket: 'TEYİTSİZ', ton: 'info' },
  ESKIMIS: { etiket: 'GÜNCEL DEĞİL', ton: 'steel' },
}

/** Pano özet kartları → Davalar tablosunun süzgeçleri (lib/konsrucu/dava/pano.ts PanoSuzgec). */
/** `ton` yalnız anlamı olan kartta: teyitsiz = bilgi (mavi), süre = risk (kırmızı); diğerleri renksiz. */
export const DAVA_PANO_KARTLARI: { id: PanoSuzgec; etiket: string; ton: 'info' | 'danger' | null }[] = [
  { id: 'teyitsiz', etiket: 'Teyitsiz', ton: 'info' },
  { id: 'sure30', etiket: '30 gün içinde süre', ton: 'danger' },
  { id: 'sessiz60', etiket: '60 gündür sessiz', ton: null },
  { id: 'karsi', etiket: 'Karşı taraf davası', ton: null },
]

type PanoIslemKaydi = { tur: string; tarih: Date | null; createdAt: Date; teyit: string; silindiAt?: Date | null }
type PanoSureKaydi = { tur: string; onaylananSonGun: Date | null; onerilenIhtiyatli: Date | null; durum: string; silindiAt?: Date | null }

/** Dava satırı (prisma.dava.findMany çıktısının düzleştirilmiş hâli). */
export type DavaPanoKaydi = {
  id: string; dosyaId: string; hukukDosyaNo: string | null
  mahkemeTuru: string | null; mahkemeYer: string | null; mahkemeNo: string | null; esasYil: number | null; esasSira: number | null
  evre: string | null; durum: string | null; rolumuz: string | null
  sonrakiDurusma: Date | null; onIncelemeTarihi: Date | null; uyapDosyaId: string | null
  asamaDetayJson: unknown; updatedAt: Date | null; silindiAt?: Date | null
  islemler: PanoIslemKaydi[]; sureler: PanoSureKaydi[]
}
/** Davası olmayan dosyanın süre satırı (yalnız İİK 67 "(dava açılmadı)" satırı doğurur). */
export type DavasizSureKaydi = PanoSureKaydi & { dosyaId: string; hukukDosyaNo: string | null; dosyaUpdatedAt: Date | null }

const PANO_ACIK_SURE = ['ACIK', 'KAPANMAYA_HAZIR', 'TETIK_BEKLIYOR']

/** Veritabanı satırları → PanoGirdi[]. Silinen dava/işlem/süre ve reddedilen işlem girmez. */
export function davaPanoGirdileri(davalar: DavaPanoKaydi[], davasizSureler: DavasizSureKaydi[] = []): PanoGirdi[] {
  const etkinDavalar = davalar.filter((d) => !d.silindiAt)
  const davaliDosya = new Set(etkinDavalar.map((d) => d.dosyaId))
  const sure = (s: PanoSureKaydi) => ({ tur: s.tur, onaylananSonGun: s.onaylananSonGun, onerilenIhtiyatli: s.onerilenIhtiyatli, durum: s.durum })
  const girdiler: PanoGirdi[] = etkinDavalar.map((d) => ({
    davaId: d.id, dosyaId: d.dosyaId, hukukDosyaNo: d.hukukDosyaNo,
    mahkemeTuru: d.mahkemeTuru, mahkemeYer: d.mahkemeYer, mahkemeNo: d.mahkemeNo, esasYil: d.esasYil, esasSira: d.esasSira,
    evre: d.evre, durum: d.durum, rolumuz: d.rolumuz, sonrakiDurusma: d.sonrakiDurusma, onIncelemeTarihi: d.onIncelemeTarihi,
    uyapDosyaId: d.uyapDosyaId, asamaDetayJson: d.asamaDetayJson, updatedAt: d.updatedAt,
    islemler: d.islemler.filter((i) => !i.silindiAt && i.teyit !== 'REDDEDILDI').map((i) => ({ tur: i.tur, tarih: i.tarih, createdAt: i.createdAt, teyit: i.teyit })),
    sureler: d.sureler.filter((s) => !s.silindiAt).map(sure),
  }))
  const davasiz = new Map<string, DavasizSureKaydi[]>()
  for (const s of davasizSureler) {
    if (s.silindiAt || s.tur !== 'IIK67' || !PANO_ACIK_SURE.includes(s.durum) || davaliDosya.has(s.dosyaId)) continue
    const l = davasiz.get(s.dosyaId) ?? []
    l.push(s)
    davasiz.set(s.dosyaId, l)
  }
  for (const [dosyaId, liste] of Array.from(davasiz.entries())) {
    girdiler.push({
      davaId: null, dosyaId, hukukDosyaNo: liste[0].hukukDosyaNo,
      mahkemeTuru: null, mahkemeYer: null, mahkemeNo: null, esasYil: null, esasSira: null, evre: null, durum: null, rolumuz: null,
      sonrakiDurusma: null, onIncelemeTarihi: null, uyapDosyaId: null, asamaDetayJson: null, updatedAt: liste[0].dosyaUpdatedAt,
      islemler: [], sureler: liste.map(sure),
    })
  }
  return girdiler
}

/** Pano özet kartlarının sayıları — süzgeç sayıları Davalar tablosuyla aynı fonksiyondan (panoSuz). */
export function davaPanoOzeti(satirlar: PanoSatiri[], bugun: Date = new Date()) {
  return {
    toplam: satirlar.length,
    dava: satirlar.filter((s) => !s.davaAcilmadi).length,
    davaAcilmadi: satirlar.filter((s) => s.davaAcilmadi).length,
    teyitsiz: panoSuz(satirlar, 'teyitsiz').length,
    eskimis: satirlar.filter((s) => s.guven === 'ESKIMIS').length,
    sure30: panoSuz(satirlar, 'sure30').length,
    sureOnaysiz: satirlar.filter((s) => s.sureOnaysiz).length,
    sessiz60: panoSuz(satirlar, 'sessiz60').length,
    karsi: panoSuz(satirlar, 'karsi').length,
    durusma7: satirlar.filter((s) => s.sonraki && kalanGun(s.sonraki, bugun) <= 7).length,
  }
}

/** Pano'da gösterilecek en acil davalar (Davalar tablosunun sıralamasıyla; en çok n satır). */
export function davaPanoEnAcil(satirlar: PanoSatiri[], n = 5): PanoSatiri[] {
  return panoSirala(satirlar).slice(0, n)
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// S30 · BUGÜN MASASI
// Her dosyanın Şimdi kartı RucuDosyasi.yolHaritasiJson önbelleğinden okunur (siradakiAdim çıktısı, S20).
// Önbellek eski ya da boş olsa bile süre riski kaçmasın diye iki kural Sure tablosundan DOĞRUDAN okunur
// (06 §8.3): GN-04 (onaysız süre, ihtiyatlı son güne ≤ 14 gün ya da geçmiş) ve GN-05 (onaylı süreye ≤ 7 gün,
// kapanış kanıtı yok). GN-01 (onarım bekliyor) ve GN-03 (UYAP eşleşme sorunu) da dosya kolonlarından okunur.
// Seçim 06 §8.2 öncelik merdiveniyle: en düşük öncelik numarası; eşitlikte en yakın son gün.
// Not: önbelleğin `at` alanı yalnız içerik DEĞİŞİNCE yenilenir (yol-haritasi/gorunum.ts onbellekDegisti) → "eski önbellek"
// buradan çıkarılamaz; bu yüzden masa "güncel değil" işareti koymaz (yanlış alarm olurdu).
// ════════════════════════════════════════════════════════════════════════════════════════════════

export type MasaRol = 'A' | 'A+2' | 'H' | 'SORUMLU'
export const MASA_ROL_ETIKET: Record<MasaRol, string> = { A: 'Avukat', 'A+2': 'Avukat + ikinci teyit', H: 'Herkes', SORUMLU: 'Sorumlu' }
export const MASA_SURE_RISK_GUN = 14
export const MASA_ONAYLI_RISK_GUN = 7

function rolNormalize(r: string | null): MasaRol {
  if (!r) return 'H'
  const x = r.toUpperCase().replace(/\s+/g, '')
  if (x.startsWith('A+2')) return 'A+2'
  if (x === 'A' || x === 'AVUKAT') return 'A'
  if (x.startsWith('SORUMLU')) return 'SORUMLU'
  return 'H' // H, HERKES, "H/A" (kritikler avukatta) → herkes görür
}

/** Önbellekten gelen hedef yalnız uygulama içi göreli yol olabilir ("/…"; "//", şema ya da ters bölü yok). */
function guvenliHedef(h: string | null): string | null {
  if (!h || !h.startsWith('/') || h.startsWith('//') || h.includes('\\')) return null
  return h
}

export type OnbellekKarti = {
  metin: string; kural: string | null; oncelik: number; rol: MasaRol; sonGun: Date | null
  eylem: string | null; hedef: string | null; engel: boolean; teyitGerekli: boolean
}
export type YolHaritasiOnbellek = { simdi: OnbellekKarti | null; bekleme: string | null; sonraSayisi: number; at: Date | null }

/**
 * yolHaritasiJson → Şimdi kartı. Şekil S20'nin siradakiAdim çıktısıdır (lib/konsrucu/yol-haritasi/tipler.ts
 * SiradakiAdimSonuc: {simdi: Adim, sonra[], bekleme: Adim, bugun} + önbellek anı `at`); alan adlarında esnek okunur
 * (metin|oneri, kural|kod, eylem{etiket,hedef}|string). Sembolik eylem hedefi ("sure-onay") yol değildir → null;
 * ekran dosya adresine gider. Okunamayan ya da prova önbelleği null döner.
 */
export function yolHaritasiOku(json: unknown): YolHaritasiOnbellek | null {
  const j = nesne(json)
  if (!j || j.prova === true) return null // prova (geçmiş tarihli) çıktısı önbellek sayılmaz
  let simdi: OnbellekKarti | null = null
  const s = nesne(j.simdi)
  if (s) {
    const metin = strOku(s.metin) ?? strOku(s.oneri) ?? strOku(s.baslik) ?? strOku(s.text) ?? strOku(s.mesaj)
    if (metin) {
      const e: Record<string, unknown> | null = typeof s.eylem === 'string' ? { etiket: s.eylem } : nesne(s.eylem) ?? nesne(s.birincilEylem) ?? nesne(s.dugme)
      const sure = nesne(s.sure)
      const oncelikHam = sayiAlan(s.oncelik) ?? sayiAlan(s.o)
      const engel = s.engel === true
      simdi = {
        metin,
        kural: strOku(s.kural) ?? strOku(s.kod) ?? strOku(j.kural),
        oncelik: oncelikHam != null ? Math.min(6, Math.max(0, Math.round(oncelikHam))) : engel ? 0 : 5,
        rol: rolNormalize(strOku(s.rol)),
        sonGun: tarihOku(s.sonGun) ?? tarihOku(sure?.onaylananSonGun) ?? tarihOku(sure?.sonGun) ?? tarihOku(sure?.onerilenIhtiyatli),
        eylem: e ? strOku(e.etiket) ?? strOku(e.label) ?? strOku(e.metin) : null,
        hedef: guvenliHedef(e ? strOku(e.hedef) ?? strOku(e.href) ?? strOku(e.url) : null),
        engel,
        teyitGerekli: s.teyitGerekli === true || /teyit/i.test(strOku(s.hukukiEtiket) ?? ''),
      }
    }
  }
  const b = j.bekleme
  const bekleme = typeof b === 'string' ? b.trim() || null : strOku(nesne(b)?.metin) ?? strOku(nesne(b)?.beklenen)
  return { simdi, bekleme, sonraSayisi: Array.isArray(j.sonra) ? j.sonra.length : 0, at: tarihOku(j.at) ?? tarihOku(j.hesapAt) ?? tarihOku(j.bugun) }
}

const TAKIP_SONRASI_DURUMLAR = ['TAKIP_ACILDI', 'TEBLIG_EDILDI', 'ITIRAZ', 'ARABULUCULUK', 'DAVA', 'KESINLESTI', 'INFAZ']
const ESLESME_SEBEP: Record<string, string> = {
  DAIRE_EKSIK: 'İcra dairesi eksik',
  DAIRE_COZULEMEDI: 'İcra dairesi çözülemedi',
  BULUNAMADI: "UYAP'ta bulunamadı",
  BASKA_DAIRE: 'Başka dairede görünüyor',
  COKLU_BELIRSIZ: 'Birden çok eşleşme var',
  TARAF_UYUSMAZ: 'Alacaklı uyuşmuyor',
  HATA: 'UYAP sorgusu hata verdi',
}
/** GN-03'ün eşleşme kodları (06 §8.3). */
const GN03_KODLARI = new Set(['BASKA_DAIRE', 'BULUNAMADI', 'COKLU_BELIRSIZ', 'TARAF_UYUSMAZ'])

/**
 * "UYAP bağlı değil" süzgeci: takibi açılmış, otomasyon kapsamındaki dosya UYAP'la eşleşmiyorsa sebebi, değilse null.
 * Takip öncesi, idari yol, kapanmış ya da UYAP'ta kapalı dosya süzgece girmez.
 */
export function uyapBaglantiSorunu(d: { durum: string; uyapDurum?: string | null; icraDosyaNo?: string | null; uyapEslesme?: string | null; uyapSenkronAt?: TarihBenzeri }): string | null {
  if (!dosyaAktif(d)) return null
  const esas = metinVeya(d.icraDosyaNo)
  if (!TAKIP_SONRASI_DURUMLAR.includes(d.durum) && !esas) return null
  if (!esas) return 'İcra esas no girilmemiş; eklenti dosyayı bulamaz'
  if (d.uyapEslesme && d.uyapEslesme !== 'OK') return ESLESME_SEBEP[d.uyapEslesme] ?? `Eşleşme sorunu (${d.uyapEslesme})`
  if (!tarihOku(d.uyapSenkronAt)) return "UYAP'tan hiç çekilmedi"
  return null
}

export type MasaDosya = {
  id: string; hukukDosyaNo: string | null; hasarDosyaNo: string | null; durum: string; uyapDurum?: string | null
  icraDosyaNo?: string | null; uyapEslesme?: string | null; uyapSenkronAt?: TarihBenzeri; onarimDurumu?: string | null
  atananKullaniciId?: string | null; yolHaritasiJson?: unknown
}
export type MasaSure = {
  dosyaId: string; dayanak: string; onerilenIhtiyatli?: TarihBenzeri; onerilenSonGun?: TarihBenzeri; onaylananSonGun?: TarihBenzeri
  sorumluId?: string | null; durum: string; silindiAt?: TarihBenzeri
}
export type MasaDava = {
  dosyaId: string; rolumuz?: string | null; derece?: number | null; createdAt?: TarihBenzeri; silindiAt?: TarihBenzeri
  mahkemeTuru?: string | null; mahkemeYer?: string | null; mahkemeNo?: string | null; esasYil?: number | null; esasSira?: number | null
  sonrakiDurusma?: TarihBenzeri; onIncelemeTarihi?: TarihBenzeri
}
/** Masayı açan kişi: kullanıcı kimliği + Rol kodu (ADMIN | AVUKAT | AVUKAT_YRD | GORUNTULEYEN). */
export type MasaKim = { kullaniciId: string; rol: string }

export type MasaIs = {
  metin: string; kural: string | null; oncelik: number; rol: MasaRol
  sonGun: Date | null; kalanGun: number | null
  eylem: string; hedef: string | null
  kaynak: 'yol-haritasi' | 'sure' | 'onarim' | 'uyap'
  teyitGerekli: boolean; sorumluId: string | null
}
export type MasaSatir = {
  dosyaId: string; dosyaNo: string
  simdi: MasaIs | null
  bekleme: string | null
  hesaplanmadi: boolean
  sonraSayisi: number
  onaysizSure: { sayi: number; enYakin: Date | null; dayanak: string | null }
  uyap: string | null
  benim: boolean
  dava: { mahkeme: string | null; esas: string | null; durusma: Date | null } | null
}

const KAYNAK_SIRA: Record<MasaIs['kaynak'], number> = { 'yol-haritasi': 0, sure: 1, onarim: 2, uyap: 3 }
function isKarsilastir(a: MasaIs, b: MasaIs): number {
  const t = (d: Date | null) => (d ? d.getTime() : Number.POSITIVE_INFINITY)
  return a.oncelik - b.oncelik || t(a.sonGun) - t(b.sonGun) || KAYNAK_SIRA[a.kaynak] - KAYNAK_SIRA[b.kaynak]
}

function benimMi(is: MasaIs, d: MasaDosya, kim: MasaKim): boolean {
  if (kim.rol === 'GORUNTULEYEN') return false
  const avukat = kim.rol === 'AVUKAT' || kim.rol === 'ADMIN'
  if (is.rol === 'A' || is.rol === 'A+2') return avukat // onay/karar işleri dosya kime atanmış olursa olsun avukatındır
  if (is.rol === 'SORUMLU' && is.sorumluId) return is.sorumluId === kim.kullaniciId
  return !d.atananKullaniciId || d.atananKullaniciId === kim.kullaniciId
}

function masaSatiri(d: MasaDosya, sureler: MasaSure[], dava: MasaDava | null, kim: MasaKim, bugun: Date): MasaSatir {
  const onbellek = yolHaritasiOku(d.yolHaritasiJson)
  const adaylar: MasaIs[] = []
  const is = (x: Omit<MasaIs, 'kalanGun'>): MasaIs => ({ ...x, kalanGun: x.sonGun ? kalanGun(x.sonGun, bugun) : null })

  if (onbellek?.simdi) {
    const c = onbellek.simdi
    adaylar.push(is({ metin: c.metin, kural: c.kural, oncelik: c.oncelik, rol: c.rol, sonGun: c.sonGun, eylem: c.eylem ?? 'Dosyayı aç', hedef: c.hedef, kaynak: 'yol-haritasi', teyitGerekli: c.teyitGerekli, sorumluId: null }))
  }
  if (d.onarimDurumu === 'BEKLIYOR') {
    adaylar.push(is({ metin: 'Durum teyit gerekiyor: dosya veri onarımı bekliyor', kural: 'GN-01', oncelik: 0, rol: 'A', sonGun: null, eylem: 'Durumu teyit et', hedef: null, kaynak: 'onarim', teyitGerekli: false, sorumluId: null }))
  }
  const uyap = uyapBaglantiSorunu(d)
  if (uyap && d.uyapEslesme && GN03_KODLARI.has(d.uyapEslesme)) {
    adaylar.push(is({ metin: `Daireyi ya da esası kontrol edin: ${uyap}`, kural: 'GN-03', oncelik: 0, rol: 'H', sonGun: null, eylem: 'Düzelt', hedef: null, kaynak: 'uyap', teyitGerekli: false, sorumluId: null }))
  }

  // süreler — yalnız ACIK (TETİK_BEKLİYOR'un günü yok; KAPANMAYA_HAZIR'ın kanıtı var)
  const acik = sureler.filter((s) => !s.silindiAt && s.durum === 'ACIK')
  let onaysizEnYakin: { tarih: Date; s: MasaSure } | null = null
  let onaysizSayi = 0
  let onayliEnYakin: { tarih: Date; s: MasaSure } | null = null
  for (const s of acik) {
    const onaylanan = tarihOku(s.onaylananSonGun)
    if (!onaylanan) {
      onaysizSayi++
      const t = tarihOku(s.onerilenIhtiyatli) ?? tarihOku(s.onerilenSonGun)
      if (t && (!onaysizEnYakin || t.getTime() < onaysizEnYakin.tarih.getTime())) onaysizEnYakin = { tarih: t, s }
    } else if (!onayliEnYakin || onaylanan.getTime() < onayliEnYakin.tarih.getTime()) {
      onayliEnYakin = { tarih: onaylanan, s }
    }
  }
  if (onaysizEnYakin && kalanGun(onaysizEnYakin.tarih, bugun) <= MASA_SURE_RISK_GUN) {
    adaylar.push(is({
      metin: `Son günü onaylayın: ${onaysizEnYakin.s.dayanak}, önerilen ${tarihTR(onaysizEnYakin.tarih)}`,
      kural: 'GN-04', oncelik: 1, rol: 'A+2', sonGun: onaysizEnYakin.tarih, eylem: 'Onayla', hedef: null, kaynak: 'sure', teyitGerekli: true, sorumluId: null,
    }))
  }
  if (onayliEnYakin) {
    const k = kalanGun(onayliEnYakin.tarih, bugun)
    if (k <= MASA_ONAYLI_RISK_GUN) {
      adaylar.push(is({
        metin: k >= 0
          ? `${onayliEnYakin.s.dayanak} için son ${k} gün (onaylanan son gün ${tarihTR(onayliEnYakin.tarih)})`
          : `${onayliEnYakin.s.dayanak}: onaylanan son gün ${tarihTR(onayliEnYakin.tarih)} geçti, kapanış kanıtı yok`,
        kural: 'GN-05', oncelik: 1, rol: 'SORUMLU', sonGun: onayliEnYakin.tarih, eylem: 'İşleme git', hedef: null, kaynak: 'sure', teyitGerekli: true, sorumluId: onayliEnYakin.s.sorumluId ?? null,
      }))
    }
  }

  let simdi: MasaIs | null = adaylar.sort(isKarsilastir)[0] ?? null
  let bekleme = onbellek?.bekleme ?? null
  if (simdi && simdi.oncelik >= 6) { // 6 = bekleme/bilgi: eylem yok (06 §8.2)
    bekleme = bekleme ?? simdi.metin
    simdi = null
  }
  const davaBilgi = dava
    ? { mahkeme: mahkemeAdi(dava), esas: esasNo(dava), durusma: sonrakiDurusmaTarihi(dava, bugun) }
    : null

  return {
    dosyaId: d.id,
    dosyaNo: metinVeya(d.hukukDosyaNo) ?? metinVeya(d.hasarDosyaNo) ?? d.id.slice(0, 8),
    simdi,
    bekleme,
    hesaplanmadi: !onbellek,
    sonraSayisi: onbellek?.sonraSayisi ?? 0,
    onaysizSure: { sayi: onaysizSayi, enYakin: onaysizEnYakin?.tarih ?? null, dayanak: onaysizEnYakin?.s.dayanak ?? null },
    uyap,
    benim: simdi ? benimMi(simdi, d, kim) : false,
    dava: davaBilgi,
  }
}

/** Sıralama: önce iş olanlar (öncelik, en yakın son gün, dosya no), sonra bekleyenler, sonra önbelleği olmayanlar. */
export function masaSirala(satirlar: MasaSatir[]): MasaSatir[] {
  const grup = (s: MasaSatir) => (s.simdi ? 0 : s.bekleme ? 1 : 2)
  return [...satirlar].sort((a, b) =>
    grup(a) - grup(b)
    || (a.simdi && b.simdi ? isKarsilastir(a.simdi, b.simdi) : 0)
    || trSirala(a.dosyaNo, b.dosyaNo))
}

/** Bütün dosyalar → Bugün masası satırları (sıralı). Dava satırları dosyaya göre gruplanır, ana dava seçilir. */
export function masaTablosu(dosyalar: MasaDosya[], sureler: MasaSure[], davalar: MasaDava[], kim: MasaKim, bugun: Date = new Date()): MasaSatir[] {
  const sureMap = new Map<string, MasaSure[]>()
  for (const s of sureler) { const l = sureMap.get(s.dosyaId) ?? []; l.push(s); sureMap.set(s.dosyaId, l) }
  const davaMap = new Map<string, MasaDava[]>()
  for (const v of davalar) { const l = davaMap.get(v.dosyaId) ?? []; l.push(v); davaMap.set(v.dosyaId, l) }
  return masaSirala(dosyalar.map((d) => masaSatiri(d, sureMap.get(d.id) ?? [], anaDava(davaMap.get(d.id)), kim, bugun)))
}

export type MasaSuzgec = 'benim' | 'herkes' | 'onaysiz' | 'uyap'
export const MASA_SUZGECLERI: { id: MasaSuzgec; etiket: string }[] = [
  { id: 'benim', etiket: 'Benim işlerim' },
  { id: 'herkes', etiket: 'Herkes' },
  { id: 'onaysiz', etiket: 'Onaysız süre' },
  { id: 'uyap', etiket: 'UYAP bağlı değil' },
]
export function masaSuzgecOku(x: string | string[] | null | undefined): MasaSuzgec {
  const v = Array.isArray(x) ? x[0] : x
  return v === 'herkes' || v === 'onaysiz' || v === 'uyap' ? v : 'benim'
}

/** Süzgeç: "Benim"/"Herkes" yalnız işi olan satırlar; "Onaysız süre" en yakın süreye göre; "UYAP bağlı değil" bütün eşleşmeyenler. */
export function masaSuz(satirlar: MasaSatir[], suzgec: MasaSuzgec): MasaSatir[] {
  switch (suzgec) {
    case 'benim': return masaSirala(satirlar.filter((s) => s.simdi && s.benim))
    case 'herkes': return masaSirala(satirlar.filter((s) => s.simdi))
    case 'uyap': return masaSirala(satirlar.filter((s) => s.uyap))
    case 'onaysiz': {
      const t = (d: Date | null) => (d ? d.getTime() : Number.POSITIVE_INFINITY)
      return satirlar
        .filter((s) => s.onaysizSure.sayi > 0)
        .sort((a, b) => t(a.onaysizSure.enYakin) - t(b.onaysizSure.enYakin) || trSirala(a.dosyaNo, b.dosyaNo))
    }
  }
}

export function masaSayac(satirlar: MasaSatir[]) {
  return {
    benim: satirlar.filter((s) => s.simdi && s.benim).length,
    herkes: satirlar.filter((s) => s.simdi).length,
    onaysiz: satirlar.filter((s) => s.onaysizSure.sayi > 0).length,
    onaysizSure: satirlar.reduce((n, s) => n + s.onaysizSure.sayi, 0),
    uyap: satirlar.filter((s) => s.uyap).length,
    bekleyen: satirlar.filter((s) => !s.simdi && s.bekleme).length,
    hesaplanmadi: satirlar.filter((s) => !s.simdi && !s.bekleme && s.hesaplanmadi).length,
  }
}
