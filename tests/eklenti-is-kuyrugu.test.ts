/**
 * S22 · Eklenti 2.0 iş kuyruğu — content.js GERÇEKTEN ÇALIŞTIRILIR (vm; sahte chrome, sahte DOM, sahte UYAP).
 *  - Yalnız kişisel (kr2_) anahtarla yoklar; eski şirket anahtarıyla iş kuyruğuna gitmez.
 *  - Yoklama nabız taşır (UYAP oturumu açık mı); oturum kapalıysa ya da sunucu bayrağı kapalıysa iş almaz.
 *  - ICRA işi: toplu turla aynı eşleştirme kemeri, adım adım rapor, özet (evrak sayısı, UYAP asıl alacak).
 *  - Aleyhe dosya (TARAF_UYUSMAZ): hiçbir şey yazılmaz, iş HATA ile biter.
 *  - KOPILOT işi: Takip Aç paneli o dosyayla açılır; UYAP'a hiçbir şey yazılmaz.
 *  - UYAP'a giden her istek salt-okuma uçlarıdır (tevzi/ödeme/evrak gönderme yok).
 * Bütün UYAP yanıtları kurgusaldır.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const KOK = process.cwd()
const KOD = {
  snf: readFileSync(path.join(KOK, 'extension', 'siniflandir.js'), 'utf8'),
  saf: readFileSync(path.join(KOK, 'extension', 'saf.js'), 'utf8'),
  icerik: readFileSync(path.join(KOK, 'extension', 'content.js'), 'utf8'),
}
const YENI = 'kr2_' + 'K'.repeat(43)
const ESKI = 'kr_' + 'ab'.repeat(24)

type Mesaj = Record<string, unknown> & { type: string }
type Yanit = (m: Mesaj) => unknown

function el(): Record<string, unknown> {
  const e: Record<string, unknown> = {
    id: '', className: '', textContent: '', innerHTML: '', style: {}, dataset: {},
    classList: { add() {}, toggle() {}, remove() {}, contains: () => false },
    addEventListener() {}, appendChild: (c: unknown) => c, prepend() {}, remove() {}, click() {},
    querySelector: () => el(), querySelectorAll: () => [],
  }
  return e
}

/** UYAP'ın kurgusal salt-okuma yanıtları. */
function uyapYanitlari(o: { alacakli?: string; oturumKapali?: boolean } = {}) {
  const yol: Record<string, unknown> = {
    '/avukat_mahkemeleri_sorgula.ajx': [{ birimId: '101', birimAdi: 'Kurgusal 1. İcra Dairesi' }],
    '/search_phrase_detayli.ajx': [{ dosyaId: 'UYAP-KURGU-1', dosyaNo: '2026/1234', dosyaDurum: 'Açık', birimAdi: 'Kurgusal 1. İcra Dairesi', birimId: '101' }],
    '/dosya_taraf_bilgileri_brd.ajx': [{ adi: o.alacakli ?? 'KURGUSAL SİGORTA A.Ş.', rol: 'ALACAKLI' }, { adi: 'KURGUSAL BORÇLU', rol: 'BORÇLU' }],
    '/dosyaAyrintiBilgileri_brd.ajx': { dosyaDurumu: 'Açık', alacakKalemToplamTutar: 1100 },
    '/dosya_hesap_bilgileri.ajx': [{ textAlan: 'Takipte Kesinlesen Miktar', degerAlan: 1000 }, { textAlan: 'Yatan Para', degerAlan: 0 }],
    '/list_dosya_evraklar.ajx': { evraklar: [{ evrakId: 'EVRAKKIMLIGIKURGU0001-oturum', evrakTarihi: '2026-03-01', evrakTuru: 'Ödeme İcra Emri', aciklama: 'Ödeme İcra Emri' }] },
    '/dosya_safahat_bilgileri_brd.ajx': [{ islemTarihi: '2026-03-02', islem: 'Takip açıldı' }],
  }
  return yol
}

