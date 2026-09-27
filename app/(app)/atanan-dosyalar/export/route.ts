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
 *
 * S30 · `?rapor=ray` → Ray takip raporu (30 sütun): Ray takip Excel'inin başlıklarıyla birebir (docs 04 §4.2),
 * her sütun programın kendi verisinden (lib/konsrucu/rapor-mail.ts · rayRaporTablo). Aynı süzgeçler geçerlidir.
 * Teyitsiz hücreler sarı ve notlu; ayrıca "Teyit notları", "Sütun kaynakları" ve "Rapor bilgisi" sayfaları.
 * Program raporu GÖNDERMEZ: avukat kontrol edip elle gönderir (B17). İndirme Aktivite'ye yazılır.
 */
import ExcelJS from 'exceljs'
import { Prisma, DosyaDurum } from '@prisma/client'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { ASAMA, asamaBilgi, asamaRenk, TON_RENK, ASAMA_DURUMLAR, ASAMA_META, ASAMA_SIRA, type AsamaKey } from '@/lib/konsrucu/asama'
import { tarihTR, kalanGun as kalanGunIst, bugunIstBasi } from '@/lib/konsrucu/format'
import { ZAMANASIMI_RADARI } from '@/lib/konsrucu/aktiflik'
import { RAY_30_SUTUNLAR, rayRaporTablo, rayRaporMailTaslagi } from '@/lib/konsrucu/rapor-mail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BORDER = 'FFE2E8F0'
const INK = 'FF1E293B'
const HEADER_BG = 'FF0F2A3F' // koyu çelik — başlık şeridi
const TITLE_BG = TON_RENK.kr.strong

const fmtTarih = (d: Date | null) => (d ? tarihTR(d) : '')
const kalanGun = (d: Date | null) => (d ? kalanGunIst(d) : null)

export async function GET(req: Request) {
  const { dbUser, aktifMusteriId } = await ctx()
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
  const zaParam = url.searchParams.get('za') ?? ''
  const za = ['bos', 'yakin', 'gecti'].includes(zaParam) ? (zaParam as 'bos' | 'yakin' | 'gecti') : 'all'

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
  // zamanaşımı radarı filtresi — sayfadaki listeyle birebir aynı küme ("görünen listeyi indir" sözü);
  // durum kümesi tek kaynaktan: takip öncesi + İDARİ_YOL (lib/konsrucu/aktiflik, S06).
  const RADAR: DosyaDurum[] = [...ZAMANASIMI_RADARI]
  const zaBugun = bugunIstBasi()
  const where: Prisma.RucuDosyasiWhereInput = {
    ...temelWhere,
    ...(asama !== 'all' ? { durum: { in: ASAMA_DURUMLAR[asama] as DosyaDurum[] } } : {}),
    ...(cekildi === 'evet' ? { hugodanCekildi: true } : cekildi === 'hayir' ? { hugodanCekildi: false } : {}),
    ...(za === 'bos'
      ? { zamanasimi: null, AND: [{ durum: { in: RADAR } }] }
      : za === 'yakin'
        ? { zamanasimi: { gte: zaBugun, lt: new Date(zaBugun.getTime() + 30 * 86_400_000) }, AND: [{ durum: { in: RADAR } }] }
        : za === 'gecti'
          ? { zamanasimi: { lt: zaBugun }, AND: [{ durum: { in: RADAR } }] }
          : {}),
  }
  const orderBy: Prisma.RucuDosyasiOrderByWithRelationInput[] =
    sort === 'zamanasimi'
      ? [{ zamanasimi: { sort: 'asc', nulls: 'last' } }]
      : sort === 'tutar'
        ? [{ davaMiktari: { sort: 'desc', nulls: 'last' } }]
        : sort === 'atanma'
          ? [{ atanmaTarihi: { sort: 'desc', nulls: 'last' } }]
          : [{ createdAt: 'desc' }]

  // filtre özeti (meta satırı ve Ray raporu bilgisi aynı metni kullanır)
  const filtreOzet = [
    asama === 'all' ? 'Tüm aşamalar' : ASAMA_META[asama].label,
    cekildi === 'evet' ? 'Çekilen' : cekildi === 'hayir' ? 'Bekleyen' : 'Tümü',
    za === 'bos' ? 'zamanaşımı boş' : za === 'yakin' ? 'zamanaşımı ≤30g' : za === 'gecti' ? 'zamanaşımı geçti' : null,
    q ? `arama: “${q}”` : null,
  ].filter(Boolean).join(' · ')

  if (url.searchParams.get('rapor') === 'ray') {
    return rayRaporuYanit({ where, orderBy, musteriId: aktifMusteriId, kullanici: { id: dbUser.id, ad: dbUser.ad, rol: dbUser.rol }, filtreOzet })
  }

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
  ws.mergeCells(2, 1, 2, N)
  const m = ws.getCell(2, 1)
  m.value = `${tarihTR(new Date())} · ${filtreOzet} · ${rows.length} dosya`
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
  const bugun = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10) // dosya adı: Türkiye günü (UTC+3)
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Atanan-Dosyalar-${bugun}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// S30 · Ray takip raporu (30 sütun) — dışa aktarılmayan yardımcılar (route dosyası yalnız GET dışa aktarır)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const TEYITSIZ_ZEMIN = TON_RENK.warning.fill // "onay bekliyor" rolü (amber) — teyitsiz hücre
const ROL_ETIKET: Record<string, string> = { ADMIN: 'Yönetici', AVUKAT: 'Avukat', AVUKAT_YRD: 'Avukat yardımcısı', GORUNTULEYEN: 'Görüntüleyen' }
const RAY_DAVA_ISLEMLERI = ['DEKONT_SUNUMU', 'DELIL_DILEKCESI', 'MUZEKKERE', 'MUZEKKERE_CEVABI']

