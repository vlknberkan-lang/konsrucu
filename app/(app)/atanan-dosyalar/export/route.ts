/**
 * KonsRücü — Atanan Dosyalar · Excel dışa aktarım · GET /atanan-dosyalar/export
 *
 * Ana listenin (Hugo tevdiye = hukukDosyaNo dolu) o anki filtre/aramasıyla aynı kümeyi
 * .xlsx olarak indirir. Sayfadaki q/cekildi/sort parametrelerini birebir uygular; 300'lük
 * ekran sınırı YOK (tüm eşleşenler, güvenlik için üst sınır 10.000).
 *
 * Şık biçim: dondurulmuş başlık + otomatik filtre, aşamaya (DosyaDurum) göre renkli satır
 * zemini (design-system token'ları), "Kalan Gün" sütununda koşullu biçimlendirme (zaman aşımı).
 * Tenant-kapsamlı, auth zorunlu.
 */
import ExcelJS from 'exceljs'
import { Prisma, DosyaDurum } from '@prisma/client'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { ASAMA, asamaBilgi, asamaRenk, TON_RENK, ASAMA_DURUMLAR, ASAMA_META, ASAMA_SIRA, type AsamaKey } from '@/lib/konsrucu/asama'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BORDER = 'FFE2E8F0'
const INK = 'FF1E293B'
const HEADER_BG = 'FF0F2A3F' // koyu çelik — başlık şeridi
const TITLE_BG = TON_RENK.kr.strong

const fmtTarih = (d: Date | null) => (d ? d.toLocaleDateString('tr-TR') : '')
const kalanGun = (d: Date | null) => (d ? Math.ceil((d.getTime() - Date.now()) / 86_400_000) : null)

