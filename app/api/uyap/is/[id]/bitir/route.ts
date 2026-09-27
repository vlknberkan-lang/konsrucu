/**
 * KonsRücü — Anlık senkron iş kuyruğu · POST /api/uyap/is/:id/bitir  (S22)
 * Gövde: { cihaz, durum: TAMAM | KISMI | HATA, ozet?: {evrakSayisi, yeniEvrak, eslesme, …}, hata? }.
 * Aktivite satırı işi üstlenen kişinin adıyla yazılır (kişiye bağlı anahtar). YALNIZ YENİ ANAHTAR.
 */
import { corsJson, preflight, yeniAnahtarKimligi } from '@/lib/konsrucu/uyap-auth'
import { cihazGecerli, isBitir } from '@/lib/konsrucu/senkron/is-kuyrugu'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request) {
  return preflight(req)
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const kr = await yeniAnahtarKimligi(req)
  if (!kr.ok) return corsJson({ ok: false, error: kr.error }, kr.status, req)
  let body: { cihaz?: unknown; durum?: unknown; ozet?: unknown; hata?: unknown }
  try { body = await req.json() } catch { return corsJson({ ok: false, error: 'bad json' }, 400, req) }
  const cihaz = body?.cihaz ?? req.headers.get('x-eklenti-cihaz')
  if (!cihazGecerli(cihaz)) return corsJson({ ok: false, error: 'cihaz kimliği geçersiz' }, 400, req)
  const r = await isBitir(String(params.id ?? ''), kr.kimlik, cihaz, { durum: body?.durum, ozet: body?.ozet, hata: body?.hata })
  if (!r.ok) return corsJson({ ok: false, error: r.error }, r.status, req)
  return corsJson({ ok: true }, 200, req)
}
