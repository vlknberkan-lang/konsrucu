/**
 * KonsRücü — E-posta gönderimi · lib/konsrucu/mail.ts (server-only, nodejs runtime)
 * EMAIL_SERVICE = smtp (nodemailer) | console (dev/log). Tüm ayarlar env'den; sır client'a sızmaz.
 *   EMAIL_FROM, EMAIL_FROM_NAME, EMAIL_SERVICE, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 */
import nodemailer from 'nodemailer'

export type MailGirdi = {
  to: string | string[]
  konu: string
  html: string
  text?: string
  attachments?: { filename: string; content: Buffer | string; contentType?: string }[]
}

function fromAdresi(): string {
  const eposta = process.env.EMAIL_FROM || 'no-reply@localhost'
  const ad = process.env.EMAIL_FROM_NAME
  return ad ? `${ad} <${eposta}>` : eposta
}

/** Gönderim hatasını SistemOlay'a düş (best-effort; mail akışını asla bozmaz). */
async function hataLogla(mesaj: string, konu: string) {
  try {
    const { sistemOlayKaydet } = await import('@/lib/konsrucu/sistem-olay')
    await sistemOlayKaydet('MAIL_HATA', 'mail', mesaj, { konu })
  } catch { /* log yazılamasa da gönderim sonucu döner */ }
}

export async function mailGonder(g: MailGirdi): Promise<{ ok: boolean; id?: string; error?: string }> {
  const servis = (process.env.EMAIL_SERVICE || 'console').toLowerCase()
  const to = Array.isArray(g.to) ? g.to.filter(Boolean).join(', ') : g.to
  if (!to) return { ok: false, error: 'Alıcı (to) boş' }

  if (servis === 'console') {
    console.log('[mail:console]', { to, konu: g.konu, htmlUzunluk: g.html.length, ek: g.attachments?.length ?? 0 })
    return { ok: true, id: 'console' }
  }

  if (servis === 'smtp') {
    const host = process.env.SMTP_HOST
    const port = Number(process.env.SMTP_PORT || 465)
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    if (!host || !user || !pass) {
      await hataLogla('SMTP ayarları eksik (SMTP_HOST/USER/PASS)', g.konu)
      return { ok: false, error: 'SMTP ayarları eksik (SMTP_HOST/USER/PASS)' }
    }

    // Ayarlı port + alternatif (465↔587) sırayla denenir — bazı sağlayıcılar bir portu bloklar.
    const denemeler: { port: number; secure: boolean }[] = [{ port, secure: port === 465 }]
    denemeler.push(port === 465 ? { port: 587, secure: false } : { port: 465, secure: true })

    const hatalar: string[] = []
    for (const d of denemeler) {
      try {
        const transport = nodemailer.createTransport({
          host,
          port: d.port,
          secure: d.secure, // 465 = implicit TLS; 587 = STARTTLS
          auth: { user, pass },
          connectionTimeout: 15_000,
          greetingTimeout: 10_000,
          requireTLS: !d.secure,
        })
        const info = await transport.sendMail({ from: fromAdresi(), to, subject: g.konu, html: g.html, text: g.text, ...(g.attachments?.length ? { attachments: g.attachments } : {}) })
        return { ok: true, id: info.messageId }
      } catch (e) {
        hatalar.push(`:${d.port} → ${(e as Error).message}`)
      }
    }
    await hataLogla(`SMTP gönderilemedi (${hatalar.join(' | ')})`, g.konu)
    return { ok: false, error: `SMTP gönderilemedi (${hatalar.join(' | ')})` }
  }

  await hataLogla(`Desteklenmeyen EMAIL_SERVICE: ${servis}`, g.konu)
  return { ok: false, error: `Desteklenmeyen EMAIL_SERVICE: ${servis}` }
}