export async function GET(req: Request) {
  const { aktifMusteriId } = await ctx()
  if (!aktifMusteriId) {
    return new Response('Aktif müşteri seçili değil', { status: 400 })
  }

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  const cekildiParam = url.searchParams.get('cekildi')
  const cekildi = cekildiParam === 'evet' ? 'evet' : cekildiParam === 'hayir' ? 'hayir' : 'all'
  const asamaParam = url.searchParams.get('asama')
  const asama: AsamaKey | 'all' = ASAMA_SIRA.includes(asamaParam as AsamaKey) ? (asamaParam as AsamaKey) : 'all'
  const sortParam = url.searchParams.get('sort') ?? ''
  const sort = ['zamanasimi', 'tutar', 'atanma'].includes(sortParam) ? sortParam : 'yeni'

  // ── sayfayla aynı where / orderBy ────────────────────────────────────────
  const temelWhere: Prisma.RucuDosyasiWhereInput = {
    musteriId: aktifMusteriId,
    hukukDosyaNo: { not: null },
    ...(q
      ? {
          OR: [
            { hukukDosyaNo: { contains: q, mode: 'insensitive' } },
            { hasarDosyaNo: { contains: q, mode: 'insensitive' } },
            { sigortaliUnvan: { contains: q, mode: 'insensitive' } },
            { sigortaliTelefon: { contains: q, mode: 'insensitive' } },
            { gonderenBirim: { contains: q, mode: 'insensitive' } },
            { kadroluAvukat: { contains: q, mode: 'insensitive' } },
            { sozlesmeliAvukat: { contains: q, mode: 'insensitive' } },
            { borclular: { some: { adUnvan: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  }
  const where: Prisma.RucuDosyasiWhereInput = {
    ...temelWhere,
    ...(asama !== 'all' ? { durum: { in: ASAMA_DURUMLAR[asama] as DosyaDurum[] } } : {}),
    ...(cekildi === 'evet' ? { hugodanCekildi: true } : cekildi === 'hayir' ? { hugodanCekildi: false } : {}),
  }
  const orderBy: Prisma.RucuDosyasiOrderByWithRelationInput[] =
    sort === 'zamanasimi'
      ? [{ zamanasimi: { sort: 'asc', nulls: 'last' } }]
      : sort === 'tutar'
        ? [{ davaMiktari: { sort: 'desc', nulls: 'last' } }]
        : sort === 'atanma'
          ? [{ atanmaTarihi: { sort: 'desc', nulls: 'last' } }]
          : [{ createdAt: 'desc' }]

  const rows = await prisma.rucuDosyasi.findMany({
    where,
    orderBy,
    take: 10_000,
    select: {
      hukukDosyaNo: true, hasarDosyaNo: true, durum: true, sigortaliUnvan: true, gonderenBirim: true,
      kadroluAvukat: true, sozlesmeliAvukat: true, atanmaTarihi: true, zamanasimi: true,
      hugoDurum: true, davaMiktari: true, rucuTutari: true, hugodanCekildi: true,
      borclular: { select: { adUnvan: true }, orderBy: { id: 'asc' } },
    },
  })

  // ── workbook ─────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook()
  wb.creator = 'KonsRücu'
  wb.created = new Date()
  const ws = wb.addWorksheet('Atanan Dosyalar', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  const KOLONLAR: { baslik: string; gen: number }[] = [
    { baslik: 'Hukuk Dosya No', gen: 18 },
    { baslik: 'Hasar Dosya No', gen: 17 },
    { baslik: 'Aşama', gen: 15 },
    { baslik: 'Sigortalı Ünvan', gen: 28 },
    { baslik: 'Gönderen Birim', gen: 22 },
    { baslik: 'Borçlu(lar)', gen: 32 },
    { baslik: 'Borçlu', gen: 8 },
    { baslik: 'Kadrolu Avukat', gen: 20 },
    { baslik: 'Sözleşmeli Avukat', gen: 20 },
    { baslik: 'Atanma', gen: 12 },
    { baslik: 'Zaman Aşımı', gen: 13 },
    { baslik: 'Kalan Gün', gen: 11 },
    { baslik: 'Dava Miktarı', gen: 16 },
    { baslik: 'Rücu Tutarı', gen: 16 },
    { baslik: 'Hugo Durumu', gen: 22 },
    { baslik: 'Çekildi', gen: 9 },
  ]
  const N = KOLONLAR.length
  KOLONLAR.forEach((k, i) => { ws.getColumn(i + 1).width = k.gen })

  // satır 1 — başlık
  ws.mergeCells(1, 1, 1, N)
  const t = ws.getCell(1, 1)
  t.value = 'Atanan Dosyalar — Hugo Tevdiye Listesi'
  t.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } }
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } }
  ws.getRow(1).height = 28

  // satır 2 — meta (tarih · filtre özeti · toplam)
  const filtreOzet = [
    asama === 'all' ? 'Tüm aşamalar' : ASAMA_META[asama].label,
    cekildi === 'evet' ? 'Çekilen' : cekildi === 'hayir' ? 'Bekleyen' : 'Tümü',
    q ? `arama: “${q}”` : null,
  ].filter(Boolean).join(' · ')
  ws.mergeCells(2, 1, 2, N)
  const m = ws.getCell(2, 1)
  m.value = `${new Date().toLocaleDateString('tr-TR')} · ${filtreOzet} · ${rows.length} dosya`
  m.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } }
  m.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  m.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
  ws.getRow(2).height = 18

  // satır 3 — sütun başlıkları
  const head = ws.getRow(3)
  KOLONLAR.forEach((k, i) => {
    const c = head.getCell(i + 1)
    c.value = k.baslik
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    c.alignment = { vertical: 'middle', horizontal: i >= 11 && i <= 13 ? 'right' : 'left', wrapText: true }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
    c.border = { bottom: { style: 'thin', color: { argb: HEADER_BG } } }
  })
  head.height = 22

  // veri satırları
  const PARA_FMT = '#,##0.00 ₺'
  rows.forEach((r) => {
    const bilgi = asamaBilgi(r.durum)
    const renk = asamaRenk(r.durum)
    const za = kalanGun(r.zamanasimi)
    const row = ws.addRow([
      r.hukukDosyaNo ?? '',
      r.hasarDosyaNo ?? '',
      bilgi.label,
      r.sigortaliUnvan ?? '',
      r.gonderenBirim ?? '',
      r.borclular.map((b) => b.adUnvan).join('; '),
      r.borclular.length,
      r.kadroluAvukat ?? '',
      r.sozlesmeliAvukat ?? '',
      r.atanmaTarihi ?? null,
      r.zamanasimi ?? null,
      za,
      r.davaMiktari != null ? Number(r.davaMiktari) : null,
      r.rucuTutari != null ? Number(r.rucuTutari) : null,
      r.hugoDurum ?? '',
      r.hugodanCekildi ? 'Evet' : 'Hayır',
    ])
    row.height = 19

    // tüm hücreler: yumuşak aşama zemini + ince kenarlık + taban font
    for (let i = 1; i <= N; i++) {
      const c = row.getCell(i)
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: renk.fill } }
      c.border = {
        bottom: { style: 'thin', color: { argb: BORDER } },
        right: { style: 'thin', color: { argb: BORDER } },
      }
      if (!c.font) c.font = { name: 'Calibri', size: 10, color: { argb: INK } }
      c.alignment = { vertical: 'middle', ...(c.alignment ?? {}) }
    }

    row.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: INK } } // Hukuk No
    row.getCell(3).font = { name: 'Calibri', size: 10, bold: true, color: { argb: renk.ink } } // Aşama
    row.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' }
    row.getCell(10).numFmt = 'dd.mm.yyyy'
    row.getCell(11).numFmt = 'dd.mm.yyyy'
    row.getCell(12).alignment = { vertical: 'middle', horizontal: 'center' }
    row.getCell(13).numFmt = PARA_FMT
    row.getCell(14).numFmt = PARA_FMT
    row.getCell(13).font = { name: 'Calibri', size: 10, bold: true, color: { argb: INK } }
    row.getCell(16).alignment = { vertical: 'middle', horizontal: 'center' }
  })

  const sonSatir = ws.rowCount
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: N } }

  // ── koşullu biçimlendirme — "Kalan Gün" (zaman aşımı riski) ───────────────
  if (sonSatir >= 4) {
    const ref = `L4:L${sonSatir}`
    ws.addConditionalFormatting({
      ref,
      rules: [
        { // geçmiş — kırmızı, kalın
          type: 'cellIs', operator: 'lessThan', priority: 1, formulae: ['0'],
          style: { font: { bold: true, color: { argb: 'FFB91C1C' } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEE2E2' } } },
        },
        { // 0–30 gün — kritik
          type: 'cellIs', operator: 'between', priority: 2, formulae: ['0', '30'],
          style: { font: { bold: true, color: { argb: 'FFB91C1C' } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFECACA' } } },
        },
        { // 31–90 gün — uyarı
          type: 'cellIs', operator: 'between', priority: 3, formulae: ['31', '90'],
          style: { font: { color: { argb: 'FF92600A' } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEF3C7' } } },
        },
      ],
    })
  }

  // ── 2. sayfa: aşama renk açıklaması ───────────────────────────────────────
  const leg = wb.addWorksheet('Aşama Renkleri')
  leg.getColumn(1).width = 22
  leg.getColumn(2).width = 10
  leg.getColumn(3).width = 48
  const lh = leg.addRow(['Aşama', 'Sıra', 'Açıklama'])
  lh.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  lh.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } } })
  ;(Object.keys(ASAMA) as (keyof typeof ASAMA)[])
    .sort((a, b) => ASAMA[a].sira - ASAMA[b].sira)
    .forEach((kod) => {
      const info = ASAMA[kod]
      const renk = TON_RENK[info.tone]
      const r = leg.addRow([info.label, info.sira, `DosyaDurum: ${kod}`])
      r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: renk.fill } } })
      r.getCell(1).font = { bold: true, color: { argb: renk.ink } }
    })

  const buf = await wb.xlsx.writeBuffer()
  const bugun = new Date().toISOString().slice(0, 10)
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Atanan-Dosyalar-${bugun}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
