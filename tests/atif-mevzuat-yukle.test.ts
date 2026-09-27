import { describe, expect, it } from 'vitest'
import { MEVZUAT_KATALOGU, type KatalogKaydi } from '@/lib/konsrucu/mevzuat/katalog'
import { icerikOzeti, mevzuatYukle, PlanDegistiHata, yuklemePlani, yuklemeyiPasifeAl, type MevzuatDb } from '@/lib/konsrucu/mevzuat/yukle'

type Satir = Record<string, unknown> & { id: string; musteriId: string; kunye: string }

/** Bellek içi MevzuatKaynak tablosu (yalnız yükleyicinin kullandığı sorgular). */
function sahteDb(baslangic: Satir[] = []) {
  const tablo: Satir[] = baslangic.map((s) => ({ ...s }))
  const yazmalar: string[] = []
  const uyar = (s: Satir, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => s[k] === v)
  const db: MevzuatDb = {
    mevzuatKaynak: {
      findMany: async ({ where }) => tablo.filter((s) => uyar(s, where)).map((s) => ({
        id: s.id, kunye: s.kunye, icerikOzet: (s.icerikOzet as string) ?? null, aktif: s.aktif as boolean, durum: s.durum as string, yuklemeId: (s.yuklemeId as string) ?? null,
      })),
      create: async ({ data }) => {
        const d = data as Satir
        if (tablo.some((s) => s.musteriId === d.musteriId && s.kunye === d.kunye)) throw new Error('P2002 musteriId+kunye')
        yazmalar.push(`create:${d.kunye}`)
        tablo.push({ ...d, id: `id-${tablo.length + 1}` })
        return {}
      },
      update: async ({ where, data }) => {
        const s = tablo.find((x) => x.id === where.id)!
        yazmalar.push(`update:${s.kunye}`)
        Object.assign(s, data)
        return {}
      },
      updateMany: async ({ where, data }) => {
        const hedef = tablo.filter((s) => uyar(s, where))
        hedef.forEach((s) => { yazmalar.push(`updateMany:${s.kunye}`); Object.assign(s, data) })
        return { count: hedef.length }
      },
    },
  }
  return { db, tablo, yazmalar }
}

const RAY = 'ray-tenant'
const ZURICH = 'zurich-tenant'

