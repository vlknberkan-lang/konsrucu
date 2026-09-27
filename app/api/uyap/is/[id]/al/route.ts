/**
 * KonsRücü — Anlık senkron iş kuyruğu · POST /api/uyap/is/:id/al  (S22)
 * İşi ATOMİK üstlenir: `WHERE id = ? AND durum = 'BEKLIYOR' AND musteriId IN (anahtarın kapsamı)`.
 * İki eklenti aynı işi alamaz (ikincisi 409); başka müvekkilin anahtarı işi hiç göremez (404).
 * Gövde: { cihaz, surum }. Yanıt: iş + hedef (program dosya kimliği, daire, esas no, alacaklı unvanı).
 * YALNIZ YENİ ANAHTAR.
 */
import { corsJson, preflight, yeniAnahtarKimligi } from '@/lib/konsrucu/uyap-auth'
import { cihazGecerli, isUstlen } from '@/lib/konsrucu/senkron/is-kuyrugu'
import { sunucuOzellikleri } from '@/lib/konsrucu/senkron/ozellikler'

export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request) {
  return preflight(req)
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const kr = await yeniAnahtarKimligi(req)
  if (!kr.ok) return corsJson({ ok: false, error: kr.error }, kr.status, req)
  if (!sunucuOzellikleri().isKuyrugu) return corsJson({ ok: false, error: 'iş kuyruğu sunucuda kapalı' }, 409, req)
  let body: { cihaz?: unknown; surum?: unknown }
  try { body = await req.json() } catch { return corsJson({ ok: false, error: 'bad json' }, 400, req) }
  const cihaz = body?.cihaz ?? req.headers.get('x-eklenti-cihaz')
  if (!cihazGecerli(cihaz)) return corsJson({ ok: false, error: 'cihaz kimliği geçersiz' }, 400, req)
  const r = await isUstlen(String(params.id ?? ''), kr.kimlik, cihaz, body?.surum ?? req.headers.get('x-eklenti-surum'))
  if (!r.ok) return corsJson({ ok: false, error: r.error }, r.status, req)
  return corsJson({ ok: true, is: r.is }, 200, req)
}
