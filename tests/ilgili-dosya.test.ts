import { describe, expect, it } from 'vitest'
import { daireEsit, davaBagOnerisi, davaTuruCoz, ilgiliDosyaCoz, rolumuzCoz, uyapTarih } from '@/lib/konsrucu/senkron/ilgili-dosya'

// Kurgusal değerler (05'teki biçim); gerçek dosya numarası yok.
const HAM = 'Kurgu 5. Genel İcra Dairesi 2026/111, Kurgu Arabuluculuk Daire Başkanlığı 2026/222'

describe('ilgiliDosyaCoz', () => {
  it('icra ve arabuluculuk parçalarını ayırır', () => {
    const p = ilgiliDosyaCoz(HAM)
    expect(p).toHaveLength(2)
    expect(p[0]).toMatchObject({ tur: 'ICRA', esas: { yil: 2026, sira: 111 } })
    expect(p[0].birim).toBe('Kurgu 5. Genel İcra Dairesi')
    expect(p[1]).toMatchObject({ tur: 'ARABULUCULUK', esas: { yil: 2026, sira: 222 } })
  })
  it('boş ve esassız metin', () => {
    expect(ilgiliDosyaCoz(null)).toEqual([])
    expect(ilgiliDosyaCoz('Kurgu İcra Dairesi')).toEqual([{ tur: 'ICRA', birim: 'Kurgu İcra Dairesi', esas: null, ham: 'Kurgu İcra Dairesi' }])
  })
  it('icra hukuk mahkemesi icra dairesi sayılmaz', () => {
    expect(ilgiliDosyaCoz('Kurgu 2. İcra Hukuk Mahkemesi 2025/9')[0].tur).toBe('HUKUK')
  })
})

describe('daireEsit', () => {
  it('genel eki, büyük harf ve noktalama farkını tolere eder', () => {
    expect(daireEsit('Kurgu 5. Genel İcra Dairesi', 'KURGU 5. İCRA DAİRESİ')).toBe(true)
    expect(daireEsit('Kurgu 5. Genel İcra Dairesi', 'Kurgu 15. İcra Dairesi')).toBe(false)
    expect(daireEsit('Kurgu İcra Dairesi', 'Başka İcra Dairesi')).toBe(false)
    expect(daireEsit('Kurgu Anadolu 11. İcra Dairesi', 'Kurgu 11. İcra Dairesi')).toBe(false)
    expect(daireEsit('Kurgu Anadolu 11. İcra Dairesi', 'KURGU ANADOLU 11. GENEL İCRA DAİRESİ')).toBe(true)
    expect(daireEsit('Kurgu İcra Dairesi', 'KURGU İCRA DAİRESİ')).toBe(true)
  })
})

describe('davaBagOnerisi', () => {
  const ilgili = ilgiliDosyaCoz(HAM)
  it('daire + esas tek eşleşme → TEK, arabuluculuk no taşınır', () => {
    const o = davaBagOnerisi(ilgili, [
      { id: 'a', icraDosyaNo: '2026/111', icraDairesi: 'Kurgu 5. İcra Dairesi', yetkiliIcra: null },
      { id: 'b', icraDosyaNo: '2026/111', icraDairesi: 'Kurgu 7. İcra Dairesi', yetkiliIcra: null },
      { id: 'c', icraDosyaNo: '2026/1110', icraDairesi: 'Kurgu 5. İcra Dairesi', yetkiliIcra: null },
    ])
    expect(o).toMatchObject({ durum: 'TEK', dosyaIdler: ['a'], zayif: false })
    expect(o.arabuluculuk?.esas).toEqual({ yil: 2026, sira: 222 })
  })
  it('daire programda boşsa zayıf eşleşme', () => {
    const o = davaBagOnerisi(ilgili, [{ id: 'a', icraDosyaNo: '2026/111', icraDairesi: null, yetkiliIcra: null }])
    expect(o).toMatchObject({ durum: 'TEK', zayif: true })
  })
  it('eşleşme yoksa YOK', () => {
    expect(davaBagOnerisi(ilgili, []).durum).toBe('YOK')
  })
})

describe('rolumuzCoz / davaTuruCoz / uyapTarih', () => {
  it('müvekkil davacı ya da davalı', () => {
    const t = [{ ad: 'KURGU SİGORTA A.Ş.', rol: 'Davacı' }, { ad: 'X Y', rol: 'Davalı' }]
    expect(rolumuzCoz(t, 'Kurgu Sigorta Anonim Şirketi')).toBe('DAVACI')
    expect(rolumuzCoz([{ ad: 'KURGU SİGORTA A.Ş.', rol: 'DAVALI' }], 'Kurgu Sigorta A.Ş.')).toBe('DAVALI')
    expect(rolumuzCoz(t, null)).toBeNull()
  })
  it('dava türü', () => {
    expect(davaTuruCoz('İtirazın İptali (Haksız Eylemden Kaynaklanan Zarar Nedeniyle)')).toBe('ITIRAZIN_IPTALI')
    expect(davaTuruCoz('Menfi Tespit')).toBe('MENFI_TESPIT')
    expect(davaTuruCoz('')).toBeNull()
  })
  it('UYAP tarih biçimleri', () => {
    expect(uyapTarih('22.10.2026')?.toISOString().slice(0, 10)).toBe('2026-10-22')
    expect(uyapTarih('22/10/2026 10:30')?.toISOString()).toBe('2026-10-22T07:30:00.000Z')
    expect(uyapTarih('45.10.2026')).toBeNull()
    expect(uyapTarih('14/10/2026 10:50')?.toISOString()).toBe('2026-10-14T07:50:00.000Z')
    expect(uyapTarih(null)).toBeNull()
  })
})
