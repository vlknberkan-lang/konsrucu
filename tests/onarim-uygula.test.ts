import { describe, expect, it } from 'vitest'
import { satirGeriAl, satirlariIsle, satirUygula, BOS, type Adaptorler, type IzYazici, type OnarimSatiri } from '@/lib/konsrucu/onarim/uygula'
import { sureEkleVerisi } from '@/lib/konsrucu/onarim/hedefler'

/** Bellekte sahte hedefler ve iz — veritabanına gidilmez. */
function ortam(dosyalar: Record<string, Record<string, unknown>>) {
  const satirlar = new Map<string, OnarimSatiri>()
  const gecisler: Record<string, unknown>[] = []
  const aktiviteler: Record<string, unknown>[] = []
  const sahteTablo: { id: string; anahtar: string; silindiAt: Date | null }[] = []
  const adaptorler: Adaptorler = {
    RucuDosyasi: {
      async guncelle(s, beklenen, yeni) {
        const d = dosyalar[s.dosyaId]
        if (!d || (d[s.alan] ?? null) !== beklenen) return 0
        d[s.alan] = yeni
        return 1
      },
    },
    SahteTablo: {
      async ekle(s) {
        const anahtar = `${s.dosyaId}|${(s.yeniJson as { anahtar: string }).anahtar}`
        if (sahteTablo.some((x) => x.anahtar === anahtar && !x.silindiAt)) return null
        const id = `sahte-${sahteTablo.length + 1}`
        sahteTablo.push({ id, anahtar, silindiAt: null })
        return id
      },
      async ekleGeriAl(s, b) {
        const x = sahteTablo.find((y) => y.id === s.hedefId && !y.silindiAt)
        if (!x) return 0
        x.silindiAt = b.simdi
        return 1
      },
    },
  }
  const iz: IzYazici = {
    async satirDurumu(id, beklenen, veri) {
      const s = satirlar.get(id)
      if (!s || s.durum !== beklenen) return 0
      satirlar.set(id, { ...s, durum: veri.durum, hedefId: veri.hedefId ?? s.hedefId, not: veri.not ?? s.not })
      return 1
    },
    async durumGecisi(d) { gecisler.push(d) },
    async aktivite(d) { aktiviteler.push(d) },
  }
  const ekle = (s: OnarimSatiri) => { satirlar.set(s.id, s); return s }
  const oku = (id: string) => satirlar.get(id)!
  return { adaptorler, iz, ekle, oku, gecisler, aktiviteler, sahteTablo }
}

const b = { kullaniciId: 'avukat-1', simdi: new Date('2026-10-01T07:00:00Z') }
const satir = (p: Partial<OnarimSatiri>): OnarimSatiri => ({
  id: 'v1', musteriId: 'tenant-1', dosyaId: 'd1', parti: 'R2-DURUM-01', kod: 'R2', islem: 'GUNCELLE', hedefTablo: 'RucuDosyasi', hedefId: null,
  alan: 'icraEksen', eskiJson: { deger: null }, yeniJson: { deger: 'DURDU_ITIRAZ' }, durum: 'ONAYLI', not: null, ...p,
})

describe('S13 · GUNCELLE uygula ve geri al', () => {
  it('eski değer tutuyorsa yazar; DurumGecisi (ONARIM) ve Aktivite izi düşer; satır UYGULANDI', async () => {
    const dosyalar = { d1: { icraEksen: null as string | null } }
    const o = ortam(dosyalar)
    const s = o.ekle(satir({}))
    expect(await satirUygula(s, o.adaptorler, o.iz, b)).toEqual({ sonuc: 'UYGULANDI' })
    expect(dosyalar.d1.icraEksen).toBe('DURDU_ITIRAZ')
    expect(o.oku('v1')).toMatchObject({ durum: 'UYGULANDI', hedefId: 'd1' })
    expect(o.gecisler).toEqual([expect.objectContaining({ eksen: 'ICRA', eski: null, yeni: 'DURDU_ITIRAZ', kaynakId: 'v1', kullaniciId: 'avukat-1' })])
    expect(o.aktiviteler).toHaveLength(1)
  })

  it('araya değişiklik girdiyse (WHERE alan = eskiDeger tutmaz) satır ATLANDI, veri değişmez', async () => {
    const dosyalar = { d1: { icraEksen: 'KESINLESTI' as string | null } } // başka sekmeden değişmiş
    const o = ortam(dosyalar)
    const s = o.ekle(satir({}))
    const r = await satirUygula(s, o.adaptorler, o.iz, b)
    expect(r.sonuc).toBe('ATLANDI')
    expect(dosyalar.d1.icraEksen).toBe('KESINLESTI')
    expect(o.oku('v1').durum).toBe('ATLANDI')
    expect(o.oku('v1').not).toContain('araya değişiklik')
    expect(o.gecisler).toHaveLength(0)
  })

  it('geri alma eski değeri yazar ve DurumGecisi\'nde yeni bir satır açar', async () => {
    const dosyalar = { d1: { icraEksen: null as string | null } }
    const o = ortam(dosyalar)
    await satirUygula(o.ekle(satir({})), o.adaptorler, o.iz, b)
    const r = await satirGeriAl(o.oku('v1'), o.adaptorler, o.iz, b)
    expect(r).toEqual({ sonuc: 'GERI_ALINDI' })
    expect(dosyalar.d1.icraEksen).toBeNull()
    expect(o.oku('v1').durum).toBe('GERI_ALINDI')
    expect(o.gecisler).toHaveLength(2)
    expect(o.gecisler[1]).toMatchObject({ eski: 'DURDU_ITIRAZ', yeni: BOS })
  })

  it('uygulamadan sonra değer yeniden değiştiyse geri alma dokunmaz', async () => {
    const dosyalar = { d1: { icraEksen: null as string | null } }
    const o = ortam(dosyalar)
    await satirUygula(o.ekle(satir({})), o.adaptorler, o.iz, b)
    dosyalar.d1.icraEksen = 'KESINLESTI'
    const r = await satirGeriAl(o.oku('v1'), o.adaptorler, o.iz, b)
    expect(r.sonuc).toBe('ATLANDI')
    expect(dosyalar.d1.icraEksen).toBe('KESINLESTI')
    expect(o.oku('v1').durum).toBe('UYGULANDI')
  })

  it('tutar (R1): değer normalize edilir, eksen olmadığı için DurumGecisi yazılmaz', async () => {
    const dosyalar = { d1: { rucuTutari: '1234.57' as string | null } }
    const o = ortam(dosyalar)
    const s = o.ekle(satir({ kod: 'R1', parti: 'R1-TUTAR-01', alan: 'rucuTutari', eskiJson: { deger: '1234.57' }, yeniJson: { deger: '1234567.8' } }))
    expect((await satirUygula(s, o.adaptorler, o.iz, b)).sonuc).toBe('UYGULANDI')
    expect(dosyalar.d1.rucuTutari).toBe('1234567.80')
    expect(o.gecisler).toHaveLength(0)
    expect(o.aktiviteler[0]).toMatchObject({ eylem: expect.stringContaining('Rücu tutarı') })
  })

  it('beyaz liste dışı alan ve geçersiz değer uygulanmaz', async () => {
    const o = ortam({ d1: { telefon: 'x', icraEksen: null } })
    expect((await satirUygula(o.ekle(satir({ id: 'v2', alan: 'telefon', yeniJson: { deger: 'y' } })), o.adaptorler, o.iz, b)).sonuc).toBe('ATLANDI')
    expect((await satirUygula(o.ekle(satir({ id: 'v3', yeniJson: { deger: 'UYDURMA' } })), o.adaptorler, o.iz, b)).sonuc).toBe('ATLANDI')
  })

  it('onaylı olmayan satır işlenmez; iz yazımı korunamazsa hata fırlar (transaction geri döner)', async () => {
    const o = ortam({ d1: { icraEksen: null } })
    expect((await satirUygula(o.ekle(satir({ durum: 'KURU' })), o.adaptorler, o.iz, b)).sonuc).toBe('GECILDI')
    const bozukIz: IzYazici = { ...o.iz, satirDurumu: async () => 0 }
    await expect(satirUygula(satir({ id: 'v9' }), o.adaptorler, bozukIz, b)).rejects.toThrow('geri alındı')
  })
})

