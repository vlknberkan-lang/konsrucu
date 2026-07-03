/**
 * KonsRücü — Haftalık takvim raporu e-postası (HTML + düz metin) · lib/konsrucu/rapor-mail.ts
 * Saf üretici (DB yok). Önümüzdeki N günün etkinliklerini güne göre gruplar; e-posta-güvenli
 * (tablo düzeni + inline stil). Hem /takvim/rapor önizlemesi hem de zamanlı gönderim aynı kaynağı kullanır.
 * Sunucu UTC çalışır: tüm tarih/saat gösterimi + gün gruplaması İSTANBUL gününe göredir (lib/konsrucu/format).
 */
import { tarihTR, kalanGun, bugunIstBasi } from './format'

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

export type RaporGirdi = {
  aliciAd: string
  bugun: string // ISO ('YYYY-MM-DD' veya tam ISO) — raporun referans günü
  gunSayisi?: number // varsayılan 7
  etkinlikler: RaporEtkinlik[]
  zamanasimi?: RaporZamanasimi[] // pencerede dolan zamanaşımları (ops.)
  zamanasimiGecti?: RaporZamanasimi[] // tarihi GEÇMİŞ, takibi açılmamış dosyalar — kırmızı alarm (ops.)
  zamanasimiBosSayisi?: number // zamanaşımı tarihi hiç girilmemiş açık dosya sayısı (ops.)
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

/** Haftalık takvim raporu → { konu, html, text }. */
export function haftalikRaporHtml(g: RaporGirdi): { konu: string; html: string; text: string } {
  const gunSayisi = g.gunSayisi ?? 7
  const bugun = new Date(g.bugun)
  const bas = bugunIstBasi(bugun)
  const son = new Date(bas.getTime() + gunSayisi * 86_400_000)

  // pencere içindeki etkinlikler, güne göre grupla
  const pencere = g.etkinlikler
    .filter((e) => { const t = new Date(e.baslar).getTime(); return t >= bas.getTime() && t < son.getTime() })
    .sort((a, b) => a.baslar.localeCompare(b.baslar))
  const gunMap = new Map<string, RaporEtkinlik[]>()
  for (const e of pencere) { const k = gunKey(new Date(e.baslar)); if (!gunMap.has(k)) gunMap.set(k, []); gunMap.get(k)!.push(e) }

  const gunler = Array.from({ length: gunSayisi }, (_, i) => new Date(bas.getTime() + i * 86_400_000))
  const aralik = `${tarihUzun(bas)} – ${tarihUzun(new Date(son.getTime() - 86_400_000))}`
  const zaGecti = g.zamanasimiGecti ?? []
  const konu = `Haftalık Takvim · ${pencere.length} etkinlik${zaGecti.length ? ` · ⛔ ${zaGecti.length} zamanaşımı geçti` : ''} · ${tarihTR(bas)}–${tarihTR(new Date(son.getTime() - 86_400_000))}`

  // ── HTML ──
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
            <td valign="top" style="padding:8px 16px 8px 0;">
              <span style="display:inline-block;background:${m.bg};color:${m.fg};font-size:11px;font-weight:bold;padding:2px 8px;border-radius:999px;">${m.label}</span>
              <div style="margin-top:3px;font-size:14px;font-weight:600;color:${INK};">${kim}${no}</div>
              ${yer ? `<div style="font-size:12px;color:${MUTED};margin-top:2px;">${yer}</div>` : ''}
            </td>
          </tr>`
        }).join('')
    return `
      <tr><td style="padding:16px 0 6px;">
        <div style="font-size:13px;font-weight:bold;color:${INK};border-bottom:2px solid ${BORDER};padding-bottom:4px;">${esc(gunEtiketi(d, bugun))}${bos ? '' : ` <span style="color:${MUTED};font-weight:normal;">· ${evs.length}</span>`}</div>
      </td></tr>
      <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${satirlar}</table></td></tr>`
  }).join('')

  const za = g.zamanasimi ?? []
  const zaGoster = za.slice(0, LISTE_MAX)
  const zaKalan = za.length - zaGoster.length
  const zaBlok = za.length === 0 ? '' : `
    <tr><td style="padding:18px 0 6px;">
      <div style="font-size:13px;font-weight:bold;color:#b45309;">⏳ Yaklaşan Zamanaşımı (${za.length})</div>
    </td></tr>
    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
        ${zaGoster.map((z) => `<tr>
          <td style="padding:7px 14px;font-size:13px;color:${INK};">${esc(z.borclu ?? z.hukukNo ?? '—')}<span style="font-family:monospace;color:${MUTED};font-size:12px;"> · ${esc(z.hukukNo ?? '')}</span></td>
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
          <td style="padding:7px 14px;font-size:13px;color:${INK};">${esc(z.borclu ?? z.hukukNo ?? '—')}<span style="font-family:monospace;color:${MUTED};font-size:12px;"> · ${esc(z.hukukNo ?? '')}</span></td>
          <td align="right" style="padding:7px 14px;font-family:monospace;font-size:12.5px;font-weight:bold;color:#b91c1c;">${tarihTR(z.tarih)} · ${Math.abs(z.kalanGun)}g önce</td>
        </tr>`).join('')}
        ${zaGectiKalan > 0 ? `<tr><td colspan="2" style="padding:7px 14px;font-size:12px;color:${MUTED};">… ve ${zaGectiKalan} dosya daha — tam liste panelde.</td></tr>` : ''}
      </table>
    </td></tr>`

  const zaBos = g.zamanasimiBosSayisi ?? 0

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(konu)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${BORDER};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
        <tr><td style="background:${AKSAN};padding:20px 24px;">
          <div style="color:#bdeef1;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-family:monospace;">KonsRücu · Ajanda</div>
          <div style="color:#ffffff;font-size:22px;font-weight:800;margin-top:4px;">Haftalık Takvim Raporu</div>
          <div style="color:#d7f3f5;font-size:13px;margin-top:4px;">${esc(aralik)}</div>
        </td></tr>
        <tr><td style="padding:20px 24px 4px;">
          <div style="font-size:15px;color:${INK};">Günaydın <b>${esc(g.aliciAd)}</b>,</div>
          <div style="font-size:13.5px;color:${MUTED};margin-top:4px;">Önümüzdeki ${gunSayisi} günde <b style="color:${INK};">${pencere.length} etkinlik</b> var.${za.length ? ` Ayrıca <b style="color:#b45309;">${za.length}</b> dosyada zamanaşımı yaklaşıyor.` : ''}${zaGecti.length ? ` <b style="color:#b91c1c;">${zaGecti.length} dosyada zamanaşımı GEÇMİŞ görünüyor.</b>` : ''}${zaBos ? ` <span style="color:#b45309;">${zaBos} açık dosyada zamanaşımı tarihi boş — radar dışındalar.</span>` : ''}</div>
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
          <div style="font-size:11.5px;color:${MUTED};">Bu otomatik rapor her sabah 07:00'de gönderilir · <a href="mailto:info@konstraerp.com" style="color:${AKSAN};text-decoration:none;">info@konstraerp.com</a></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  // ── düz metin ──
  const textGun = gunler.map((d) => {
    const evs = gunMap.get(gunKey(d)) ?? []
    const head = gunEtiketi(d, bugun)
    if (evs.length === 0) return `${head}\n  — etkinlik yok`
    return `${head}\n` + evs.map((e) => `  ${saat(e.baslar)}${e.biter ? '–' + saat(e.biter) : ''}  [${turMeta(e.tur).label}] ${e.borclu ?? e.baslik}${e.hukukNo ? ' · ' + e.hukukNo : ''}${e.yer ? ' · ' + e.yer : ''}`).join('\n')
  }).join('\n\n')
  const textZa = za.length ? `\n\nYAKLAŞAN ZAMANAŞIMI (${za.length}):\n` + zaGoster.map((z) => `  ${z.borclu ?? z.hukukNo ?? '—'} · ${z.hukukNo ?? ''} · ${tarihTR(z.tarih)} (${z.kalanGun}g)`).join('\n') + (zaKalan > 0 ? `\n  … ve ${zaKalan} dosya daha (panelde)` : '') : ''
  const textZaGecti = zaGecti.length ? `\n\n⛔ ZAMANAŞIMI GEÇTİ — TAKİP AÇILMAMIŞ (${zaGecti.length}):\n` + zaGectiGoster.map((z) => `  ${z.borclu ?? z.hukukNo ?? '—'} · ${z.hukukNo ?? ''} · ${tarihTR(z.tarih)} (${Math.abs(z.kalanGun)}g önce)`).join('\n') + (zaGectiKalan > 0 ? `\n  … ve ${zaGectiKalan} dosya daha (panelde)` : '') : ''
  const textZaBos = zaBos ? `\n\nUYARI: ${zaBos} açık dosyada zamanaşımı tarihi boş — bu dosyalar zamanaşımı radarının DIŞINDA.` : ''
  const text = `Günaydın ${g.aliciAd},\nÖnümüzdeki ${gunSayisi} günde ${pencere.length} etkinlik.\n${aralik}${textZaGecti}\n\n${textGun}${textZa}${textZaBos}\n\n—\nBu otomatik rapor her sabah 07:00'de gönderilir · info@konstraerp.com`

  return { konu, html, text }
}