function yukle(o: { tokenlar?: string[]; yanit?: Record<string, Yanit>; uyap?: Record<string, unknown>; oturumKapali?: boolean } = {}) {
  const gonderilen: Mesaj[] = []
  const uyapIstekleri: string[] = []
  const depo: Record<string, unknown> = { senkronTokenlar: o.tokenlar ?? [YENI] }
  const uyap = o.uyap ?? uyapYanitlari()
  const varsayilan: Record<string, Yanit> = {
    RUCU_TOKENLAR: () => ({ ok: true, tokenlar: o.tokenlar ?? [YENI] }),
    RUCU_IS_SIRA: () => ({ ok: true, status: 200, data: { ok: true, bekleyen: 0, isler: [], ozellikler: { isKuyrugu: true } } }),
    RUCU_IS_ADIM: () => ({ ok: true, data: { ok: true } }),
    RUCU_IS_BITIR: () => ({ ok: true, data: { ok: true } }),
    RUCU_SENKRON: () => ({ ok: true, data: { ok: true, yeniOlay: 2 } }),
    RUCU_EVRAK_MANIFEST: () => ({ ok: true, data: { ok: true, onekler: [] } }),
    RUCU_EVRAK: () => ({ ok: true, data: { ok: true } }),
    RUCU_KIMLIK: () => ({ ok: true, data: { ok: true, musteriId: 'musteri-ray', tur: 'YENI', kalanGun: 80 } }),
  }
  const ctx: Record<string, unknown> = {
    __KONS_TEST__: {},
    console,
    setTimeout: (f: () => void, ms?: number) => ((ms ?? 0) <= 2000 ? setTimeout(f, 0) : 0),
    clearTimeout: () => undefined,
    setInterval: () => 0,
    addEventListener: () => undefined,
    postMessage: () => undefined,
    btoa: globalThis.btoa,
    location: { href: 'https://avukat.uyap.gov.tr/', origin: 'https://avukat.uyap.gov.tr' },
    document: { body: el(), head: el(), createElement: () => el(), addEventListener: () => undefined, visibilityState: 'visible' },
    fetch: async (url: string) => {
      uyapIstekleri.push(url)
      if (url.startsWith('/')) {
        if (o.oturumKapali) return { ok: true, status: 200, text: async () => '<html>giriş</html>' }
        const j = uyap[url]
        return { ok: true, status: 200, text: async () => JSON.stringify(j ?? []) }
      }
      // evrak indirme (salt okuma)
      return { ok: true, status: 200, headers: { get: () => 'application/pdf' }, arrayBuffer: async () => new TextEncoder().encode('%PDF-1.4 kurgusal').buffer }
    },
    chrome: {
      runtime: {
        onMessage: { addListener: () => undefined },
        getManifest: () => ({ version: '2.0.0' }),
        sendMessage: (m: Mesaj, cb: (r: unknown) => void) => { gonderilen.push(m); const f = o.yanit?.[m.type] ?? varsayilan[m.type]; cb(f ? f(m) : { ok: false, error: 'yok' }) },
      },
      storage: { local: { get: (_k: unknown, cb: (x: object) => void) => cb({ ...depo }), set: (x: object, cb?: () => void) => { Object.assign(depo, x); cb?.() }, remove: () => undefined } },
    },
  }
  ctx.window = ctx
  vm.createContext(ctx)
  vm.runInContext(KOD.snf, ctx, { filename: 'siniflandir.js' })
  vm.runInContext(KOD.saf, ctx, { filename: 'saf.js' })
  vm.runInContext(KOD.icerik, ctx, { filename: 'content.js' })
  const icerik = (ctx.__KONS_TEST__ as { icerik: { isTuru: (o?: unknown) => Promise<void>; safVar: boolean } }).icerik
  const tur = (t: string) => gonderilen.filter((m) => m.type === t)
  return { icerik, gonderilen, tur, uyapIstekleri, depo }
}

const siraIle = (isler: unknown[], isKuyrugu = true) => () => ({ ok: true, status: 200, data: { ok: true, bekleyen: isler.length, isler, ozellikler: { isKuyrugu, evrakIndir: true } } })

