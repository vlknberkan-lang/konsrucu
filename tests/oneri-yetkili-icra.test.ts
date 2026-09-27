/**
 * S19 · yetkili icra önerisi: iki seçenek (kaza yeri, borçlunun yerleşim yeri) gerekçesiyle; dayanaklar "teyit
 * gerekli"; seçim avukatta. Adresler kurgusaldır; ilçe/il Adli Rehber tablosunda gerçek yer adlarıdır.
 */
import { describe, expect, it } from 'vitest'
import { adresYerlesimYeri, yetkiliIcraSecenekleri } from '@/lib/konsrucu/oneri/yetkili-icra'

describe('adresYerlesimYeri', () => {
  it('"… Kadıköy/İSTANBUL" → İstanbul Anadolu adliyesi', () => {
    const r = adresYerlesimYeri('Kurgu Mah. Örnek Sok. No:1 D:2 Kadıköy/İSTANBUL')
    expect(r?.ilce).toBe('Kadıköy')
    expect(r?.kayit.icraDairesi).toBe('İstanbul Anadolu İcra Dairesi')
  })

  it('eğik çizgisiz adres: son iki kelime ilçe + il', () => {
    expect(adresYerlesimYeri('Kurgu Cad. No:5 Karaisalı Adana')?.kayit.icraDairesi).toBe('Karaisalı İcra Dairesi')
  })

  it('Adli Rehber\'de olmayan ilçe tahmin edilmez', () => {
    expect(adresYerlesimYeri('Kurgu Mah. No:3 Uydurmaköy/Adana')).toBeNull()
    expect(adresYerlesimYeri('')).toBeNull()
  })
})

describe('yetkiliIcraSecenekleri', () => {
  it('iki seçenek: kaza yeri ve borçlunun yerleşim yeri; gerekçe ve "teyit gerekli" dayanak', () => {
    const { secenekler, uyarilar } = yetkiliIcraSecenekleri({
      kazaYeri: 'Seyhan/Adana', il: 'Adana',
      borclular: [{ id: 'b1', adUnvan: 'Kurgusal Borçlu', adres: 'Kurgu Mah. No:1 Kadıköy/İstanbul' }],
    })
    expect(uyarilar).toEqual([])
    expect(secenekler.map((s) => [s.secenek, s.icraDairesi])).toEqual([
      ['KAZA_YERI', 'Adana İcra Dairesi'],
      ['YERLESIM_YERI', 'İstanbul Anadolu İcra Dairesi'],
    ])
    expect(secenekler[0].gerekce).toContain('Seyhan')
    expect(secenekler[0].dayanak).toMatch(/HMK m\.16.*teyit gerekli/)
    expect(secenekler[1].dayanak).toMatch(/HMK m\.6.*teyit gerekli/)
    expect(secenekler[1].borcluId).toBe('b1')
    expect(secenekler[1].anahtar).toBe('YERLESIM_YERI:b1')
  })

  it('iptal edilen KTK m.110/2 ("merkez") hiçbir gerekçede yok; adres ekrana yazılmaz', () => {
    const { secenekler } = yetkiliIcraSecenekleri({ kazaYeri: 'Seyhan', il: 'Adana', borclular: [{ id: 'b1', adres: 'Kurgu Mah. Gizli Sok. No:9 Kadıköy/İstanbul' }] })
    for (const s of secenekler) {
      expect(`${s.gerekce} ${s.dayanak}`).not.toMatch(/110\/2|merkez/i)
      expect(s.gerekce).not.toContain('Gizli Sok')
    }
  })

  it('aynı daireye çıkan seçenekler birleşir', () => {
    const { secenekler } = yetkiliIcraSecenekleri({ kazaYeri: 'Karaisalı', il: 'Adana', borclular: [{ id: 'b1', adres: 'Kurgu Cad. Karaisalı/Adana' }] })
    expect(secenekler).toHaveLength(1)
    expect(secenekler[0].gerekce).toMatch(/Aynı daire: yerleşim yeri/)
  })

  it('birden çok borçlu: her biri ayrı seçenek ve HMK m.7 notu', () => {
    const { secenekler } = yetkiliIcraSecenekleri({
      kazaYeri: null, il: null,
      borclular: [{ id: 'b1', adres: 'X Mah. Kadıköy/İstanbul' }, { id: 'b2', adres: 'Y Mah. Karaisalı/Adana' }],
    })
    expect(secenekler.map((s) => s.icraDairesi)).toEqual(['İstanbul Anadolu İcra Dairesi', 'Karaisalı İcra Dairesi'])
    expect(secenekler[0].dayanak).toMatch(/HMK m\.7/)
  })

  it('çözülemeyen kaza yeri ve adresi olmayan borçlu uyarı olur (seçenek uydurulmaz)', () => {
    const { secenekler, uyarilar } = yetkiliIcraSecenekleri({ kazaYeri: 'Uydurmaköy', il: null, borclular: [{ id: 'b1', adUnvan: 'Kurgusal Borçlu', adres: null }] })
    expect(secenekler).toEqual([])
    expect(uyarilar).toEqual([
      'Kaza yeri "Uydurmaköy" Adli Rehber\'de bulunamadı; daireyi elle girin.',
      'Kurgusal Borçlu: adres yok, yerleşim yeri seçeneği çıkarılamadı.',
    ])
  })

  it('kaza yeri yok ama il var: il merkezinden türetilir ve uyarılır', () => {
    const { secenekler, uyarilar } = yetkiliIcraSecenekleri({ kazaYeri: null, il: 'Karaisalı', borclular: [] })
    expect(secenekler[0].gerekce).toMatch(/Kaza yeri yok/)
    expect(uyarilar[0]).toMatch(/Kaza yeri girilmemiş/)
  })
})
