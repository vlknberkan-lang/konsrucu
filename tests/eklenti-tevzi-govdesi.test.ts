/**
 * S21 · Kopilot tevzi gövdesi (extension/saf.js · tevziGovdesi) ve sunucuyla ÇAPRAZ KİLİT.
 *  - Faiz seçilmeden kopilot DURUR (UYAP'a tek istek gitmeden); eşlenemeyen seçimde "Faiz türünü UYAP'ta elle seçin".
 *  - Gövde, keşif kaydındaki (2026-07-06) tevzi gövdesiyle aynı yapıdadır; yalnız faizBilgileri ve
 *    dosyaAciklama_48_4 programdaki seçimden gelir; "%......" hiçbir zaman gönderilmez.
 *  - saf.js'in faiz fonksiyonları lib/konsrucu/senkron/takip-talebi.ts ile birebir aynı sonucu verir.
 * Kurgusal taraf ve tutarlar; kişisel veri yok.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { faizSecimiEksikleri, faizTalepMetni, kopilotFaizDestekli, oranCoz, type FaizSecimi } from '@/lib/konsrucu/senkron/takip-talebi'

type Kod = { tktId: string; kod: string; aciklama: string; kodTuru: string }
type Saf = {
  surum: string
  faizSecimiEksikleri: (s: unknown) => string[]
  faizTalepMetni: (s: unknown) => string | null
  kopilotFaizDestekli: (s: unknown) => boolean
  oranCoz: (s: unknown) => unknown
  faizUyapKodu: (s: unknown) => Kod | null
  faizOnKontrol: (h: unknown) => { ok: boolean; hata?: string; talep?: string }
  tevziGovdesi: (h: unknown, u: unknown) => { ok: true; govde: Record<string, string>; faizKodu: Kod; talepMetni: string } | { ok: false; hata: string }
}

const KOK = process.cwd()
const baglam: { KonsSaf?: Saf } = {}
vm.createContext(baglam)
vm.runInContext(readFileSync(path.join(KOK, 'extension', 'saf.js'), 'utf8'), baglam, { filename: 'saf.js' })
const S = baglam.KonsSaf as Saf
const J = <T>(x: T): T => JSON.parse(JSON.stringify(x))

const YASAL: FaizSecimi = { faizTuru: 'YASAL', faizOraniMetni: 'değişen oranlarda', faizBaslangicTuru: 'HER_ODEMEDEN', faizBaslangic: null }

/** Kopilotun UYAP'tan canlı çözdüğü parçaların kurgusal karşılıkları. */
function uyapParcalari() {
  let n = 0
  return {
    adliye: { adliyeBirimID: 'KURGU-1', adliyeIsmi: 'KURGUSAL ADLİYESİ' },
    sekilAd: ' ÖRNEK: 7 İlamsız Takiplerde Ödeme Emri - Eski No: 49 ',
    yolAd: 'Genel Haciz Yoluyla Takip',
    mahiyet: { name: 'Diğer', value: 1407 },
    tarafList: [{ id: 't1', tarafAdi: 'KURGUSAL BORÇLU' }, { id: 't2', tarafAdi: 'KURGUSAL SİGORTA A.Ş.' }],
    rid: () => `rid${++n}`,
  }
}
function hedef(faiz: unknown, islemisFaiz = 1234.56) {
  return {
    id: 'dosya-1',
    alacak: { anapara: 100000, islemisFaiz, toplam: 100000 + islemisFaiz, faizBaslangic: '2026-03-15' },
    aciklama: 'Kurgusal takip açıklaması',
    adliye: { ilKodu: 6, il: 'ANKARA', ad: 'Ankara' },
    faiz,
  }
}

