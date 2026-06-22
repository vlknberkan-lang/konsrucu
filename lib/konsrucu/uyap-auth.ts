/**
 * KonsRücü — UYAP eklenti API kimliği · lib/konsrucu/uyap-auth.ts (server-only)
 * Eklenti, programa (konsrucu) giriş yapmış Supabase oturumunun access token'ını Bearer gönderir.
 * Burada token Supabase ile doğrulanıp kullanıcı + erişebildiği tenant'lara (musteriId) bağlanır.
 * Token yapıştırma yok: eklenti token'ı chrome.cookies ile programın çerezinden okur.
 */
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export type UyapKimlik = { userId: string; ad: string; izinli: string[] }

export async function uyapKimlik(req: Request): Promise<UyapKimlik | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data?.user) return null
  const dbUser = await prisma.kullanici.findUnique({ where: { id: data.user.id }, include: { musteriler: true } })
  if (!dbUser) return null
  return { userId: dbUser.id, ad: dbUser.ad, izinli: dbUser.musteriler.map((m) => m.musteriId) }
}

// MV3 eklenti (host izinli) için CORS şart değil; yine de content-script/çağrı esnekliği için açık.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '86400',
}
export function cors<T>(res: NextResponse<T>): NextResponse<T> {
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v)
  return res
}
export function corsJson(body: unknown, status = 200): NextResponse {
  return cors(NextResponse.json(body, { status }))
}
export function preflight(): NextResponse {
  return cors(new NextResponse(null, { status: 204 }))
}
