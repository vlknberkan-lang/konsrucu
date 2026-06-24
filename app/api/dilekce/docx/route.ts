/**
 * KonsRücü — Dilekçe → Word indir · POST /api/dilekce/docx
 * Gövde: { metin, ad? }. Düzenlenmiş metni .docx olarak döndürür (attachment). Auth zorunlu.
 */
import { ctx } from '@/lib/konsrucu/db'
import { dilekceDocx } from '@/lib/konsrucu/dilekce-docx'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  await ctx() // auth (giriş yoksa /login'e yönlendirir)
  let body: { metin?: string; ad?: string }
  try { body = await req.json() } catch { return new Response('bad json', { status: 400 }) }
  const metin = String(body?.metin ?? '')
  if (!metin.trim()) return new Response('boş metin', { status: 400 })
  const ad = (String(body?.ad ?? 'dava-dilekcesi').replace(/[^\w.\-]+/g, '_') || 'dava-dilekcesi').slice(0, 60)
  const buf = await dilekceDocx(metin)
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename="${ad}.docx"`,
      'cache-control': 'no-store',
    },
  })
}
