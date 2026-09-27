/**
 * lib/ai/sizinti.ts — kontrol.py'nin metin düzeyindeki karşılığı (araclar/evrak-metin/tests/test_kontrol_geri_ac.py).
 * YALNIZ SENTETİK veri. Hata ve bulgularda ham değer yazılmaz (yıldızlı biçim).
 */
import { describe, it, expect } from 'vitest'
import { Maskeleyici } from '@/lib/ai/maske'
import { geriAc } from '@/lib/ai/geri-ac'
import { SizintiHata, sizintiKapisi, sizintiKontrol, yildizla } from '@/lib/ai/sizinti'
import { LISTE_KISILER, tcknUret, tohumlu } from './maske-yardimci'

const R = tohumlu(777)
const [T1, T2, T3] = [tcknUret(R), tcknUret(R), tcknUret(R)]

describe('sizintiKontrol', () => {
  it('temiz maskeli metin: sızıntı yok, algoritmaya uyan poliçe no BİLGİ', () => {
    const m = Maskeleyici.eslesmedenKur({ '[TCKN-1]': T1 })
    const s = sizintiKontrol(`Davalı [KİŞİ-1] [TCKN-1]\nPoliçe No: ${T3}\n`, m)
    expect(s.temiz).toBe(true)
    expect(s.bilgiler).toHaveLength(1)
    expect(JSON.stringify(s)).not.toContain(T3)
  })

  it('sızıntı satırıyla yakalanır ve yıldızlanır', () => {
    const metin = 'satır bir\n' +
      `sızan TCKN ${T1.slice(0, 3)} ${T1.slice(3, 6)} ${T1.slice(6, 9)} ${T1.slice(9)}\n` +
      'tel 0532 111 22 33 ve plaka 06 XYZ 77 ve TR330006100519786457841326\n' +
      'İlkay Işıkgöz geldi, e-posta a.b@ornek.com\n'
    const s = sizintiKontrol(metin, new Maskeleyici(LISTE_KISILER))
    const turler = new Set(s.sizintilar.map((b) => `${b.tur}:${b.satir}`))
    for (const b of ['TCKN:2', 'TEL:3', 'PLAKA:3', 'IBAN:3', 'KİŞİ:4', 'EPOSTA:4']) expect(turler).toContain(b)
    const dokum = JSON.stringify(s).replace(/ /g, '')
    expect(dokum).toContain(T1.slice(0, 4) + '*'.repeat(7))
    for (const ham of [T1, '05321112233', 'Işıkgöz', 'a.b@ornek.com']) expect(dokum).not.toContain(ham)
  })

  it('bilinen değer korunan etiketle farklı yazılsa da sızıntıdır', () => {
    const m = Maskeleyici.eslesmedenKur({ '[TCKN-1]': T1 })
    expect(sizintiKontrol(`Poliçe No: ${T1}\n`, m).temiz).toBe(false)
  })

  it('maskeleyicinin çıktısı kendi kontrolünden temiz geçer', () => {
    const m = new Maskeleyici(LISTE_KISILER)
    const ham = `Davalı İlkay Işıkgöz (TCKN ${T2}) 34 ABC 123 plakalı araçla, tel 0532 123 45 67, IBAN TR33 0006 1005 1978 6457 8413 26`
    const { metin } = m.maskele(ham)
    expect(sizintiKontrol(metin, m).temiz).toBe(true)
  })
})

describe('yildizla', () => {
  it('değer tanınmaz', () => {
    expect(yildizla('TCKN', T1)).toBe(T1.slice(0, 4) + '*******')
    expect(yildizla('KİŞİ', 'Ferhunde Bıçakçıoğlu')).toBe('F******* B' + '*'.repeat('Bıçakçıoğlu'.length - 1))
    expect(yildizla('EPOSTA', 'ab.cd@ornek.com')).toBe('ab***@***')
  })
})

describe('sizintiKapisi', () => {
  it('bulgu varsa SizintiHata — mesajda ham değer yok, yalnız tür ve adet', () => {
    let hata: unknown
    try { sizintiKapisi([`Borçlu TCKN ${T1}`], new Maskeleyici()) } catch (e) { hata = e }
    expect(hata).toBeInstanceOf(SizintiHata)
    const mesaj = (hata as Error).message
    expect(mesaj).toContain('Sızıntı')
    expect(mesaj).toContain('1 TCKN')
    expect(mesaj).not.toContain(T1)
    expect(mesaj).not.toContain(T1.slice(0, 4))
  })
  it('temiz parçalar geçer', () => {
    expect(() => sizintiKapisi(['Davalı [KİŞİ-1] ([TCKN-1])', ''], new Maskeleyici())).not.toThrow()
  })
})

describe('geri açma (geri_ac.py)', () => {
  it('maskele → geri aç turu; bozuk yazım ve bilinmeyen jeton', () => {
    const m = new Maskeleyici(LISTE_KISILER)
    const { metin } = m.maskele(`Davalı İlkay Işıkgöz (TCKN ${T1}) 34 ABC 123 plakalı araçla`)
    const r = geriAc(metin + ' [KISI-1] [ KİŞİ - 1 ] [TEL-9]', m.eslesme)
    expect(r.sayi).toBe(5)
    expect(r.bilinmeyen).toEqual(['[TEL-9]'])
    expect(r.acik.startsWith(`Davalı İlkay Işıkgöz (TCKN ${T1}) 34 ABC 123 plakalı araçla`)).toBe(true)
    expect(r.acik).toContain('İlkay Işıkgöz İlkay Işıkgöz [TEL-9]')
  })
})
