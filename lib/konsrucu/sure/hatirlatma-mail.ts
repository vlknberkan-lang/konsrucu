/**
 * KonsRücü — Süre hatırlatma e-postası · lib/konsrucu/sure/hatirlatma-mail.ts (saf üretici; DB yok)
 * Etkinlik hatırlatmasıyla aynı e-posta dili (tablo + inline stil). Kişisel veri YOK: borçlu adı, TCKN,
 * telefon yazılmaz; yalnız dosya no, süre türü, dayanak ("teyit gerekli") ve son gün.
 */
import { gunAdi, gunTR, tarihOku } from './takvim'
import { TEYIT_GEREKLI } from './turler'

export type SureMailGirdi = {
  aliciAd: string
  sure: {
    turEtiket: string
    turAd: string
    dayanak: string
    hedefTarih: Date | string
    hedefKaynak: 'ONAYLANAN' | 'IHTIYATLI'
    kalanGun: number
    borcluEtiket?: string | null
  }
  dosya: { dosyaNo: string; icraNo: string | null }
  dosyaUrl?: string
  test?: boolean
}

const AKSAN = '#1897a0'
const INK = '#1e293b'
const MUTED = '#64748b'
const BORDER = '#e2e8f0'
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function sureHatirlatmaMail(g: SureMailGirdi): { konu: string; html: string; text: string } {
  const s = g.sure
  const tarih = tarihOku(s.hedefTarih)
  const gun = tarih ? `${gunTR(tarih)} ${gunAdi(tarih)}` : '—'
  const kalanMetin = s.kalanGun <= 0 ? 'bugün son gün' : `${s.kalanGun} gün kaldı`
  const kaynakMetin = s.hedefKaynak === 'ONAYLANAN'
    ? 'Avukatın onayladığı son gün'
    : 'İhtiyatlı öneri (onaylanan son gün henüz girilmedi)'
  const konu = `${g.test ? '[TEST] ' : ''}Süre · ${s.turEtiket} · ${kalanMetin} · ${g.dosya.dosyaNo}`

  const satirlar = ([
    ['Süre', `${esc(s.turEtiket)} · ${esc(s.turAd)}`],
    ['Dayanak', `${esc(s.dayanak)} <span style="color:${MUTED}">(${TEYIT_GEREKLI})</span>`],
    ['Son gün', `<b>${esc(gun)}</b>`],
    ['Dayandığı gün', esc(kaynakMetin)],
    ['Dosya', esc(g.dosya.dosyaNo)],
    ['İcra no', g.dosya.icraNo ? esc(g.dosya.icraNo) : ''],
    ['Borçlu', s.borcluEtiket ? esc(s.borcluEtiket) : ''],
  ] as [string, string][]).filter(([, v]) => v)

  const tablo = satirlar
    .map(([k, v], i) => `<tr>
      <td style="padding:8px 14px;font-size:12px;color:${MUTED};white-space:nowrap;${i ? `border-top:1px solid ${BORDER};` : ''}">${esc(k)}</td>
      <td align="right" style="padding:8px 14px;font-size:13px;color:${INK};${i ? `border-top:1px solid ${BORDER};` : ''}">${v}</td>
    </tr>`)
    .join('')

  const ihtiyatliNot = s.hedefKaynak === 'IHTIYATLI'
    ? `<tr><td style="padding:10px 24px 0;"><div style="background:#fef3c7;color:#92400e;border-radius:10px;padding:10px 14px;font-size:12.5px;">Onaylanan son gün girilmedi. Hatırlatma ihtiyatlı öneriye göre gönderildi; dosyada son günü onaylayın.</div></td></tr>`
    : ''

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(konu)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${BORDER};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
        <tr><td style="background:${AKSAN};padding:20px 24px;">
          <div style="color:#bdeef1;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-family:monospace;">KonsRücu · Süre hatırlatması${g.test ? ' · TEST' : ''}</div>
          <div style="color:#ffffff;font-size:22px;font-weight:800;margin-top:4px;">${esc(s.turEtiket)}: ${esc(kalanMetin)}</div>
          <div style="color:#d7f3f5;font-size:13px;margin-top:4px;">Son gün ${esc(gun)}</div>
        </td></tr>
        <tr><td style="padding:20px 24px 4px;">
          <div style="font-size:15px;color:${INK};">Merhaba <b>${esc(g.aliciAd)}</b>,</div>
          <div style="font-size:13.5px;color:${MUTED};margin-top:4px;">Süre defterindeki bir sürenin son günü yaklaşıyor.</div>
        </td></tr>
        ${ihtiyatliNot}
        <tr><td style="padding:12px 24px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">${tablo}</table>
        </td></tr>
        ${g.dosyaUrl ? `<tr><td style="padding:14px 24px 20px;"><a href="${esc(g.dosyaUrl)}" style="display:inline-block;background:${AKSAN};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px;">Dosyayı aç →</a></td></tr>` : ''}
        <tr><td style="background:#f8fafc;border-top:1px solid ${BORDER};padding:14px 24px;">
          <div style="font-size:11.5px;color:${MUTED};">Süre hatırlatmaları son güne 7, 3 ve 1 gün kala gönderilir. Motor tatil uzatması uygulamaz; son günü avukat teyit eder.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const text = `Merhaba ${g.aliciAd},
${s.turEtiket}: ${kalanMetin}
Son gün: ${gun}
Dayanak: ${s.dayanak} (${TEYIT_GEREKLI})
Dayandığı gün: ${kaynakMetin}
Dosya: ${g.dosya.dosyaNo}${g.dosya.icraNo ? `\nİcra no: ${g.dosya.icraNo}` : ''}${s.borcluEtiket ? `\nBorçlu: ${s.borcluEtiket}` : ''}
${g.dosyaUrl ? `\nDosyayı aç: ${g.dosyaUrl}\n` : ''}
—
Süre hatırlatmaları son güne 7, 3 ve 1 gün kala gönderilir. Motor tatil uzatması uygulamaz; son günü avukat teyit eder.`

  return { konu, html, text }
}
