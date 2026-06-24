/**
 * KonsRücü — Etkinlik hatırlatma e-postası (etkinlikten önce) · lib/konsrucu/hatirlatma-mail.ts
 * Saf üretici (DB yok). Tek etkinlik + dosya künyesi; e-posta-güvenli (tablo + inline stil, Türkiye saati).
 * Hem önizleme (/takvim/hatirlatma) hem zamanlı gönderim aynı kaynağı kullanır.
 */

export type HatirlatmaEtkinlik = {
  tur: string
  baslik: string
  baslar: string // ISO
  biter: string | null
  yer: string | null
  online: boolean
  hatirlatmaDk: number | null
}
export type HatirlatmaDosya = {
  hukukNo: string | null
  borclu: string | null
  borcluSayisi: number
  asilAlacak: number | null
  asama: string | null
  yetkiliIcra: string | null
  icraNo: string | null
  zamanasimi: string | null
  zamanasimiKalan: number | null
}
export type HatirlatmaGirdi = {
  aliciAd: string
  etkinlik: HatirlatmaEtkinlik
  dosya: HatirlatmaDosya
  dosyaUrl?: string
}

const TUR: Record<string, { label: string; bg: string; fg: string }> = {
  DURUSMA: { label: 'Duruşma', bg: '#eef2ff', fg: '#4338ca' },
  ARABULUCULUK_TOPLANTISI: { label: 'Arabuluculuk toplantısı', bg: '#e6f6f7', fg: '#0f6b72' },
  GORUSME: { label: 'Görüşme', bg: '#f1f5f9', fg: '#475569' },
  SURE: { label: 'Süre / son tarih', bg: '#fef3c7', fg: '#b45309' },
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
const saat = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
const tarihUzun = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: TZ })
const tarihKisa = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { timeZone: TZ })
const tl = (n: number | null) => (n != null ? '₺ ' + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')

/** Hatırlatma süresini okunur etikete çevir (60 → "1 saat", 1440 → "1 gün"). */
function kala(dk: number | null): string {
  if (!dk || dk <= 0) return '1 saat'
  if (dk % 1440 === 0) return `${dk / 1440} gün`
  if (dk % 60 === 0) return `${dk / 60} saat`
  return `${dk} dakika`
}

/** Tek etkinlik hatırlatma → { konu, html, text }. */
export function etkinlikHatirlatmaHtml(g: HatirlatmaGirdi): { konu: string; html: string; text: string } {
  const e = g.etkinlik
  const d = g.dosya
  const m = turMeta(e.tur)
  const lead = kala(e.hatirlatmaDk)
  const kim = d.borclu ?? e.baslik
  const aralikSaat = `${saat(e.baslar)}${e.biter ? '–' + saat(e.biter) : ''}`
  const yer = e.yer ? `${e.online ? '🎥 Online · ' : '📍 '}${esc(e.yer)}` : e.online ? '🎥 Online' : ''
  const konu = `Hatırlatma · ${lead} sonra ${m.label}${d.hukukNo ? ' · ' + d.hukukNo : ''} (${saat(e.baslar)})`

  const kunye = ([
    ['Borçlu', d.borclu ? `${esc(d.borclu)}${d.borcluSayisi > 1 ? ` <span style="color:${MUTED}">+${d.borcluSayisi - 1}</span>` : ''}` : ''],
    ['Hukuk No', d.hukukNo ? esc(d.hukukNo) : ''],
    ['İcra No', d.icraNo ? esc(d.icraNo) : ''],
    ['Aşama', d.asama ? esc(d.asama) : ''],
    ['Asıl alacak', d.asilAlacak != null ? tl(d.asilAlacak) : ''],
    ['Yetkili icra', d.yetkiliIcra ? esc(d.yetkiliIcra) : ''],
    ['Zamanaşımı', d.zamanasimi ? `${tarihKisa(d.zamanasimi)}${d.zamanasimiKalan != null ? ` · <b style="color:${d.zamanasimiKalan <= 30 ? '#b91c1c' : d.zamanasimiKalan <= 90 ? '#b45309' : INK}">${d.zamanasimiKalan < 0 ? 'geçti' : d.zamanasimiKalan + 'g'}</b>` : ''}` : ''],
  ] as [string, string][]).filter(([, v]) => v)

  const kunyeRows = kunye
    .map(([k, v], i) => `<tr>
      <td style="padding:8px 14px;font-size:12px;color:${MUTED};white-space:nowrap;${i ? `border-top:1px solid ${BORDER};` : ''}">${esc(k)}</td>
      <td align="right" style="padding:8px 14px;font-size:13px;font-weight:600;color:${INK};${i ? `border-top:1px solid ${BORDER};` : ''}">${v}</td>
    </tr>`)
    .join('')

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(konu)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${BORDER};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
        <tr><td style="background:${AKSAN};padding:20px 24px;">
          <div style="color:#bdeef1;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-family:monospace;">KonsRücü · Hatırlatma</div>
          <div style="color:#ffffff;font-size:22px;font-weight:800;margin-top:4px;">${lead} sonra: ${esc(m.label)}</div>
          <div style="color:#d7f3f5;font-size:13px;margin-top:4px;">${esc(tarihUzun(e.baslar))} · <b>${esc(aralikSaat)}</b></div>
        </td></tr>
        <tr><td style="padding:20px 24px 4px;">
          <div style="font-size:15px;color:${INK};">Merhaba <b>${esc(g.aliciAd)}</b>,</div>
          <div style="font-size:13.5px;color:${MUTED};margin-top:4px;">Yaklaşan bir etkinliğin var. Dosya künyesi aşağıda.</div>
        </td></tr>
        <tr><td style="padding:8px 24px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;border:1px solid ${BORDER};border-radius:12px;">
            <tr><td style="padding:14px 16px;">
              <span style="display:inline-block;background:${m.bg};color:${m.fg};font-size:11px;font-weight:bold;padding:2px 9px;border-radius:999px;">${esc(m.label)}</span>
              <div style="margin-top:6px;font-size:16px;font-weight:700;color:${INK};">${esc(e.baslik)}</div>
              <div style="margin-top:3px;font-family:monospace;font-size:13px;color:${AKSAN};font-weight:bold;">🕒 ${esc(aralikSaat)} · ${esc(tarihKisa(e.baslar))}</div>
              ${yer ? `<div style="margin-top:3px;font-size:13px;color:${MUTED};">${yer}</div>` : ''}
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:12px 24px 4px;">
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-family:monospace;color:${MUTED};margin-bottom:6px;">Dosya künyesi</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
            ${kunyeRows}
          </table>
        </td></tr>
        ${g.dosyaUrl ? `<tr><td style="padding:14px 24px 20px;">
          <a href="${esc(g.dosyaUrl)}" style="display:inline-block;background:${AKSAN};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px;">Dosyayı aç →</a>
        </td></tr>` : ''}
        <tr><td style="background:#f8fafc;border-top:1px solid ${BORDER};padding:14px 24px;">
          <div style="font-size:11.5px;color:${MUTED};">Bu hatırlatma etkinlikten <b>${lead}</b> önce otomatik gönderilir · <a href="mailto:info@konstraerp.com" style="color:${AKSAN};text-decoration:none;">info@konstraerp.com</a></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const textKunye = kunye.map(([k, v]) => `  ${k}: ${String(v).replace(/<[^>]+>/g, '')}`).join('\n')
  const text = `Merhaba ${g.aliciAd},
${lead} sonra: ${m.label}
${tarihUzun(e.baslar)} · ${aralikSaat}

${e.baslik}${yer ? '\n' + yer.replace(/<[^>]+>/g, '') : ''}

DOSYA KÜNYESİ
${textKunye}
${g.dosyaUrl ? '\nDosyayı aç: ' + g.dosyaUrl : ''}

—
Bu hatırlatma etkinlikten ${lead} önce otomatik gönderilir · info@konstraerp.com`

  return { konu, html, text }
}
