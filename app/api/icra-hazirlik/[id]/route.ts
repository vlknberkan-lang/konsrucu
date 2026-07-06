/**
 * KonsRücü — İcra Takibine Hazırlık paketi · GET /api/icra-hazirlik/[id]
 * Dosyanın dayanak klasörünü (vekaletname + poliçe + tutanaklar + beyan + şartlı ekspertiz + dekont
 * + 2-3 hasar fotoğrafı + "hap bilgiler" özeti) TEK .zip olarak indirir. Tenant-kapsamlı, auth zorunlu.
 * Zip kurulumu lib/konsrucu/icra-paket.ts'te (eklentinin /api/uyap/takip-paket ucuyla ORTAK).
 */
import { ctx } from '@/lib/konsrucu/db'
import { icraPaketOlustur } from '@/lib/konsrucu/icra-paket'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { izinli } = await ctx()
  const paket = await icraPaketOlustur(params.id, izinli)
  if (!paket.ok) return new Response(paket.error, { status: paket.status })
  return new Response(new Uint8Array(paket.zip), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${paket.dosyaAdi}"`,
      'Cache-Control': 'no-store',
    },
  })
}
