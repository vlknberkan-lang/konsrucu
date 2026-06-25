/**
 * KonsRücü — Masraf · Excel dışa aktarım · GET /api/masraf/export
 *
 * Masraflar sayfasının o anki filtre/aramasıyla AYNI kümeyi (parseFiltre + masrafListele) RAY SİGORTA
 * RÜCU MASRAF FORMU şablonuna doldurup .xlsx olarak indirir. Tenant-kapsamlı (dosya.musteriId), auth zorunlu.
 */
import { ctx } from '@/lib/konsrucu/db'
import { parseFiltre, masrafListele } from '@/lib/konsrucu/masraf-sorgu'
import { masrafExcelBuffer } from '@/lib/konsrucu/masraf-excel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { aktifMusteriId } = await ctx()
  if (!aktifMusteriId) {
    return new Response('Aktif müşteri seçili değil', { status: 400 })
  }

  const url = new URL(req.url)
  const f = parseFiltre((k) => url.searchParams.get(k))
  const rows = await masrafListele(aktifMusteriId, f)
  const buf = await masrafExcelBuffer(rows)

  const bugun = new Date().toISOString().slice(0, 10)
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Ray-Masraf-${bugun}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
