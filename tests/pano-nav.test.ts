/**
 * S30/S25 · Menü — lib/konsrucu/nav.tsx
 * Yeni sayfalar menüde (Davalar, Süreler, Veri Onarımı); Veri Onarımı yalnız avukat ve yöneticiye görünür
 * (06 §6.3: "yalnız avukat ve admin"); başlık ve etkin öğe en uzun eşleşen adresten.
 */
import { describe, it, expect } from 'vitest'
import { RAIL_NAV, navGorunur, aktifNav, rolKodu, dosyaHref } from '@/lib/konsrucu/nav'

const bul = (id: string) => RAIL_NAV.find((n) => n.id === id)!

describe('menüdeki yeni sayfalar', () => {
  it('Davalar, Süreler ve Veri Onarımı doğru adreslerle', () => {
    expect(bul('davalar')).toMatchObject({ label: 'Davalar', href: '/davalar', ready: true })
    expect(bul('sureler')).toMatchObject({ label: 'Süreler', href: '/sureler', ready: true })
    expect(bul('veri-onarim')).toMatchObject({ label: 'Veri Onarımı', href: '/yonetim/veri-onarim', ready: true })
  })
  it('kimlik ve adresler tekil; Bugün ve Pano duruyor', () => {
    expect(new Set(RAIL_NAV.map((n) => n.id)).size).toBe(RAIL_NAV.length)
    expect(new Set(RAIL_NAV.map((n) => n.href)).size).toBe(RAIL_NAV.length)
    expect(bul('bugun').href).toBe('/bugun')
    expect(bul('panel')).toMatchObject({ label: 'Pano', href: '/panel' })
  })
})

describe('rol görünürlüğü', () => {
  const vo = bul('veri-onarim')
  it('Veri Onarımı avukat ve yöneticiye (kod ya da kabuktaki etiket)', () => {
    for (const r of ['AVUKAT', 'ADMIN', 'Avukat', 'Yönetici']) expect(navGorunur(vo, r), r).toBe(true)
  })
  it('yardımcı, görüntüleyen ve tanınmayan rol görmez', () => {
    for (const r of ['AVUKAT_YRD', 'Avukat Yrd.', 'Görüntüleyen', 'Stajyer']) expect(navGorunur(vo, r), r).toBe(false)
  })
  it('rol bilgisi gelmezse gizlenmez (yetkiyi sayfa verir); kısıtsız öğe herkese görünür', () => {
    expect(navGorunur(vo, undefined)).toBe(true)
    expect(navGorunur(bul('davalar'), 'Görüntüleyen')).toBe(true)
    expect(rolKodu(' Avukat ')).toBe('AVUKAT')
    expect(rolKodu(null)).toBeNull()
  })
})

describe('etkin menü öğesi ve dosya bağlantısı', () => {
  it('en uzun eşleşen adres kazanır; önek benzerliği eşleşme sayılmaz', () => {
    expect(aktifNav('/yonetim/veri-onarim')?.id).toBe('veri-onarim')
    expect(aktifNav('/yonetim/veri-onarim/parti/R2')?.id).toBe('veri-onarim')
    expect(aktifNav('/yonetim')).toBeNull()
    expect(aktifNav('/davalar')?.id).toBe('davalar')
    expect(aktifNav('/atanan-dosyalar/export')?.id).toBe('atanan')
    expect(aktifNav('/panelx')).toBeNull()
  })
  it('dosya ekranı adresi tek yerden', () => {
    expect(dosyaHref('abc')).toBe('/akilli-giris/abc')
  })
})
