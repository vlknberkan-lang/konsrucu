'use server'
/**
 * KonsLaw — Self-serve kayıt · app/kayit/actions.ts (PUBLIC)
 * Akış: Supabase signUp (e-posta doğrulaması proje ayarına göre) → Kullanici (ADMIN)
 * + ilk Müvekkil (Musteri) + MusteriKullanici + Ayarlar (senkronToken hazır).
 * Korumalar: zod, honeypot, KVKK açık onay. Musteri.ad global unique → çakışmada sonek.
 */
import { z } from 'zod'
import { Rol } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'

const KayitSema = z.object({
  ad: z.string().trim().min(2, 'Ad Soyad gerekli').max(120),
  buroAd: z.string().trim().min(2, 'Büro / şirket adı gerekli').max(160),
  eposta: z.string().trim().email('Geçerli bir e-posta girin').max(200),
  sifre: z.string().min(8, 'Şifre en az 8 karakter olmalı').max(72),
  kvkkOnay: z.literal(true, { error: 'KVKK aydınlatma metnini onaylamanız gerekir' }),
  web: z.string().max(0).optional().or(z.literal('')), // honeypot
})

export type KayitSonuc =
  | { ok: true; dogrulamaGerekli: boolean }
  | { ok: false; hata: string }

export async function kayitOl(girdi: unknown): Promise<KayitSonuc> {
  const p = KayitSema.safeParse(girdi)
  if (!p.success) return { ok: false, hata: p.error.issues[0]?.message ?? 'Form doğrulanamadı' }
  const d = p.data

  const supabase = createClient()
  const { data, error } = await supabase.auth.signUp({
    email: d.eposta,
    password: d.sifre,
    options: { data: { ad: d.ad, buro: d.buroAd } },
  })
  if (error) {
    const m = /already|registered|exists/i.test(error.message)
      ? 'Bu e-posta zaten kayıtlı — giriş yapmayı deneyin.'
      : `Kayıt başarısız: ${error.message}`
    return { ok: false, hata: m }
  }
  const user = data.user
  if (!user) return { ok: false, hata: 'Kayıt başarısız — lütfen tekrar deneyin.' }
  // Supabase, kayıtlı e-postada hata yerine identities boş kullanıcı döndürür (enumeration koruması)
  if (Array.isArray(user.identities) && user.identities.length === 0) {
    return { ok: false, hata: 'Bu e-posta zaten kayıtlı — giriş yapmayı deneyin.' }
  }

  // Uygulama kayıtları — idempotent: aynı auth id ile ikinci çağrı (yeniden deneme) patlamasın
  const mevcut = await prisma.kullanici.findUnique({ where: { id: user.id }, select: { id: true } })
  if (!mevcut) {
    await prisma.kullanici.create({
      data: { id: user.id, ad: d.ad, eposta: d.eposta, rol: Rol.ADMIN, silmeYetkisi: true },
    })
    // Musteri.ad global unique → çakışırsa kısa sonek ekle
    let musteriAd = d.buroAd
    for (let deneme = 0; deneme < 3; deneme++) {
      try {
        const musteri = await prisma.musteri.create({ data: { ad: musteriAd } })
        await prisma.musteriKullanici.create({ data: { musteriId: musteri.id, kullaniciId: user.id } })
        await prisma.ayarlar.create({
          data: {
            musteriId: musteri.id,
            alacakliUnvan: d.buroAd,
            eposta: d.eposta,
            senkronToken: crypto.randomUUID(),
          },
        })
        break
      } catch (e) {
        const p2002 = typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'
        if (!p2002 || deneme === 2) throw e
        musteriAd = `${d.buroAd} · ${user.id.slice(0, 4)}`
      }
    }
  }

  return { ok: true, dogrulamaGerekli: !data.session }
}