describe('mevzuat kataloğu', () => {
  it('20 kayıt; künyeler tekil; hepsi resmî bağlantılı ve TEYIT_GEREKLI ya da KULLANMA', () => {
    expect(MEVZUAT_KATALOGU).toHaveLength(20)
    expect(new Set(MEVZUAT_KATALOGU.map((k) => k.kunye)).size).toBe(20)
    for (const k of MEVZUAT_KATALOGU) {
      expect(k.resmiUrl, k.kunye).toMatch(/^https:\/\//)
      expect(['TEYIT_GEREKLI', 'KULLANMA']).toContain(k.durum)
      expect(k.alinti.trim().length, k.kunye).toBeGreaterThan(10)
      expect(k.bilgiBankasiYolu).toMatch(/^bilgi-bankasi\/dilekce\/atiflar\.md#/)
    }
    // Bilinen hatalı atıflar KULLANMA (06 §7.1)
    const kullanma = MEVZUAT_KATALOGU.filter((k) => k.durum === 'KULLANMA').map((k) => k.kunye)
    expect(kullanma).toEqual(['Yargıtay 17. HD 17.10.2019, E.2017/1431, K.2019/9581', 'KTK m.110/2', 'ZMSS GŞ B.4/f'])
  })

  it('kişisel veri içermez (TCKN, telefon, IBAN, plaka biçimi yok)', () => {
    const metin = JSON.stringify(MEVZUAT_KATALOGU)
    expect(metin).not.toMatch(/(?<!\d)\d{11}(?!\d)/)
    expect(metin).not.toMatch(/TR\d{2}\s?\d{4}/)
    expect(metin).not.toMatch(/(?<!\d)0?5\d{2}\s?\d{3}\s?\d{2}\s?\d{2}(?!\d)/)
    expect(metin).not.toMatch(/\b\d{2}\s?[A-Z]{1,3}\s?\d{2,4}\b/)
  })
})

describe('mevzuat-yukle (kabul 1–2)', () => {
  it('kuru kip: "eklenecek 20, değişecek 0" döker ve HİÇBİR ŞEY yazmaz', async () => {
    const { db, tablo, yazmalar } = sahteDb()
    const r = await mevzuatYukle(db, { musteriId: RAY, kuru: true })
    expect(r.plan.eklenecek).toHaveLength(20)
    expect(r.plan.degisecek).toHaveLength(0)
    expect(r.yazilan).toBe(0)
    expect(tablo).toHaveLength(0)
    expect(yazmalar).toHaveLength(0)
  })

  it('gerçek yükleme 20 kayıt yazar; ikinci çalıştırma "aynı kalacak 20" ve yazmaz (idempotent)', async () => {
    const { db, tablo, yazmalar } = sahteDb()
    const kuru = await mevzuatYukle(db, { musteriId: RAY, kuru: true })
    const r = await mevzuatYukle(db, { musteriId: RAY, kuru: false, yuklemeId: 'yk-1', beklenenPlanOzeti: kuru.plan.ozet })
    expect(r.yazilan).toBe(20)
    expect(tablo).toHaveLength(20)
    expect(tablo.every((s) => s.musteriId === RAY && s.yuklemeId === 'yk-1' && s.aktif === true)).toBe(true)
    expect(tablo.filter((s) => s.durum === 'KULLANMA')).toHaveLength(3)
    expect(tablo.filter((s) => s.durum === 'DOGRULANDI')).toHaveLength(0) // doğrulayan Yelda
    const ikinci = await mevzuatYukle(db, { musteriId: RAY, kuru: false, yuklemeId: 'yk-2' })
    expect(ikinci.plan.ayniKalacak).toHaveLength(20)
    expect(ikinci.yazilan).toBe(0)
    expect(yazmalar.filter((y) => y.startsWith('create'))).toHaveLength(20)
    expect(yazmalar.some((y) => y.startsWith('update'))).toBe(false)
  })

  it('müvekkil bazında: Ray yüklemesi Zurich kütüphanesine dokunmaz', async () => {
    const { db, tablo } = sahteDb()
    await mevzuatYukle(db, { musteriId: RAY, kuru: false, yuklemeId: 'yk-1' })
    const z = await mevzuatYukle(db, { musteriId: ZURICH, kuru: true })
    expect(z.plan.eklenecek).toHaveLength(20)
    expect(tablo.every((s) => s.musteriId === RAY)).toBe(true)
  })

  it('içeriği değişen kayıt "değişecek"; yazılınca avukat doğrulaması sıfırlanır', async () => {
    const { db, tablo } = sahteDb()
    await mevzuatYukle(db, { musteriId: RAY, kuru: false, yuklemeId: 'yk-1' })
    const s = tablo.find((x) => x.kunye === 'İİK m.67/1')!
    Object.assign(s, { durum: 'DOGRULANDI', dogrulayanId: 'yelda', dogrulamaAt: new Date() })
    const yeni: KatalogKaydi[] = MEVZUAT_KATALOGU.map((k) => (k.kunye === 'İİK m.67/1' ? { ...k, kapsamNotu: `${k.kapsamNotu} (güncellendi)` } : k))
    const kuru = await mevzuatYukle(db, { musteriId: RAY, kuru: true, katalog: yeni })
    expect(kuru.plan.degisecek).toEqual(['İİK m.67/1'])
    expect(kuru.plan.ayniKalacak).toHaveLength(19)
    await mevzuatYukle(db, { musteriId: RAY, kuru: false, yuklemeId: 'yk-2', katalog: yeni, beklenenPlanOzeti: kuru.plan.ozet })
    expect(s).toMatchObject({ durum: 'TEYIT_GEREKLI', dogrulayanId: null, dogrulamaAt: null, yuklemeId: 'yk-2', icerikOzet: icerikOzeti(yeni.find((k) => k.kunye === 'İİK m.67/1')!) })
  })

  it('onaylanan kuru plandan sonra liste değiştiyse gerçek yükleme durur', async () => {
    const { db, tablo } = sahteDb()
    const kuru = await mevzuatYukle(db, { musteriId: RAY, kuru: true })
    tablo.push({ id: 'elle', musteriId: RAY, kunye: 'İİK m.67/1', icerikOzet: 'eski', aktif: true, durum: 'TEYIT_GEREKLI', yuklemeId: null })
    await expect(mevzuatYukle(db, { musteriId: RAY, kuru: false, yuklemeId: 'yk-1', beklenenPlanOzeti: kuru.plan.ozet })).rejects.toBeInstanceOf(PlanDegistiHata)
    expect(tablo).toHaveLength(1)
  })

  it('gerçek yükleme yükleme kimliği olmadan yapılmaz', async () => {
    const { db } = sahteDb()
    await expect(mevzuatYukle(db, { musteriId: RAY, kuru: false })).rejects.toThrow(/yükleme kimliği/)
  })

  it('yanlış yükleme kimliğiyle toplu pasife alınır; yeniden yükleme onu kendiliğinden açmaz', async () => {
    const { db, tablo } = sahteDb([{ id: 'elle', musteriId: RAY, kunye: 'Elle eklenen', icerikOzet: null, aktif: true, durum: 'DOGRULANDI', yuklemeId: null }])
    await mevzuatYukle(db, { musteriId: RAY, kuru: false, yuklemeId: 'yk-hatali' })
    const kuruPasif = await yuklemeyiPasifeAl(db, { musteriId: RAY, yuklemeId: 'yk-hatali', kuru: true })
    expect(kuruPasif).toMatchObject({ yazilan: 0 })
    expect(kuruPasif.etkilenecek).toHaveLength(20)
    expect(tablo.filter((s) => s.aktif === false)).toHaveLength(0)
    const r = await yuklemeyiPasifeAl(db, { musteriId: RAY, yuklemeId: 'yk-hatali', kuru: false })
    expect(r.yazilan).toBe(20)
    expect(tablo.filter((s) => s.yuklemeId === 'yk-hatali').every((s) => s.aktif === false && s.durum === 'KULLANMA')).toBe(true)
    expect(tablo.find((s) => s.id === 'elle')).toMatchObject({ aktif: true, durum: 'DOGRULANDI' }) // başka kayda dokunulmaz
    const plan = yuklemePlani((await db.mevzuatKaynak.findMany({ where: { musteriId: RAY } })))
    expect(plan.pasifKalacak).toHaveLength(20)
    expect(plan.katalogDisi).toEqual(['Elle eklenen'])
  })

  it('katalogda aynı künye iki kez olursa plan kurulmaz', () => {
    expect(() => yuklemePlani([], [MEVZUAT_KATALOGU[0], MEVZUAT_KATALOGU[0]])).toThrow(/iki kez/)
  })
})