describe('S13 · EKLE uygula ve geri al (sahte hedef tablo)', () => {
  it('EKLE satırı hedefte satır açar, hedefId yazılır; geri almada hedefe silindiAt düşer', async () => {
    const o = ortam({})
    const s = o.ekle(satir({ id: 'e1', kod: 'R0', parti: 'R0-IIK67-01', islem: 'EKLE', hedefTablo: 'SahteTablo', alan: '*', eskiJson: {}, yeniJson: { anahtar: 'IIK67|b1' } }))
    expect((await satirUygula(s, o.adaptorler, o.iz, b)).sonuc).toBe('UYGULANDI')
    expect(o.sahteTablo).toHaveLength(1)
    expect(o.oku('e1')).toMatchObject({ durum: 'UYGULANDI', hedefId: 'sahte-1' })
    expect((await satirGeriAl(o.oku('e1'), o.adaptorler, o.iz, b)).sonuc).toBe('GERI_ALINDI')
    expect(o.sahteTablo[0].silindiAt).toEqual(b.simdi)
    expect(o.oku('e1').durum).toBe('GERI_ALINDI')
  })

  it('hedefte aynı kayıt varsa EKLE atlanır; toplu işlem sayar', async () => {
    const o = ortam({})
    const a = o.ekle(satir({ id: 'e1', islem: 'EKLE', hedefTablo: 'SahteTablo', alan: '*', eskiJson: {}, yeniJson: { anahtar: 'k' } }))
    const c = o.ekle(satir({ id: 'e2', islem: 'EKLE', hedefTablo: 'SahteTablo', alan: '*', eskiJson: {}, yeniJson: { anahtar: 'k' } }))
    const r = await satirlariIsle([a, c], (s) => satirUygula(s, o.adaptorler, o.iz, b))
    expect(r).toMatchObject({ uygulanan: 1, atlanan: 1 })
    expect(o.oku('e2').not).toContain('tekillik')
  })

  it('Sure EKLE verisi: onaylanan gün yoksa yalnız öneri yazılır; son gün hiç yoksa reddedilir', () => {
    const simdi = new Date('2026-10-01T07:00:00Z')
    const v = sureEkleVerisi({ tur: 'IIK67', dayanak: 'İİK 67/1', borcluId: null, itirazTarihi: '2026-03-12', onerilenIhtiyatli: '2027-03-12' }, 'd1', 'avukat-1', simdi)
    expect(v).toMatchObject({ dosyaId: 'd1', tur: 'IIK67', onaylananSonGun: null, onaylayanId: null, durum: 'ACIK' })
    const onayli = sureEkleVerisi({ tur: 'IIK67', dayanak: 'İİK 67/1', onerilenIhtiyatli: '2027-03-12', onaylananSonGun: '2027-03-10', bakilanEvrak: 'Kodsuz defter satırı' }, 'd1', 'avukat-1', simdi)
    expect(onayli).toMatchObject({ onaylayanId: 'avukat-1', onayAt: simdi })
    expect(() => sureEkleVerisi({ tur: 'IIK67', dayanak: 'İİK 67/1' }, 'd1', 'avukat-1', simdi)).toThrow()
  })
})
