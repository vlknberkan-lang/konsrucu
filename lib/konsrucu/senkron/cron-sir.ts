/**
 * KonsRücü — Yeni cron uçları için sır kontrolü · lib/konsrucu/senkron/cron-sir.ts (saf; server)
 *
 * S14 (B51): cron sırrı YALNIZ `Authorization: Bearer <CRON_SECRET>` başlığıyla kabul edilir; adres satırında
 * (`?key=`) gönderilen sır reddedilir (sunucu günlüklerine ve tarayıcı geçmişine düşmesin). Karşılaştırma sabit
 * sürelidir. Eski cron uçları lib/konsrucu/cron-ortak.ts'teki eski kontrolü kullanmaya devam eder (ayrı dilim).
 */
import { timingSafeEqual } from 'node:crypto'

/** Sorun varsa hazır yanıt (500: sır tanımsız, 401: yanlış ya da yalnız adres satırında); geçerliyse null. */
export function cronSirYetkisiz(req: Request, env: Record<string, string | undefined> = process.env): Response | null {
  const sir = env.CRON_SECRET
  if (!sir) return Response.json({ ok: false, error: 'CRON_SECRET tanımlı değil' }, { status: 500 })
  const gelen = Buffer.from(req.headers.get('authorization') ?? '', 'utf8')
  const beklenen = Buffer.from(`Bearer ${sir}`, 'utf8')
  if (gelen.length !== beklenen.length || !timingSafeEqual(gelen, beklenen)) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  return null
}
