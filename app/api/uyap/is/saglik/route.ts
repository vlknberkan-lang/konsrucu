/**
 * KonsRücü — Anlık senkron iş kuyruğu sağlık bekçisi · GET|POST /api/uyap/is/saglik  (S22)
 * Takılı işleri kapatır: 5 dakikadır hareketsiz ALINDI/CALISIYOR ve 24 saattir üstlenilmemiş BEKLIYOR işler
 * ZAMAN_ASIMI olur; kapatılan varsa Ayarlar > Sistem Olayları'na tek satır düşer. Dosya bir sonraki toplu turda
 * yeniden denenir. Kiracılar arası tarama (`@@index([durum, updatedAt])`).
 *
 * Kimlik: CRON_SECRET YALNIZ `Authorization: Bearer …` başlığıyla (S14, B51: sır adres satırında gönderilmez;
 * `?key=` kabul edilmez). Vercel Cron bu başlığı kendisi ekler. Önerilen zamanlama: 5 dakikada bir.
 * Canlı panel (senkronIsDurumu) aynı kapanışı o dosya için ayrıca yapar; bu uç ekranı açık olmayan işler içindir.
 */
import { senkronIsZamanAsimi } from '@/lib/konsrucu/senkron/is-kuyrugu'
import { cronSirYetkisiz } from '@/lib/konsrucu/senkron/cron-sir'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function handle(req: Request) {
  const yetkisiz = cronSirYetkisiz(req)
  if (yetkisiz) return yetkisiz
  const r = await senkronIsZamanAsimi(new Date())
  return Response.json({ ok: true, ...r })
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
