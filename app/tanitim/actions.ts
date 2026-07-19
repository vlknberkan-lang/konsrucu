'use server'
/**
 * KonsLaw — Tanıtım sayfası demo kaydı server action · app/tanitim/actions.ts
 * PUBLIC uç (auth yok — henüz müşteri değiller). Korumalar: zod doğrulama,
 * honeypot alanı, KVKK açık onay zorunlu, alan uzunluk sınırları.
 * Kayıt DemoKaydi'na düşer + Berkan'a best-effort bildirim maili gider
 * (mail hatası kaydı bozmaz).
 */
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { mailGonder } from '@/lib/konsrucu/mail'

const DemoSema = z.object({
  ad: z.string().trim().min(2, 'Ad Soyad gerekli').max(120),
  eposta: z.string().trim().email('Geçerli bir e-posta girin').max(200),
  telefon: z
    .string()
    .trim()
    .max(24)
    .regex(/^[+\d][\d\s().-]{6,}$/u, 'Geçerli bir telefon girin')
    .optional()
    .or(z.literal('')),
  buroAd: z.string().trim().max(160).optional().or(z.literal('')),
  mesaj: z.string().trim().max(2000).optional().or(z.literal('')),
  kvkkOnay: z.literal(true, { error: 'KVKK aydınlatma metnini onaylamanız gerekir' }),
  // honeypot: gerçek kullanıcı doldurmaz; botlar doldurur → sessizce yut
  web: z.string().max(0).optional().or(z.literal('')),
})

export type DemoSonuc = { ok: true } | { ok: false; hata: string }

export async function demoKaydet(girdi: unknown): Promise<DemoSonuc> {
  const p = DemoSema.safeParse(girdi)
  if (!p.success) {
    return { ok: false, hata: p.error.issues[0]?.message ?? 'Form doğrulanamadı' }
  }
  const d = p.data

  // basit tekrar koruması: aynı e-postadan son 10 dakikada kayıt varsa yenisini açma
  const yakin = await prisma.demoKaydi.findFirst({
    where: { eposta: d.eposta, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
    select: { id: true },
  })
  if (yakin) return { ok: true } // kullanıcıya aynı başarı ekranı — bilgi sızdırma yok

  await prisma.demoKaydi.create({
    data: {
      ad: d.ad,
      eposta: d.eposta,
      telefon: d.telefon || null,
      buroAd: d.buroAd || null,
      mesaj: d.mesaj || null,
      kvkkOnay: true,
    },
  })

  // bildirim — best effort; mail servisi yoksa console'a düşer, kayıt geçerli kalır
  try {
    await mailGonder({
      to: 'vberkanbiyikli@gmail.com',
      konu: `KonsLaw demo talebi — ${d.ad}${d.buroAd ? ` (${d.buroAd})` : ''}`,
      html:
        `<h2>Yeni demo talebi</h2>` +
        `<p><b>Ad:</b> ${d.ad}<br/><b>E-posta:</b> ${d.eposta}<br/>` +
        `<b>Telefon:</b> ${d.telefon || '—'}<br/><b>Büro:</b> ${d.buroAd || '—'}</p>` +
        (d.mesaj ? `<p><b>Mesaj:</b><br/>${d.mesaj.replace(/</g, '&lt;')}</p>` : ''),
    })
  } catch {
    /* bildirim düşmese de lead kaydedildi */
  }

  return { ok: true }
}
