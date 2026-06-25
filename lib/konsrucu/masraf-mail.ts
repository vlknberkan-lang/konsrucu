/**
 * KonsRücü — Masraf faturalama hazırlık özeti e-postası · lib/konsrucu/masraf-mail.ts
 * Saf üretici (DB yok). Salı/Perşembe cron'u "bizim taraf" YENI/ONAYLI masrafları toplar; ekibe özet + Excel eki yollar.
 * Faturalama değil HAZIRLIK uyarısıdır (Çar/Cuma elle faturalanır) → e-posta masraf durumunu DEĞİŞTİRMEZ.
 * E-posta-güvenli (tablo + inline stil). taksit-mail.ts stiliyle aynı palet.
 */

export type MasrafOzetGirdi = {
  aliciAd: string
  donem: string // ISO hafta dönemi, ör. "2026-W26"
  toplamTutar: number
  adet: number
  dosyaOzet: { etiket: string; adet: number; tutar: number }[]
  url: string // Masraflar sayfası linki
  belirsizAdet?: number // "belirsiz taraf" (faturalanmayan) kalem — hatırlatma için
}

const AKSAN = '#1897a0'
const INK = '#1e293b'
const MUTED = '#64748b'
const BORDER = '#e2e8f0'

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const tl = (n: number | null) =>
  (n != null ? n : 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺'

/** Masraf faturalama hazırlık özeti → { konu, html, text }. */
export function masrafOzetMail(a: MasrafOzetGirdi): { konu: string; html: string; text: string } {
  const konu = `🧾 Masraf faturalama hazırlığı — ${a.adet} kalem`

  // dosya/müvekkil bazında satırlar (tutara göre azalan, en yüksek üstte)
  const satirlar = [...a.dosyaOzet].sort((x, y) => y.tutar - x.tutar)
  const dosyaRows = satirlar
    .map(
      (r, i) => `<tr>
      <td style="padding:8px 14px;font-size:13px;color:${INK};${i ? `border-top:1px solid ${BORDER};` : ''}">${esc(r.etiket)}</td>
      <td align="right" style="padding:8px 14px;font-size:12px;color:${MUTED};white-space:nowrap;${i ? `border-top:1px solid ${BORDER};` : ''}">${r.adet} kalem</td>
      <td align="right" style="padding:8px 14px;font-size:13px;font-weight:600;color:${INK};white-space:nowrap;${i ? `border-top:1px solid ${BORDER};` : ''}">${tl(r.tutar)}</td>
    </tr>`,
    )
    .join('')

  const belirsizAdet = a.belirsizAdet ?? 0
  const belirsizHtml = belirsizAdet > 0
    ? `<tr><td style="padding:4px 24px;"><div style="font-size:13px;color:#92600a;background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:10px 14px;">⚠️ <b>${belirsizAdet} kalem</b> "belirsiz taraf" olarak işaretli — faturalama havuzuna GİRMEZ. Masraflar sayfasından tarafını (bizim/karşı) belirleyin.</div></td></tr>`
    : ''
  const belirsizText = belirsizAdet > 0 ? `\n⚠️ ${belirsizAdet} kalem belirsiz taraf — faturalanmaz; Masraflar sayfasından tarafını belirleyin.\n` : ''

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(konu)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${BORDER};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
        <tr><td style="background:${AKSAN};padding:20px 24px;">
          <div style="color:#ffffff;opacity:0.85;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-family:monospace;">KonsRücu · Masraf hazırlığı · ${esc(a.donem)}</div>
          <div style="color:#ffffff;font-size:22px;font-weight:800;margin-top:4px;">Faturalanmaya hazır masraflar</div>
          <div style="color:#ffffff;opacity:0.9;font-size:13px;margin-top:4px;"><b>${a.adet}</b> kalem · toplam <b>${tl(a.toplamTutar)}</b></div>
        </td></tr>
        <tr><td style="padding:20px 24px 4px;">
          <div style="font-size:15px;color:${INK};">Merhaba <b>${esc(a.aliciAd)}</b>,</div>
          <div style="font-size:13.5px;color:${MUTED};margin-top:4px;">Bizim taraf, henüz faturalanmamış (Yeni/Onaylı) masraflar aşağıda dosya bazında özetlendi. Ayrıntılı liste ekteki Excel'dedir. <b>Bu bir hazırlık e-postasıdır</b> — faturalama bu mesajla yapılmaz.</div>
        </td></tr>
        ${belirsizHtml}
        <tr><td style="padding:12px 24px 4px;">
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-family:monospace;color:${MUTED};margin-bottom:6px;">Dosya / müvekkil bazında</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
            ${dosyaRows}
            <tr>
              <td style="padding:10px 14px;font-size:12px;font-weight:700;color:${INK};background:#f8fafc;border-top:2px solid ${BORDER};">Genel toplam</td>
              <td align="right" style="padding:10px 14px;font-size:12px;color:${MUTED};background:#f8fafc;border-top:2px solid ${BORDER};white-space:nowrap;">${a.adet} kalem</td>
              <td align="right" style="padding:10px 14px;font-size:13px;font-weight:800;color:${INK};background:#f8fafc;border-top:2px solid ${BORDER};white-space:nowrap;">${tl(a.toplamTutar)}</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="padding:14px 24px 20px;">
          <a href="${esc(a.url)}" style="display:inline-block;background:${AKSAN};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px;">Masraflar sayfası →</a>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid ${BORDER};padding:14px 24px;">
          <div style="font-size:11.5px;color:${MUTED};">Bu özet masraf modülünden otomatik gönderilir · <a href="mailto:info@konstraerp.com" style="color:${AKSAN};text-decoration:none;">info@konstraerp.com</a></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const textSatir = satirlar.map((r) => `  ${r.etiket}: ${r.adet} kalem · ${tl(r.tutar)}`).join('\n')
  const text = `Merhaba ${a.aliciAd},

Masraf faturalama hazırlığı · ${a.donem}
Bizim taraf, faturalanmamış (Yeni/Onaylı): ${a.adet} kalem · toplam ${tl(a.toplamTutar)}
Bu bir hazırlık e-postasıdır; faturalama bu mesajla yapılmaz. Ayrıntılı liste ektedir.
${belirsizText}
DOSYA / MÜVEKKİL BAZINDA
${textSatir}
  Genel toplam: ${a.adet} kalem · ${tl(a.toplamTutar)}

Masraflar sayfası: ${a.url}

—
Bu özet masraf modülünden otomatik gönderilir · info@konstraerp.com`

  return { konu, html, text }
}
