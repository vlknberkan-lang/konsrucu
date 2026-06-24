/**
 * KonsRücü — Taksit hatırlatma e-postası · lib/konsrucu/taksit-mail.ts
 * Saf üretici (DB yok). İki ton: 'yaklasan' (vade öncesi nazik) · 'geciken' (vade geçti, temerrüt uyarısı).
 * E-posta-güvenli (tablo + inline stil, Türkiye saati). Cron ile aynı kaynağı kullanır.
 */

export type TaksitMailTur = 'yaklasan' | 'geciken'

export type TaksitMailGirdi = {
  tur: TaksitMailTur
  aliciAd: string
  taksit: { sira: number; toplamSayi: number; vadeTarihi: string; tutar: number; kalanGun: number } // kalanGun<0 → geçti
  plan: { kalanTutar: number; kalanSayi: number; temerrutSarti: boolean }
  dosya: {
    hukukNo: string | null
    borclu: string | null
    borcluSayisi: number
    icraNo: string | null
    yetkiliIcra: string | null
  }
  dosyaUrl?: string
}

const AKSAN = '#1897a0'
const INK = '#1e293b'
const MUTED = '#64748b'
const BORDER = '#e2e8f0'
const TZ = 'Europe/Istanbul'

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const tarihUzun = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: TZ })
const tarihKisa = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { timeZone: TZ })
const tl = (n: number | null) => (n != null ? '₺ ' + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')

/** Taksit hatırlatma → { konu, html, text }. */
export function taksitHatirlatmaHtml(g: TaksitMailGirdi): { konu: string; html: string; text: string } {
  const t = g.taksit
  const d = g.dosya
  const geciken = g.tur === 'geciken'
  const renk = geciken ? '#b91c1c' : AKSAN
  const siraEt = `${t.sira}/${t.toplamSayi}. taksit`
  const gunEt = geciken ? `${Math.abs(t.kalanGun)} gün önce doldu` : t.kalanGun === 0 ? 'bugün' : `${t.kalanGun} gün sonra`
  const baslik = geciken ? `Taksit ödenmedi · ${siraEt}` : `Yaklaşan taksit · ${siraEt}`
  const konu = geciken
    ? `⚠️ Taksit gecikti · ${siraEt} (${tl(t.tutar)})${d.hukukNo ? ' · ' + d.hukukNo : ''}`
    : `Hatırlatma · ${gunEt} taksit vadesi · ${siraEt} (${tl(t.tutar)})${d.hukukNo ? ' · ' + d.hukukNo : ''}`

  const kunye = ([
    ['Borçlu', d.borclu ? `${esc(d.borclu)}${d.borcluSayisi > 1 ? ` <span style="color:${MUTED}">+${d.borcluSayisi - 1}</span>` : ''}` : ''],
    ['Hukuk No', d.hukukNo ? esc(d.hukukNo) : ''],
    ['İcra No', d.icraNo ? esc(d.icraNo) : ''],
    ['Yetkili icra', d.yetkiliIcra ? esc(d.yetkiliIcra) : ''],
    ['Bu taksit', `${tl(t.tutar)} · vade ${tarihKisa(t.vadeTarihi)}`],
    ['Plan kalanı', `${tl(g.plan.kalanTutar)} · ${g.plan.kalanSayi} taksit`],
  ] as [string, string][]).filter(([, v]) => v)

  const kunyeRows = kunye
    .map(([k, v], i) => `<tr>
      <td style="padding:8px 14px;font-size:12px;color:${MUTED};white-space:nowrap;${i ? `border-top:1px solid ${BORDER};` : ''}">${esc(k)}</td>
      <td align="right" style="padding:8px 14px;font-size:13px;font-weight:600;color:${INK};${i ? `border-top:1px solid ${BORDER};` : ''}">${v}</td>
    </tr>`)
    .join('')

  const uyari = geciken
    ? `<tr><td style="padding:4px 24px 0;">
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:12px 14px;font-size:12.5px;color:#991b1b;line-height:1.5;">
          <b>Bu taksit vadesinde ödenmedi.</b> ${g.plan.temerrutSarti ? 'Anlaşmada temerrüt şartı var: borçluyu ödemeye davet edin; ödenmezse kalan bakiye muaccel olur ve takip kaldığı yerden sürer.' : 'Borçluyu ödemeye davet edin; gecikme tahsilatı geciktirir.'}
        </div>
      </td></tr>`
    : `<tr><td style="padding:4px 24px 0;">
        <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:12px 14px;font-size:12.5px;color:#075985;line-height:1.5;">
          Vade <b>${gunEt}</b>. Borçludan bu taksiti zamanında isteyin; ödeme gelince dosyada <b>“Ödendi”</b> işaretleyin.
        </div>
      </td></tr>`

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(konu)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${BORDER};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
        <tr><td style="background:${renk};padding:20px 24px;">
          <div style="color:#ffffff;opacity:0.85;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-family:monospace;">KonsRücu · Taksit ${geciken ? 'gecikme' : 'hatırlatma'}</div>
          <div style="color:#ffffff;font-size:22px;font-weight:800;margin-top:4px;">${esc(baslik)}</div>
          <div style="color:#ffffff;opacity:0.9;font-size:13px;margin-top:4px;">${esc(tarihUzun(t.vadeTarihi))} · <b>${tl(t.tutar)}</b></div>
        </td></tr>
        <tr><td style="padding:20px 24px 4px;">
          <div style="font-size:15px;color:${INK};">Merhaba <b>${esc(g.aliciAd)}</b>,</div>
          <div style="font-size:13.5px;color:${MUTED};margin-top:4px;">${geciken ? 'Vadesi geçen bir taksit var.' : 'Yaklaşan bir taksit ödemesi var.'} Dosya künyesi aşağıda.</div>
        </td></tr>
        ${uyari}
        <tr><td style="padding:12px 24px 4px;">
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-family:monospace;color:${MUTED};margin-bottom:6px;">Dosya & taksit</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
            ${kunyeRows}
          </table>
        </td></tr>
        ${g.dosyaUrl ? `<tr><td style="padding:14px 24px 20px;">
          <a href="${esc(g.dosyaUrl)}" style="display:inline-block;background:${renk};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px;">Dosyayı aç →</a>
        </td></tr>` : ''}
        <tr><td style="background:#f8fafc;border-top:1px solid ${BORDER};padding:14px 24px;">
          <div style="font-size:11.5px;color:${MUTED};">Bu uyarı taksit planından otomatik gönderilir · <a href="mailto:info@konstraerp.com" style="color:${AKSAN};text-decoration:none;">info@konstraerp.com</a></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const textKunye = kunye.map(([k, v]) => `  ${k}: ${String(v).replace(/<[^>]+>/g, '')}`).join('\n')
  const text = `Merhaba ${g.aliciAd},
${geciken ? '⚠️ Taksit gecikti' : 'Yaklaşan taksit'}: ${siraEt}
${tarihUzun(t.vadeTarihi)} · ${tl(t.tutar)} (${gunEt})

DOSYA & TAKSİT
${textKunye}
${g.dosyaUrl ? '\nDosyayı aç: ' + g.dosyaUrl : ''}

—
Bu uyarı taksit planından otomatik gönderilir · info@konstraerp.com`

  return { konu, html, text }
}
