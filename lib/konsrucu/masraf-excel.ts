/**
 * KonsRücü — Masraf · Excel dışa aktarım (server-only)
 * RAY SİGORTA RÜCU MASRAF FORMU şablonuna birebir doldurma.
 *
 * Şablon (base64) yüklenir → "Sayfa1" başlık satırı (R1) korunur, örnek satırlar (R2..R8) silinir,
 * filtrelenmiş masraflar R2'den itibaren yazılır. "Sayfa2" (A1:A63 = 63 sabit cins) korunur ve
 * H sütununa onu kaynak alan liste tipi veri doğrulaması eklenir → yalnız 63 kalemden biri seçilebilir.
 *
 * Sütun haritası (RAY formu): A=sıra · B=DEKONT NO · C=HUKUK KODU · D=HASAR DOSYA · E=MAHKEME ·
 * F=ESAS · G=BRÜT ÜCRET/MASRAF · H=MASRAF CİNSİ/ADI · I=MASRAF TARİHİ · J=BELGELİ/BELGESİZ ·
 * K=SORUMLU · L=Başvurma Harcı · M=Peşin Harç · N=Vekalet Harcı (L–N boş bırakılır).
 */
import ExcelJS from 'exceljs'
import { RAY_MASRAF_FORMU_B64 } from './sablon/ray-masraf-formu.b64'
import type { MasrafUi } from './masraf'
import { MASRAF_CINSLERI, MASRAF_TARAF } from './masraf'

/** 63 kalem dışındaki ham/öğrenilmemiş cinsleri eler (doğrulamayı bozmamak için). */
const CINS_SETI = new Set(MASRAF_CINSLERI)

export async function masrafExcelBuffer(satirlar: MasrafUi[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(RAY_MASRAF_FORMU_B64, 'base64') as never) // @types/node generic Buffer ↔ ExcelJS Buffer uyuşmazlığı

  const ws = wb.getWorksheet('Sayfa1') ?? wb.worksheets[0]

  // Örnek satırları temizle: başlık R1 kalsın, R2'den sonu sil.
  if (ws.rowCount > 1) ws.spliceRows(2, ws.rowCount - 1)

  satirlar.forEach((m, i) => {
    const r = i + 2 // R2'den itibaren

    // H — yalnız 63 kalemden biri ya da boş (öğrenilmiş eşleşme listede değilse boşalt).
    const cins = m.cins && CINS_SETI.has(m.cins) ? m.cins : ''
    // K — sorumlu yoksa tarafın okunur etiketi.
    const sorumlu = m.sorumlu ?? MASRAF_TARAF[m.taraf].label

    ws.getCell(r, 1).value = i + 1 // A sıra
    ws.getCell(r, 2).value = m.dekontNo ?? '' // B DEKONT NO
    ws.getCell(r, 3).value = m.hukukKodu ?? '' // C HUKUK KODU
    ws.getCell(r, 4).value = m.hasarDosya ?? '' // D HASAR DOSYA
    ws.getCell(r, 5).value = m.mahkeme ?? '' // E MAHKEME
    ws.getCell(r, 6).value = m.esas ?? '' // F ESAS

    const g = ws.getCell(r, 7) // G BRÜT ÜCRET/MASRAF (sayısal)
    g.value = m.tutar
    g.numFmt = '#,##0.00'

    const hCell = ws.getCell(r, 8) // H MASRAF CİNSİ/ADI (yalnız 63 kalem)
    hCell.value = cins
    if (!cins && m.cinsHam) hCell.note = `Ham: ${m.cinsHam}` // listede yoksa ham adı kaybolmasın

    const iCell = ws.getCell(r, 9) // I MASRAF TARİHİ
    if (m.tarih) {
      iCell.value = new Date(m.tarih)
      iCell.numFmt = 'dd.mm.yyyy'
    } else {
      iCell.value = ''
    }

    ws.getCell(r, 10).value = m.belgeli ? 'Belgeli' : 'Belgesiz' // J BELGELİ/BELGESİZ
    ws.getCell(r, 11).value = sorumlu // K SORUMLU
    // L, M, N — Başvurma / Peşin / Vekalet Harcı: boş bırak.
  })

  // H sütunu veri doğrulaması — yazılan satırlar + tampon (boş export'ta da H kilitli kalsın).
  const dv = {
    type: 'list' as const,
    allowBlank: true,
    formulae: ['Sayfa2!$A$1:$A$63'],
    showErrorMessage: true,
    errorStyle: 'stop' as const,
    errorTitle: 'Geçersiz cins',
    error: 'Yalnız Sayfa2 listesinden seçin: 63 kalem.',
  }
  const sonSatir = Math.max(satirlar.length + 1, 100)
  for (let r = 2; r <= sonSatir; r++) ws.getCell(r, 8).dataValidation = dv

  return Buffer.from(await wb.xlsx.writeBuffer())
}
