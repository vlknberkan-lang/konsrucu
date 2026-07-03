/**
 * KonsRücü — Takip görevi e-postası · lib/konsrucu/takip-gorevi-mail.ts
 * Saf üretici (DB yok). Bir etkinlikten doğan takip görevi sorumluya atanınca / hatırlatma
 * zamanı gelince gönderilir. Bağlam = ETKİNLİĞİN SAFAHATI (ne zaman planlandı, ne oldu),
 * dosyanın kaza anlatısı DEĞİL. Stil: hatirlatma-mail.ts ile birebir (e-posta-güvenli tablo, TR saati).
 * Hem önizleme (/takvim/takip-gorevi) hem anlık/cron gönderim aynı kaynağı kullanır.
 */

export type TakipGoreviEtkinlik = {
  tur: string
  baslik: string
  baslar: string // ISO
  durum: string // EtkinlikDurum
  sonucNot: string | null
}
export type TakipGoreviDosya = {
  hukukNo: string | null
  borclu: string | null
  borcluSayisi: number
  icraNo: string | null
  yetkiliIcra: string | null
  toplam: number | null
  faiz: number | null
  asama: string | null
  zamanasimi: string | null // ISO
  zamanasimiKalan: number | null
}
export type TakipGoreviGirdi = {
  gorev: {
    baslik: string
    aciklama: string | null
    sonTarih: string | null // ISO
    atayanAd: string | null
    sorumluAd: string | null
  }
  etkinlik: TakipGoreviEtkinlik | null
  dosya: TakipGoreviDosya
  dosyaUrl?: string
}

const AKSAN = '#1897a0'
const INK = '#1e293b'
const MUTED = '#64748b'
const BORDER = '#e2e8f0'
const TZ = 'Europe/Istanbul'

// etkinlik türü etiketi (hatirlatma-mail ile aynı palet)
const ETUR: Record<string, string> = {
  DURUSMA: 'Duruşma',
  ARABULUCULUK_TOPLANTISI: 'Arabuluculuk toplantısı',
  GORUSME: 'Görüşme',
  SURE: 'Süre / son tarih',
  HATIRLATMA: 'Hatırlatma',
}
// etkinlik durum rozeti
const EDURUM: Record<string, { label: string; bg: string; fg: string }> = {
  PLANLANDI: { label: 'Planlandı', bg: '#e0f2fe', fg: '#0369a1' },
  YAPILDI: { label: 'Yapıldı', bg: '#dcfce7', fg: '#15803d' },
  YAPILMADI: { label: 'Yapılmadı', bg: '#fee2e2', fg: '#b91c1c' },
  ERTELENDI: { label: 'Ertelendi', bg: '#fef3c7', fg: '#b45309' },
  IPTAL: { label: 'İptal', bg: '#f1f5f9', fg: '#475569' },
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const tl = (n: number | null) => (n != null ? '₺ ' + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—')
const tarihKisa = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { timeZone: TZ })
const tarihUzun = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: TZ })
const tarihSaat = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ })
// metni e-posta-güvenli html'e çevir (kaçış + satır sonları)
const cokSatir = (s: string) => esc(s).replace(/\n{2,}/g, '</p><p style="margin:8px 0 0;">').replace(/\n/g, '<br>')

