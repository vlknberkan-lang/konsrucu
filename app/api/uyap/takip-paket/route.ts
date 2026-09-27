/**
 * KonsRücü — Takip Aç Kopilotu · GET /api/uyap/takip-paket?dosyaId=X
 * Eklenti, TEVZİ ONAYLANINCA dosyanın dayanak klasörünü (vekaletname + poliçe + tutanaklar +
 * beyan + şartlı ekspertiz + dekont + 2-3 hasar fotoğrafı + özet) .zip olarak OTOMATİK indirir
 * (chrome.downloads, Bearer başlıklı). Zip kurulumu lib/konsrucu/icra-paket.ts'te
 * (/api/icra-hazirlik ile ORTAK). Tenant-kapsamlı (Bearer = senkron anahtarı).
 */
import { uyapKimlik, corsJson, preflight, izinliKoken } from '@/lib/konsrucu/uyap-auth'
import { icraPaketOlustur } from '@/lib/konsrucu/icra-paket'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function OPTIONS(req: Request) {
  return preflight(req)
}

export async function GET(req: Request) {
  const k = await uyapKimlik(req)
  if (!k) return corsJson({ ok: false, error: 'unauthorized' }, 401, req)

  const dosyaId = String(new URL(req.url).searchParams.get('dosyaId') ?? '').trim()
  if (!dosyaId) return corsJson({ ok: false, error: 'dosyaId gerekli' }, 400, req)

  const paket = await icraPaketOlustur(dosyaId, k.izinli)
  if (!paket.ok) return corsJson({ ok: false, error: paket.error }, paket.status, req)

  // CORS yalnız eklenti kökeni (S14); chrome.downloads zaten CORS'a takılmaz.
  const koken = izinliKoken(req.headers.get('origin'))
  return new Response(new Uint8Array(paket.zip), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${paket.dosyaAdi}"`,
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      ...(koken ? { 'Access-Control-Allow-Origin': koken } : {}),
    },
  })
}
