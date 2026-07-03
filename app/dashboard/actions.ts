'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

/** Müşteri (tenant) seç → güvenlik için atama doğrulanır → cookie + kabuğa (Bugün panosu) geç. */
export async function secMusteri(formData: FormData) {
  const musteriId = String(formData.get('musteriId') ?? '')
  if (!musteriId) redirect('/dashboard')

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Kullanıcı bu müşteriye gerçekten atanmış mı? (tenant izolasyonu)
  const link = await prisma.musteriKullanici.findUnique({
    where: { musteriId_kullaniciId: { musteriId, kullaniciId: user.id } },
  })
  if (!link) redirect('/dashboard')

  cookies().set('aktif_musteri', musteriId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  redirect('/bugun')
}