describe('iş kuyruğu yoklaması', () => {
  it('saf.js yüklüdür; yalnız kişisel anahtarla yoklar (eski şirket anahtarı iş kuyruğuna gitmez)', async () => {
    const e = yukle({ tokenlar: [ESKI] })
    expect(e.icerik.safVar).toBe(true)
    await e.icerik.isTuru()
    expect(e.tur('RUCU_IS_SIRA')).toHaveLength(0)
  })

  it('yoklama nabız taşır (UYAP oturumu açık); sunucu bayrağı kapalıysa iş alınmaz', async () => {
    const e = yukle({ yanit: { RUCU_IS_SIRA: siraIle([{ id: 'is-1', tur: 'ICRA' }], false) } })
    await e.icerik.isTuru()
    expect(e.tur('RUCU_IS_SIRA')).toEqual([expect.objectContaining({ token: YENI, uyapOturum: true })])
    expect(e.tur('RUCU_IS_AL')).toHaveLength(0)
  })

  it('UYAP oturumu kapalıysa nabız "kapalı" der ve iş alınmaz', async () => {
    const e = yukle({ oturumKapali: true, yanit: { RUCU_IS_SIRA: siraIle([{ id: 'is-1', tur: 'ICRA' }]) } })
    await e.icerik.isTuru()
    expect(e.tur('RUCU_IS_SIRA')[0]).toMatchObject({ uyapOturum: false })
    expect(e.tur('RUCU_IS_AL')).toHaveLength(0)
  })

  it('aralık ve alarm çakışmaz: art arda iki tur tek yoklama yapar', async () => {
    const e = yukle()
    await e.icerik.isTuru()
    await e.icerik.isTuru()
    expect(e.tur('RUCU_IS_SIRA')).toHaveLength(1)
  })

  it('iş başka sekmeye gittiyse (409) adım ve bitir gönderilmez', async () => {
    const e = yukle({ yanit: { RUCU_IS_SIRA: siraIle([{ id: 'is-1', tur: 'ICRA' }]), RUCU_IS_AL: () => ({ ok: false, status: 409, data: { ok: false } }) } })
    await e.icerik.isTuru()
    expect(e.tur('RUCU_IS_AL')).toHaveLength(1)
    expect(e.tur('RUCU_IS_ADIM')).toHaveLength(0)
    expect(e.tur('RUCU_IS_BITIR')).toHaveLength(0)
  })
})

describe('ICRA işi — tek dosya senkronu', () => {
  const icraIsi = (hedef: Record<string, unknown>) => ({ ok: true, status: 200, data: { ok: true, is: { id: 'is-1', tur: 'ICRA', dosyaId: 'dosya-1', hedef: { id: 'dosya-1', ...hedef } } } })

  it('eşleştirme → ayrıntı → hesap → evrak listesi → safahat → programa yazım → evrak indirme; özetle biter', async () => {
    const e = yukle({ yanit: { RUCU_IS_SIRA: siraIle([{ id: 'is-1', tur: 'ICRA' }]), RUCU_IS_AL: () => icraIsi({ icraDosyaNo: '2026/1234', daire: 'Kurgusal 1. İcra Dairesi', alacakliUnvan: 'Kurgusal Sigorta A.Ş.' }) } })
    await e.icerik.isTuru()
    const adimlar = e.tur('RUCU_IS_ADIM').map((m) => { const a = m.adim as { adim: string; durum: string }; return `${a.adim}:${a.durum}` })
    for (const beklenen of ['ESLESTIRME:TAMAM', 'AYRINTI:TAMAM', 'HESAP:TAMAM', 'EVRAK_LISTESI:TAMAM', 'SAFAHAT:TAMAM', 'PROGRAMA_YAZIM:TAMAM', 'EVRAK_INDIRME:TAMAM']) expect(adimlar).toContain(beklenen)
    expect(adimlar.indexOf('ESLESTIRME:TAMAM')).toBeLessThan(adimlar.indexOf('PROGRAMA_YAZIM:TAMAM'))
    const indirme = e.tur('RUCU_IS_ADIM').find((m) => (m.adim as { adim: string; durum: string; sayac: unknown }).adim === 'EVRAK_INDIRME' && (m.adim as { mesaj: string | null }).mesaj === 'Ödeme İcra Emri')
    expect((indirme?.adim as { sayac: unknown }).sayac).toEqual({ n: 1, toplam: 1 })
    const bitir = e.tur('RUCU_IS_BITIR')
    expect(bitir).toHaveLength(1)
    expect(bitir[0]).toMatchObject({ id: 'is-1', durum: 'TAMAM', ozet: { evrakSayisi: 1, yeniEvrak: 1, eslesme: 'OK', uyapAsilAlacak: 1000 } })
    // program yazımı toplu turla aynı gövde (dosyaId + esas no + durum + hesap)
    expect(e.tur('RUCU_SENKRON')[0]).toMatchObject({ body: { dosyaId: 'dosya-1', icraDosyaNo: '2026/1234', eslesme: { durum: 'OK' } } })
    // UYAP'a giden her istek salt-okuma
    const YAZMA = /tevzi|harc_hesap|odeme|evrak_gonder|kaydet|ekle|sil|guncelle/i
    expect(e.uyapIstekleri.filter((u) => YAZMA.test(u))).toEqual([])
  })

  it('aleyhe dosya (alacaklı müvekkil değil): hiçbir şey yazılmaz, iş TARAF_UYUSMAZ ile HATA biter', async () => {
    const e = yukle({ uyap: uyapYanitlari({ alacakli: 'BAŞKA BİR ŞİRKET A.Ş.' }), yanit: { RUCU_IS_SIRA: siraIle([{ id: 'is-1', tur: 'ICRA' }]), RUCU_IS_AL: () => icraIsi({ icraDosyaNo: '2026/1234', daire: 'Kurgusal 1. İcra Dairesi', alacakliUnvan: 'Kurgusal Sigorta A.Ş.' }) } })
    await e.icerik.isTuru()
    expect(e.tur('RUCU_IS_BITIR')[0]).toMatchObject({ durum: 'HATA', ozet: { eslesme: 'TARAF_UYUSMAZ' } })
    const s = e.tur('RUCU_SENKRON')[0].body as Record<string, unknown>
    expect(s.eslesme).toMatchObject({ durum: 'TARAF_UYUSMAZ' })
    expect(s.durum).toBeUndefined()
    expect(s.olaylar).toBeUndefined()
    expect(e.tur('RUCU_EVRAK')).toHaveLength(0)
  })

  it('esas no yoksa eşleştirme HATA ile biter', async () => {
    const e = yukle({ yanit: { RUCU_IS_SIRA: siraIle([{ id: 'is-1', tur: 'ICRA' }]), RUCU_IS_AL: () => icraIsi({ icraDosyaNo: null, daire: null }) } })
    await e.icerik.isTuru()
    expect(e.tur('RUCU_IS_BITIR')[0]).toMatchObject({ durum: 'HATA' })
    expect(e.uyapIstekleri.filter((u) => u.includes('search_phrase'))).toHaveLength(0)
  })
})

