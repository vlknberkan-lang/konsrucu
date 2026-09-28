/**
 * Zurich "Hukuki Takip" Eylül 2026 biçimi: "Hukuk Dosya No" sütunu yok (anahtar = Hasar Dosya No),
 * "Hasar İl", "Sigortalı", "Alınan Rücu", "Atanan Vekil", "Idari Takip No" başlıkları; tarih ve tutar ham sayı.
 */
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { hugoCozumle } from '@/lib/import/hugo'

function excel(satirlar: unknown[][]): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(satirlar)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Tabelle1')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}

const BASLIK = ['Hasar Dosya No', 'Idari Takip No', 'Rücu No', 'Hasar Brans', 'Hasar Tarihi', 'Zaman Asimi Tarihi', 'Tazminat Odeme Tarihi', 'Hasar Tutari', 'Rucu Orani', 'Alınan Rücu', ' Bakiye Rücu Tutarı ', 'Rucu Nedeni', 'Rucu Nedeni_Detay', 'Sigortalı', 'Police No', 'Hasar İl', 'Atanan Vekil ', ' BİRİM ADI', ' ESAS NO', 'BİRİM AÇILIŞ TARİHİ']

describe('Zurich Eylül 2026 biçimi', () => {
  it('Hasar Dosya No anahtar olur; il, sigortalı, tahsil ve Zurich iç numarası okunur', () => {
    const r = hugoCozumle(excel([BASLIK, [1410473, 1006268, '-', 'TRAFİK', 46098, 46920, 46189, 1775000, 100, 0, 1775000, 'Diğer Nedenler', 'ALKOL ÖLÇÜM RET.', 'AŞKIN YILMAZ', 31365588, 'İSTANBUL', 'Av. X', '', '', '']]))
    expect(r.hatalar).toEqual([])
    const s = r.satirlar[0]
    expect(s.hukukDosyaNo).toBe('1410473')
    expect(s.hasarDosyaNo).toBe('1410473')
    expect(s.kaynak.kaynak).toBe('zurich')
    expect(s.il).toBe('İSTANBUL')
    expect(s.sigortaliUnvan).toBe('AŞKIN YILMAZ')
    expect(s.rucuTutari).toBe(1775000)
    expect(s.zamanasimi?.toISOString().slice(0, 10)).toBe('2028-06-16')
    expect(s.faizBaslangic?.toISOString().slice(0, 10)).toBe('2026-06-16')
    expect(s.kaynak.aciklama).toBe('ALKOL ÖLÇÜM RET.')
    expect(s.kaynak.ham.idariTakipNo).toBe('1006268')
  })
  it('Hukuk Dosya No sütunu varsa anahtar odur (Haziran biçimi bozulmaz)', () => {
    const r = hugoCozumle(excel([['Hukuk Dosya No', 'Hasar Dosya No', 'Hasar Brans', 'Sigortalı Adı', 'Bakiye Rucu Tutari'], [223915, 1230364, 'YANGIN', 'DAP', 87050]]))
    expect(r.satirlar[0].hukukDosyaNo).toBe('223915')
    expect(r.satirlar[0].hasarDosyaNo).toBe('1230364')
  })
})