async function rayRaporuYanit(p: {
  where: Prisma.RucuDosyasiWhereInput
  orderBy: Prisma.RucuDosyasiOrderByWithRelationInput[]
  musteriId: string
  kullanici: { id: string; ad: string; rol: string }
  filtreOzet: string
}): Promise<Response> {
  const simdi = new Date()
  const bugunBas = bugunIstBasi(simdi)

  const [musteri, dosyalar] = await Promise.all([
    prisma.musteri.findUnique({ where: { id: p.musteriId }, select: { ad: true } }),
    prisma.rucuDosyasi.findMany({
      where: p.where,
      orderBy: p.orderBy,
      take: 10_000,
      select: {
        hukukDosyaNo: true, hasarDosyaNo: true, hasarTarihi: true, zamanasimi: true, rucuSebebi: true, rucuSebebiKod: true,
        rucuOrani: true, rucuTutari: true, davaMiktari: true, kadroluAvukat: true, sozlesmeliAvukat: true, kaynakJson: true,
        islemYapanYrd: true, icraDairesi: true, icraDosyaNo: true, takipTarihi: true,
        durum: true, icraEksen: true, arabEksen: true, davaEksen: true, eksenJson: true, kapanisSebebi: true,
        borclular: { select: { id: true, adUnvan: true }, orderBy: { id: 'asc' } },
        takipTalepleri: {
          where: { silindiAt: null, gecerli: true },
          orderBy: { surum: 'desc' },
          take: 1,
          select: { toplam: true, gecerli: true, surum: true, onaylayanId: true, dondurulduAt: true, silindiAt: true },
        },
        asamalar: {
          where: { tur: 'DAVA' },
          orderBy: [{ sira: 'desc' }, { createdAt: 'desc' }],
          take: 1,
          select: { tur: true, birim: true, kimlikNo: true, baslangic: true, sonuc: true, durum: true },
        },
        etkinlikler: {
          where: { tur: 'DURUSMA', durum: { not: 'IPTAL' }, baslar: { gte: bugunBas } },
          orderBy: { baslar: 'asc' },
          take: 10,
          select: { tur: true, baslar: true, durum: true, kaynak: true, teyit: true },
        },
        ihtiyatiHacizler: {
          where: { silindiAt: null },
          select: { talepTarihi: true, sonuc: true, kararTarihi: true, teminatOrani: true, teminatTutari: true, excelHam: true, teyit: true, silindiAt: true },
        },
        davalar: {
          where: { silindiAt: null },
          select: {
            rolumuz: true, derece: true, mahkemeTuru: true, mahkemeYer: true, mahkemeNo: true, esasYil: true, esasSira: true,
            ustDosyaNoHam: true, acilisTarihi: true, sonrakiDurusma: true, onIncelemeTarihi: true, evre: true, durum: true,
            hukum: true, kararTarihi: true, kararOnayAt: true, kesinlesmeTarihi: true, silindiAt: true, createdAt: true,
            asama: { select: { detayJson: true } },
            taraflar: { where: { silindiAt: null }, select: { rol: true, borcluId: true, adHam: true, teyit: true, silindiAt: true } },
            islemler: {
              where: { silindiAt: null, tur: { in: RAY_DAVA_ISLEMLERI } },
              select: { tur: true, tarih: true, referansNo: true, excelHam: true, teyit: true, silindiAt: true },
            },
          },
        },
      },
    }),
  ])

  const tablo = rayRaporTablo(
    dosyalar.map((d) => ({ ...d, davalar: d.davalar.map(({ asama, ...v }) => ({ ...v, asamaDetayJson: asama?.detayJson ?? null })) })),
    simdi,
  )
  const avukat = p.kullanici.rol === 'AVUKAT' || p.kullanici.rol === 'ADMIN'
  const taslak = rayRaporMailTaslagi({
    musteriAd: musteri?.ad ?? null,
    hazirlayanAd: p.kullanici.ad,
    bugun: simdi,
    dosyaSayisi: tablo.ozet.dosya,
    davaSayisi: tablo.ozet.davaAsamasinda,
    teyitsizSatir: tablo.ozet.teyitsizSatir,
  })

  // ── 1. sayfa: Ray takip Excel'inin düzeni — 1. satır 30 başlık, veriler 2. satırdan ──
  const wb = new ExcelJS.Workbook()
  wb.creator = 'KonsRücu'
  wb.created = simdi
  const ws = wb.addWorksheet('Ray Takip', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  RAY_30_SUTUNLAR.forEach((s, i) => { ws.getColumn(i + 1).width = s.genislik })
  const head = ws.getRow(1)
  tablo.basliklar.forEach((b, i) => {
    const c = head.getCell(i + 1)
    c.value = b
    c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
  })
  head.height = 30

  for (const satir of tablo.satirlar) {
    const row = ws.addRow(satir.hucreler.map((h) => h.deger))
    row.height = 18
    satir.hucreler.forEach((h, i) => {
      const c = row.getCell(i + 1)
      const tur = RAY_30_SUTUNLAR[i].tur
      c.font = { name: 'Calibri', size: 10, color: { argb: INK } }
      c.alignment = { vertical: 'middle', horizontal: tur === 'para' ? 'right' : 'left', wrapText: tur === 'metin' }
      c.border = { bottom: { style: 'thin', color: { argb: BORDER } }, right: { style: 'thin', color: { argb: BORDER } } }
      if (tur === 'tarih' && h.deger instanceof Date) c.numFmt = 'dd.mm.yyyy'
      if (tur === 'para' && typeof h.deger === 'number') c.numFmt = '#,##0.00'
      if (h.teyitsiz) {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEYITSIZ_ZEMIN } }
        c.note = `TEYİTSİZ: ${h.teyitsiz}`
      }
    })
    const ilk = row.getCell(1)
    ilk.font = { name: 'Calibri', size: 10, bold: true, color: { argb: satir.teyitsiz ? TON_RENK.warning.ink : INK } }
    if (satir.teyitsiz && !satir.hucreler[0].teyitsiz) {
      ilk.note = `Bu satırda teyitsiz bilgi var:\n${satir.teyitNotlari.join('\n')}`
    }
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: RAY_30_SUTUNLAR.length } }

  // ── 2. sayfa: teyit notları (satır ve sütun bazında) ──
  const notlar = wb.addWorksheet('Teyit Notları')
  notlar.columns = [
    { header: 'HUKUK DOSYA NO', width: 18 },
    { header: 'Sütun', width: 30 },
    { header: 'Neden teyitsiz', width: 70 },
  ]
  notlar.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  notlar.getRow(1).eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } } })
  for (const satir of tablo.satirlar) {
    satir.hucreler.forEach((h, i) => {
      if (h.teyitsiz) notlar.addRow([String(satir.hucreler[0].deger ?? ''), `#${RAY_30_SUTUNLAR[i].no} ${RAY_30_SUTUNLAR[i].baslik}`, h.teyitsiz])
    })
  }
  if (notlar.rowCount === 1) notlar.addRow(['', '', 'Teyitsiz bilgi yok.'])

  // ── 3. sayfa: sütun → kaynak alan (her sütun bir alandan ya da türetilmiş eksenden) ──
  const kaynak = wb.addWorksheet('Sütun Kaynakları')
  kaynak.columns = [{ header: '#', width: 5 }, { header: 'Sütun', width: 30 }, { header: 'Programdaki kaynak', width: 80 }]
  kaynak.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  kaynak.getRow(1).eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } } })
  for (const s of RAY_30_SUTUNLAR) kaynak.addRow([s.no, s.baslik, s.kaynak])

  // ── 4. sayfa: rapor bilgisi ve e-posta taslağı (gönderim elle, avukat onayıyla) ──
  const bilgi = wb.addWorksheet('Rapor Bilgisi')
  bilgi.getColumn(1).width = 26
  bilgi.getColumn(2).width = 90
  const bilgiSatirlari: [string, string][] = [
    ['Müvekkil', musteri?.ad ?? '—'],
    ['Rapor tarihi', tarihTR(simdi)],
    ['Süzgeç', p.filtreOzet],
    ['Dosya', String(tablo.ozet.dosya)],
    ['Dava aşamasında', String(tablo.ozet.davaAsamasinda)],
    ['Teyitsiz bilgi olan satır', String(tablo.ozet.teyitsizSatir)],
    ['Hazırlayan', `${p.kullanici.ad} (${ROL_ETIKET[p.kullanici.rol] ?? p.kullanici.rol})`],
    ['Gönderim', avukat
      ? 'Program göndermez. Avukat kontrol eder ve kendi e-postasından elle gönderir.'
      : 'TASLAK: göndermeden önce avukatın kontrolü gerekir. Program göndermez.'],
    ['E-posta konusu (taslak)', taslak.konu],
    ['E-posta metni (taslak)', taslak.govde],
  ]
  for (const [k, v] of bilgiSatirlari) {
    const r = bilgi.addRow([k, v])
    r.getCell(1).font = { bold: true, color: { argb: INK } }
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' }
  }

  // Denetim izi: kim, hangi kümeyi indirdi (kişisel veri yok; yalnız sayılar ve süzgeç)
  try {
    await prisma.aktivite.create({
      data: {
        kullaniciId: p.kullanici.id,
        eylem: 'Ray raporu indirildi (30 sütun)',
        detayJson: { musteriId: p.musteriId, dosya: tablo.ozet.dosya, davaAsamasinda: tablo.ozet.davaAsamasinda, teyitsizSatir: tablo.ozet.teyitsizSatir, suzgec: p.filtreOzet },
      },
    })
  } catch {
    // iz yazılamadı diye rapor engellenmez
  }

  const buf = await wb.xlsx.writeBuffer()
  const gun = new Date(simdi.getTime() + 3 * 3_600_000).toISOString().slice(0, 10)
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Ray-Raporu-30-Sutun-${gun}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