describe('KOPILOT işi — panel o dosyayla açılır, UYAP\'a yazılmaz', () => {
  const kopilot = () => ({ ok: true, status: 200, data: { ok: true, is: { id: 'is-k', tur: 'KOPILOT', dosyaId: 'dosya-1', hedef: { id: 'dosya-1' } } } })
  it('dosya listede → PANEL_ACILDI ve TAMAM', async () => {
    const e = yukle({ yanit: { RUCU_IS_SIRA: siraIle([{ id: 'is-k', tur: 'KOPILOT' }]), RUCU_IS_AL: kopilot, RUCU_TAKIP_HEDEFLER: () => ({ ok: true, data: { ok: true, hedefler: [{ id: 'baska' }, { id: 'dosya-1', engeller: [] }] } }) } })
    await e.icerik.isTuru()
    expect(e.tur('RUCU_TAKIP_HEDEFLER')).toHaveLength(1)
    expect(e.tur('RUCU_IS_ADIM').map((m) => (m.adim as { durum: string }).durum)).toEqual(['CALISIYOR', 'TAMAM'])
    expect(e.tur('RUCU_IS_BITIR')[0]).toMatchObject({ id: 'is-k', durum: 'TAMAM' })
    expect(e.tur('RUCU_TAKIP_TEVZI')).toHaveLength(0) // gönderim yok: avukat panelde "Gönder"e basar
    expect(e.uyapIstekleri.filter((u) => /tevzi|harc/i.test(u))).toEqual([])
  })
  it('dosya kopilot listesinde değilse (tevzi edilmiş / engel) HATA', async () => {
    const e = yukle({ yanit: { RUCU_IS_SIRA: siraIle([{ id: 'is-k', tur: 'KOPILOT' }]), RUCU_IS_AL: kopilot, RUCU_TAKIP_HEDEFLER: () => ({ ok: true, data: { ok: true, hedefler: [] } }) } })
    await e.icerik.isTuru()
    expect(e.tur('RUCU_IS_BITIR')[0]).toMatchObject({ durum: 'HATA' })
  })
})