describe('faiz ön kontrolü — kopilot UYAP\'a tek istek göndermeden durur', () => {
  it('program faiz göndermiyorsa (eski program ya da seçim yok) durur', () => {
    const r = S.faizOnKontrol(hedef(null))
    expect(r.ok).toBe(false)
    expect(r.hata).toContain('seçilmedi')
  })
  it('eksik seçim (başlangıç yok) durur', () => {
    const r = S.faizOnKontrol(hedef({ ...YASAL, faizBaslangicTuru: null }))
    expect(r.ok).toBe(false)
    expect(r.hata).toContain('Faiz başlangıcı seçilmedi')
  })
  it('keşifle teyit edilmemiş seçim (avans, sabit oran) → "Faiz türünü UYAP\'ta elle seçin"', () => {
    for (const f of [{ ...YASAL, faizTuru: 'AVANS' }, { ...YASAL, faizOraniMetni: '%24' }, { ...YASAL, faizTuru: 'DIGER', faizOraniMetni: '%9' }]) {
      const r = S.faizOnKontrol(hedef(f))
      expect(r.ok).toBe(false)
      expect(r.hata).toContain("Faiz türünü UYAP'ta elle seçin")
    }
  })
  it('program ile eklenti metni uyuşmazsa durur (sürüm farkı koruması)', () => {
    const r = S.faizOnKontrol(hedef({ ...YASAL, talepMetni: 'başka bir metin' }))
    expect(r.ok).toBe(false)
    expect(r.hata).toContain('uyuşmuyor')
  })
  it('yasal + değişen oran → Adi Kanuni Faiz (FAIZT00002, keşif kaydı)', () => {
    const r = S.faizOnKontrol(hedef({ ...YASAL, talepMetni: faizTalepMetni(YASAL) }))
    expect(r.ok).toBe(true)
    expect(J(S.faizUyapKodu(YASAL))).toEqual({ tktId: 'FAIZT00002', kod: '00002', aciklama: 'Adi Kanuni Faiz', kodTuru: 'FAIZT' })
  })
})

describe('tevzi gövdesi', () => {
  it('seçimden kurulur: faiz kodu, talep cümlesi, alacak tarihi; "%......" yok', () => {
    const r = S.tevziGovdesi(hedef(YASAL), uyapParcalari())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const idb = JSON.parse(r.govde.IcraDosyaBilgileri)
    const ilamsiz = JSON.parse(r.govde.IlamsizList)
    expect(idb.dosyaAciklama_48_4).toContain('yasal faizi')
    expect(idb.dosyaAciklama_48_4).toContain('her bir ödeme tarihinden itibaren')
    expect(JSON.stringify(r.govde)).not.toContain('%......')
    expect(ilamsiz[0].alacakTarihi).toBe('15/03/2026')
    expect(ilamsiz[0].alacakKalemleri[0].faizBilgileri.selectedFaizTuru).toEqual({ tktId: 'FAIZT00002', kod: '00002', aciklama: 'Adi Kanuni Faiz', kodTuru: 'FAIZT' })
    expect(ilamsiz[0].alacakKalemleri).toHaveLength(2) // asıl + işlemiş faiz
    expect(ilamsiz[0].alacakKalemleri[1].temelBilgileri.alacakTutari).toBe(1234.56)
    expect(r.govde.IlamliList).toBe('[]')
    expect(r.govde.TahsilatList).toBe('[]')
  })

  it('işlemiş faiz 0 ise yalnız asıl alacak kalemi', () => {
    const r = S.tevziGovdesi(hedef(YASAL, 0), uyapParcalari())
    expect(r.ok && JSON.parse(r.govde.IlamsizList)[0].alacakKalemleri).toHaveLength(1)
  })

  it('yapı keşif kaydındaki gövdeyle aynı: yalnız faiz türü ve talep cümlesi değişti', () => {
    const r = S.tevziGovdesi(hedef(YASAL), uyapParcalari())
    if (!r.ok) throw new Error(r.hata)
    const idb = JSON.parse(r.govde.IcraDosyaBilgileri)
    // 1.9'un sabit gövdesindeki alan listesi (content.js 1.9, keşif 2026-07-06)
    const ALANLAR_19 = ['selectedIl', 'kotaKullanimSekliText', 'kotaKullanimSekli', 'selectedAdliye', 'adliyeBirimId', 'adliyeIsmi', 'selectedTakipTuru', 'takipTuru', 'takipTuruText', 'selectedTakipSekli', 'takipSekli', 'takipSekliText', 'selectedTakipYolu', 'takipYolu', 'takipYoluText', 'dosyaTevziTipiBanka', 'dosyaTevziTipiGayrimenkul', 'dosyaAciklama_48_4', 'dosyaAciklama_48_9', 'ipotekRehinAciklama', 'selectedTakipMahiyeti', 'mahiyetId', 'mahiyetText', 'selectedDosyaKriterleri', 'dosyaKriterList', 'dosyaKriterTextList', 'showHacizTahliyeValue', 'hacizOnayValue', 'tahliyeOnayValue']
    expect(Object.keys(idb)).toEqual(ALANLAR_19)
    expect(Object.keys(r.govde)).toEqual(['IcraDosyaBilgileri', 'TarafList', 'IlamsizList', 'IlamliList', 'TahsilatList'])
    expect(idb).toMatchObject({ takipTuru: 1, takipYolu: 0, takipSekli: 0, dosyaAciklama_48_9: 'Haciz Yolu', dosyaKriterList: 'bk', adliyeBirimId: 'KURGU-1' })
    const k0 = JSON.parse(r.govde.IlamsizList)[0].alacakKalemleri[0].faizBilgileri
    expect(k0).toMatchObject({ faizOraniKurus: 0, selectedFaizSureTipi: '2', selectedFaizSureTipiAdi: 'Yıllık' })
  })

  it('faiz yoksa gövde kurulmaz (gönderim de olmaz)', () => {
    const r = S.tevziGovdesi(hedef(null), uyapParcalari())
    expect(r.ok).toBe(false)
  })

  it('tek tarihten seçildiyse talep cümlesi o tarihi söyler', () => {
    const f = { ...YASAL, faizBaslangicTuru: 'TEK_TARIH', faizBaslangic: '2026-02-01' }
    const r = S.tevziGovdesi(hedef(f), uyapParcalari())
    expect(r.ok && JSON.parse(r.govde.IcraDosyaBilgileri).dosyaAciklama_48_4).toContain('01.02.2026 tarihinden itibaren')
  })
})

