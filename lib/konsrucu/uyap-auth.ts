/**
 * KonsRücü — UYAP eklenti API kimliği · lib/konsrucu/uyap-auth.ts (server-only)
 * Eklenti, Şirket Bilgileri'nde üretilen tenant'a özel SENKRON ANAHTARINI Bearer gönderir.
 * Burada anahtar Ayarlar.senkronToken ile doğrulanıp tenant'a (musteriId) bağlanır.
 */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export type UyapKimlik = { userId: string | null; izinli: string[] }

export async function uyapKimlik(req: Request): Promise<UyapKimlik | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token || token.length < 20) return null
  const ay = await prisma.ayarlar.findFirst({ where: { senkronToken: token }, select: { musteriId: true } })
  if (!ay) return null
  return { userId: null, izinli: [ay.musteriId] }
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