/** Takip görevi → { konu, html, text }. */
export function takipGoreviMail(g: TakipGoreviGirdi): { konu: string; html: string; text: string } {
  const { gorev, etkinlik, dosya: d } = g
  const sonTarihMetni = gorev.sonTarih ? tarihSaat(gorev.sonTarih) : null
  const konu = `Takip görevi · ${gorev.baslik}${d.hukukNo ? ' · ' + d.hukukNo : ''}`

  // ── dosya künyesi (hap) ──
  const kunye = ([
    ['Hukuk No', d.hukukNo ? esc(d.hukukNo) : ''],
    ['İcra takip No', d.icraNo ? esc(d.icraNo) : ''],
    ['Yetkili icra', d.yetkiliIcra ? esc(d.yetkiliIcra) : ''],
    ['Borçlu', d.borclu ? `${esc(d.borclu)}${d.borcluSayisi > 1 ? ` <span style="color:${MUTED}">+${d.borcluSayisi - 1}</span>` : ''}` : ''],
    ['Toplam alacak', d.toplam != null ? `${tl(d.toplam)}${d.faiz != null ? ` <span style="color:${MUTED};font-weight:400">(faiz ${tl(d.faiz)})</span>` : ''}` : ''],
    ['Aşama', d.asama ? esc(d.asama) : ''],
    ['Zamanaşımı', d.zamanasimi ? `${tarihKisa(d.zamanasimi)}${d.zamanasimiKalan != null ? ` · <b style="color:${d.zamanasimiKalan <= 30 ? '#b91c1c' : d.zamanasimiKalan <= 90 ? '#b45309' : INK}">${d.zamanasimiKalan < 0 ? 'geçti' : d.zamanasimiKalan + 'g'}</b>` : ''}` : ''],
  ] as [string, string][]).filter(([, v]) => v)

  const kunyeRows = kunye
    .map(([k, v], i) => `<tr>
      <td style="padding:8px 14px;font-size:12px;color:${MUTED};white-space:nowrap;${i ? `border-top:1px solid ${BORDER};` : ''}">${esc(k)}</td>
      <td align="right" style="padding:8px 14px;font-size:13px;font-weight:600;color:${INK};${i ? `border-top:1px solid ${BORDER};` : ''}">${v}</td>
    </tr>`)
    .join('')

  // ── ilgili etkinlik (safahat) ──
  const eDurum = etkinlik ? EDURUM[etkinlik.durum] ?? EDURUM.PLANLANDI : null
  const etkinlikBlok = etkinlik
    ? `<tr><td style="padding:16px 24px 4px;">
        <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-family:monospace;color:${MUTED};margin-bottom:6px;">İlgili etkinlik</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;border:1px solid ${BORDER};border-radius:12px;">
          <tr><td style="padding:14px 16px;">
            <span style="display:inline-block;background:${eDurum!.bg};color:${eDurum!.fg};font-size:11px;font-weight:bold;padding:2px 9px;border-radius:999px;">${esc(eDurum!.label)}</span>
            <div style="margin-top:6px;font-size:14.5px;font-weight:700;color:${INK};">${esc(ETUR[etkinlik.tur] ?? etkinlik.baslik)}</div>
            <div style="margin-top:3px;font-family:monospace;font-size:13px;color:${AKSAN};font-weight:bold;">🗓 ${esc(tarihSaat(etkinlik.baslar))}</div>
            ${etkinlik.sonucNot ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid ${BORDER};font-size:12.5px;line-height:1.5;color:${MUTED};"><b style="color:${INK};">Not:</b> ${esc(etkinlik.sonucNot)}</div>` : ''}
          </td></tr>
        </table>
      </td></tr>`
    : ''

  const aciklamaBlok = gorev.aciklama
    ? `<div style="margin-top:5px;font-size:14px;line-height:1.55;color:${INK};"><p style="margin:0;">${cokSatir(gorev.aciklama)}</p></div>`
    : `<div style="margin-top:5px;font-size:13px;color:${MUTED};">—</div>`

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(konu)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid ${BORDER};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
        <tr><td style="background:${AKSAN};padding:20px 24px;">
          <div style="color:#bdeef1;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;font-family:monospace;">KonsRücu · Takip görevi</div>
          <div style="color:#ffffff;font-size:21px;font-weight:800;margin-top:4px;">${esc(gorev.baslik)}</div>
          <div style="color:#d7f3f5;font-size:13px;margin-top:5px;">${gorev.atayanAd ? `<b>${esc(gorev.atayanAd)}</b>` : 'Atayan'} → ${gorev.sorumluAd ? `<b>${esc(gorev.sorumluAd)}</b>` : 'Sorumlu'}${sonTarihMetni ? ` · son tarih <b>${esc(sonTarihMetni)}</b>` : ''}</div>
        </td></tr>

        <tr><td style="padding:20px 24px 6px;">
          <div style="font-size:15px;color:${INK};">Merhaba${gorev.sorumluAd ? ` <b>${esc(gorev.sorumluAd)}</b>` : ''},</div>
          <div style="font-size:13.5px;color:${MUTED};margin-top:4px;">${gorev.atayanAd ? `<b>${esc(gorev.atayanAd)}</b> ` : ''}aşağıdaki dosyada sana bir takip görevi atadı.</div>
        </td></tr>

        <tr><td style="padding:8px 24px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f0fbfc;border:1px solid #cdeef0;border-radius:12px;">
            <tr><td style="padding:14px 16px;">
              <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-family:monospace;color:${AKSAN};">Yapılacak</div>
              ${aciklamaBlok}
            </td></tr>
          </table>
        </td></tr>

        ${etkinlikBlok}

        <tr><td style="padding:14px 24px 4px;">
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;font-family:monospace;color:${MUTED};margin-bottom:6px;">Dosya künyesi</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
            ${kunyeRows}
          </table>
        </td></tr>

        ${g.dosyaUrl ? `<tr><td style="padding:16px 24px 22px;">
          <a href="${esc(g.dosyaUrl)}" style="display:inline-block;background:${AKSAN};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:10px;">Dosyayı aç →</a>
        </td></tr>` : ''}

        <tr><td style="background:#f8fafc;border-top:1px solid ${BORDER};padding:14px 24px;">
          <div style="font-size:11.5px;color:${MUTED};">${gorev.atayanAd ? `Bu görev <b>${esc(gorev.atayanAd)}</b> tarafından atandı · ` : ''}KonsRücü · <a href="mailto:info@konstraerp.com" style="color:${AKSAN};text-decoration:none;">info@konstraerp.com</a></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const textKunye = kunye.map(([k, v]) => `  ${k}: ${String(v).replace(/<[^>]+>/g, '')}`).join('\n')
  const textEtkinlik = etkinlik
    ? `\nİLGİLİ ETKİNLİK\n  ${ETUR[etkinlik.tur] ?? etkinlik.baslik} · ${tarihUzun(etkinlik.baslar)} · ${(EDURUM[etkinlik.durum] ?? EDURUM.PLANLANDI).label}${etkinlik.sonucNot ? '\n  Not: ' + etkinlik.sonucNot : ''}\n`
    : ''
  const text = `Merhaba${gorev.sorumluAd ? ' ' + gorev.sorumluAd : ''},
${gorev.atayanAd ? gorev.atayanAd + ' ' : ''}sana bir takip görevi atadı.

GÖREV: ${gorev.baslik}
${gorev.aciklama ?? '—'}
${sonTarihMetni ? 'Son tarih: ' + sonTarihMetni : ''}
${textEtkinlik}
DOSYA
${textKunye}
${g.dosyaUrl ? '\nDosyayı aç: ' + g.dosyaUrl : ''}

—
${gorev.atayanAd ? 'Atayan: ' + gorev.atayanAd + ' · ' : ''}KonsRücü · info@konstraerp.com`

  return { konu, html, text }
}
