/**
 * KonsRücü — Anlık senkron iş kuyruğu · POST /api/uyap/is/:id/adim  (S22)
 * Eklenti tek dosyalık boru hattının her adımını yazar (tek yazıcı: işi üstlenen cihaz).
 * Gövde: { cihaz, adim: { adim, durum, sayac?: {n, toplam}, mesaj? } }. Program sayfası bunu 2 sn'de bir okur.
 * YALNIZ YENİ ANAHTAR.
 */
import { corsJson, preflight, yeniAnahtarKimligi } from '@/lib/konsrucu/uyap-auth'
import { adimYaz, cihazGecerli } from '@/lib/konsrucu/senkron/is-kuyrugu'
import type { AdimGirdisi } from '@/lib/konsrucu/senkron/is-saf'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request) {
  return preflight(req)
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const kr = await yeniAnahtarKimligi(req)
  if (!kr.ok) return corsJson({ ok: false, error: kr.error }, kr.status, req)
  let body: { cihaz?: unknown; adim?: AdimGirdisi }
  try { body = await req.json() } catch { return corsJson({ ok: false, error: 'bad json' }, 400, req) }
  const cihaz = body?.cihaz ?? req.headers.get('x-eklenti-cihaz')
  if (!cihazGecerli(cihaz)) return corsJson({ ok: false, error: 'cihaz kimliği geçersiz' }, 400, req)
  if (!body?.adim) return corsJson({ ok: false, error: 'adim gerekli' }, 400, req)
  const r = await adimYaz(String(params.id ?? ''), kr.kimlik, cihaz, body.adim)
  if (!r.ok) return corsJson({ ok: false, error: r.error }, r.status, req)
  return corsJson({ ok: true }, 200, req)
}