describe('ÇAPRAZ KİLİT — saf.js = lib/konsrucu/senkron/takip-talebi.ts', () => {
  const turler = ['YASAL', 'AVANS', 'DIGER', null, 'BILINMEYEN']
  const oranlar = ['değişen oranlarda', 'Değişen oranlarda', '%24', '24', '9,5', '%0', '', null, 'yüksek']
  const baslangiclar: [string | null, string | null][] = [['HER_ODEMEDEN', null], ['TEK_TARIH', '2026-01-31'], ['TEK_TARIH', null], [null, null]]
  const matris: FaizSecimi[] = []
  for (const faizTuru of turler) for (const faizOraniMetni of oranlar) for (const [faizBaslangicTuru, faizBaslangic] of baslangiclar) matris.push({ faizTuru, faizOraniMetni, faizBaslangicTuru, faizBaslangic })

  it(`${matris.length} seçim bileşiminde eksikler, talep cümlesi ve kopilot desteği aynı`, () => {
    for (const s of matris) {
      expect(J(S.faizSecimiEksikleri(s)), JSON.stringify(s)).toEqual(faizSecimiEksikleri(s))
      expect(S.faizTalepMetni(s), JSON.stringify(s)).toBe(faizTalepMetni(s))
      expect(S.kopilotFaizDestekli(s), JSON.stringify(s)).toBe(kopilotFaizDestekli(s))
      expect(J(S.oranCoz(s.faizOraniMetni))).toEqual(oranCoz(s.faizOraniMetni))
    }
  })

  it('hiçbir bileşimde "%......" üretilmez', () => {
    for (const s of matris) expect(String(faizTalepMetni(s) ?? '')).not.toContain('%......')
  })
})

describe('eklenti paketi 2.0.0', () => {
  const manifest = JSON.parse(readFileSync(path.join(KOK, 'extension', 'manifest.json'), 'utf8'))
  it('sürüm 2.0.0; saf.js sınıflandırıcıdan sonra, content.js\'ten önce yüklenir', () => {
    expect(manifest.version).toBe('2.0.0')
    expect(S.surum).toBe('2.0.0')
    const js = (manifest.content_scripts as { js: string[] }[]).find((c) => c.js.includes('content.js'))!.js
    expect(js).toEqual(['siniflandir.js', 'saf.js', 'content.js'])
  })
  it('izin değişikliği yok (Store incelemesi kısa kalsın)', () => {
    expect(manifest.permissions).toEqual(['storage', 'alarms', 'downloads'])
    expect(manifest.host_permissions).toEqual(['*://*.uyap.gov.tr/*', 'https://konsrucu.vercel.app/*', 'https://konslaw.app/*'])
  })
  it('kopilot hâlâ avukat onayıyla gönderir; UYAP\'a yazan tek uç tevzidir (Evrak Gönderme / Ödeme uçları yok)', () => {
    const content = readFileSync(path.join(KOK, 'extension', 'content.js'), 'utf8')
    expect(content).toContain('window.confirm(')
    expect(content).toMatch(/apiPost\("\/icra_takip_tevzi_islemleri\.ajx", govde\)/)
    expect(content).not.toMatch(/evrak_gonder|evrakGonder|odeme_yap|odemeYap|harc_ode/i)
    expect(content).not.toMatch(/dosyaAciklama_48_4:\s*["'`][^"'`]*%\.{6}/) // faiz boşluklu sabit metin artık gövdede yok
    expect(content).not.toMatch(/tktId:\s*"FAIZT00002"/) // faiz türü kodu sabit değil, seçimden (saf.js)
    expect(content).toContain('SAF.tevziGovdesi(h,')
  })
})
