/**
 * S18 · öneri servisi (lib/konsrucu/oneri/servis.ts) — bellek içi sahte Prisma işlem istemcisiyle.
 * Kabul testlerinin veri tarafı: düzeltilen tutar yeniden çıkarımda korunur ve yeni değer ayrı öneri olur (kabul 3);
 * alıntısı belgede olmayan alan "kaynaksız" (kabul 5); iki sekmede aynı öneri → "az önce onaylandı" (kabul 5);
 * onay eski kolona aynı işlemde aynalanır (M5); AI dekontu onaysız ödeme olmaz, faiz başlangıcı değişmez (B37).
 * Kısmi tekil indeks (dosya + alan başına tek ONAYLI) sahte veritabanında da uygulanır (P2002).
 */
import { describe, expect, it } from 'vitest'
import { elleOnayla, onerileriKaydet, oneriOnayla, oneriReddet, OneriHata, tekilIhlalMi, topluOnayla, type Db } from '@/lib/konsrucu/oneri/servis'
import type { KullaniciYetkisi } from '@/lib/konsrucu/oneri/tipler'

type Satir = Record<string, unknown>
const DOSYA = 'dosya-1'
const AVUKAT: KullaniciYetkisi = { duzenleyebilir: true, kararVerebilir: true }
const YARDIMCI: KullaniciYetkisi = { duzenleyebilir: true, kararVerebilir: false }

function sahteDb(b: { belge?: Satir[]; belgeSayfa?: Satir[]; odeme?: Satir[]; cikarimJson?: unknown } = {}) {
  let sayac = 0
  const t = {
    alanDegeri: [] as Satir[],
    belge: b.belge ?? [],
    belgeSayfa: b.belgeSayfa ?? [],
    odeme: b.odeme ?? [],
    aktivite: [] as Satir[],
    rucuDosyasi: [{ id: DOSYA, cikarimJson: b.cikarimJson ?? null, faizBaslangic: new Date('2026-01-01T00:00:00Z') }] as Satir[],
  }
  const uygun = (s: Satir, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
        const o = v as { in?: unknown[]; notIn?: unknown[] }
        if (o.in) return o.in.includes(s[k])
        if (o.notIn) return !o.notIn.includes(s[k])
        return true
      }
      return (s[k] ?? null) === v
    })
  const sec = (s: Satir, select?: Record<string, unknown>) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, s[k] ?? null])) : { ...s })
  const tekil = (s: Satir) => {
    if (s.durum !== 'ONAYLI' || s.silindiAt) return
    if (t.alanDegeri.some((x) => x !== s && x.durum === 'ONAYLI' && !x.silindiAt && x.dosyaId === s.dosyaId && x.alan === s.alan)) {
      throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    }
  }
  const yeniSatir = (d: Satir): Satir => ({
    id: `ad-${++sayac}`, silindiAt: null, createdAt: new Date(), onaylayanId: null, onayAt: null, sayfa: null, alinti: null,
    alintiDogru: null, guven: null, uretici: null, kaynakBelgeId: null, durum: 'ONERI', ...d,
  })
  type Arg = { where?: Record<string, unknown>; select?: Record<string, unknown>; data?: unknown }
  const db = {
    alanDegeri: {
      findMany: async (a: Arg) => t.alanDegeri.filter((s) => uygun(s, a.where)).map((s) => sec(s, a.select)),
      findFirst: async (a: Arg) => { const s = t.alanDegeri.find((x) => uygun(x, a.where)); return s ? sec(s, a.select) : null },
      updateMany: async (a: Arg) => {
        const l = t.alanDegeri.filter((s) => uygun(s, a.where))
        for (const s of l) { const eski = { ...s }; Object.assign(s, a.data); try { tekil(s) } catch (e) { Object.assign(s, eski); throw e } }
        return { count: l.length }
      },
      createMany: async (a: Arg) => { for (const d of a.data as Satir[]) t.alanDegeri.push(yeniSatir(d)); return { count: (a.data as Satir[]).length } },
      create: async (a: Arg) => { const s = yeniSatir(a.data as Satir); tekil(s); t.alanDegeri.push(s); return sec(s, a.select) },
    },
    belgeSayfa: { findMany: async (a: Arg) => t.belgeSayfa.filter((s) => uygun(s, a.where)).map((s) => sec(s, a.select)) },
    belge: { findMany: async (a: Arg) => t.belge.filter((s) => uygun(s, a.where)).map((s) => sec(s, a.select)) },
    rucuDosyasi: {
      findUnique: async (a: Arg) => { const s = t.rucuDosyasi.find((x) => uygun(x, a.where)); return s ? sec(s, a.select) : null },
      update: async (a: Arg) => { const s = t.rucuDosyasi.find((x) => uygun(x, a.where))!; Object.assign(s, a.data); return s },
    },
    odeme: {
      findMany: async (a: Arg) => t.odeme.filter((s) => uygun(s, a.where)).map((s) => sec(s, a.select)),
      create: async (a: Arg) => { t.odeme.push(a.data as Satir); return a.data },
    },
    aktivite: { create: async (a: Arg) => { t.aktivite.push(a.data as Satir); return a.data } },
  }
  return { db: db as unknown as Db, t }
}

const satir = (t: { alanDegeri: Satir[] }, alan: string) => t.alanDegeri.filter((s) => s.alan === alan)
const onayli = (t: { alanDegeri: Satir[] }, alan: string) => t.alanDegeri.filter((s) => s.alan === alan && s.durum === 'ONAYLI')

describe('alan kilidi: düzeltilen değer yeniden çıkarımda korunur (S18 kabul 3; B36)', () => {
  it('AI tutarı → avukat düzeltip onaylar → yeniden çıkarım kilidi ezmez, yeni değer ayrı öneri', async () => {
    const { db, t } = sahteDb()
    await onerileriKaydet(db, DOSYA, [{ alan: 'rucuTutari', deger: 12500, kaynakTuru: 'AI', uretici: 'AI:analizEt' }])
    const ai = satir(t, 'rucuTutari')[0]
    await oneriOnayla(db, { dosyaId: DOSYA, oneriId: ai.id as string, beklenenOnayliId: null, duzeltilmisDeger: '12.000,00', kullaniciId: 'avukat', yetki: AVUKAT })

    expect(ai.durum).toBe('REDDEDILDI')
    const kilit = onayli(t, 'rucuTutari')
    expect(kilit).toHaveLength(1)
    expect(kilit[0]).toMatchObject({ degerJson: 12000, kaynakTuru: 'ELLE', onaylayanId: 'avukat' })
    expect(Number(t.rucuDosyasi[0].rucuTutari)).toBe(12000)

    // "AI ile yeniden çıkar": aynı eski değer tekrar önerilmez, farklı yeni değer ayrı öneri olur
    const r1 = await onerileriKaydet(db, DOSYA, [{ alan: 'rucuTutari', deger: 12500, kaynakTuru: 'AI' }])
    expect(r1).toMatchObject({ eklenen: 0, atlanan: 1 })
    const r2 = await onerileriKaydet(db, DOSYA, [{ alan: 'rucuTutari', deger: 13000, kaynakTuru: 'AI' }])
    expect(r2.eklenen).toBe(1)
    expect(onayli(t, 'rucuTutari')[0].degerJson).toBe(12000)
    expect(Number(t.rucuDosyasi[0].rucuTutari)).toBe(12000)
    expect(satir(t, 'rucuTutari').filter((s) => s.durum === 'ONERI').map((s) => s.degerJson)).toEqual([13000])
  })

  it('öneri yazımı hiçbir kolona dokunmaz (yalnız onay aynalar)', async () => {
    const { db, t } = sahteDb()
    await onerileriKaydet(db, DOSYA, [{ alan: 'kazaTarihi', deger: '2026-03-14', kaynakTuru: 'KURAL' }, { alan: 'asilAlacak', deger: 5000, kaynakTuru: 'AI' }])
    expect(t.rucuDosyasi[0].kazaTarihi).toBeUndefined()
    expect(t.rucuDosyasi[0].asilAlacak).toBeUndefined()
  })
})

describe('iyimser kilit ve eşzamanlı onay (S18 kabul 5)', () => {
  it('iki sekmede aynı öneri: ikinci onay "az önce onaylandı"', async () => {
    const { db, t } = sahteDb()
    await onerileriKaydet(db, DOSYA, [{ alan: 'policeNo', deger: 'KRG-1', kaynakTuru: 'KURAL' }])
    const id = satir(t, 'policeNo')[0].id as string
    await oneriOnayla(db, { dosyaId: DOSYA, oneriId: id, beklenenOnayliId: null, kullaniciId: 'a', yetki: AVUKAT })
    await expect(oneriOnayla(db, { dosyaId: DOSYA, oneriId: id, beklenenOnayliId: null, kullaniciId: 'b', yetki: AVUKAT }))
      .rejects.toMatchObject({ kod: 'AZ_ONCE_ONAYLANDI' })
    expect(t.aktivite).toHaveLength(1)
  })

  it('başkası aynı alanı farklı değerle kilitlediyse eski ekranla onay durur; güncel kilitle değiştirilebilir', async () => {
    const { db, t } = sahteDb()
    await onerileriKaydet(db, DOSYA, [
      { alan: 'kazaTarihi', deger: '2026-03-14', kaynakTuru: 'KURAL', uretici: 'KURAL:KAZA_TARIHI@1' },
      { alan: 'kazaTarihi', deger: '2026-03-10', kaynakTuru: 'HUGO', uretici: 'HUGO:HASAR_TARIHI@1' },
    ])
    const [kural, hugo] = satir(t, 'kazaTarihi')
    const a = await oneriOnayla(db, { dosyaId: DOSYA, oneriId: kural.id as string, beklenenOnayliId: null, kullaniciId: 'a', yetki: AVUKAT })
    await expect(oneriOnayla(db, { dosyaId: DOSYA, oneriId: hugo.id as string, beklenenOnayliId: null, kullaniciId: 'b', yetki: AVUKAT }))
      .rejects.toMatchObject({ kod: 'KILIT_DEGISTI' })
    await oneriOnayla(db, { dosyaId: DOSYA, oneriId: hugo.id as string, beklenenOnayliId: a.onayliId, kullaniciId: 'b', yetki: AVUKAT })
    expect(kural.durum).toBe('ESKIDI')
    expect(onayli(t, 'kazaTarihi').map((s) => s.degerJson)).toEqual(['2026-03-10'])
    expect(t.rucuDosyasi[0].kazaTarihi).toEqual(new Date('2026-03-10T00:00:00.000Z'))
  })

  it('tekil indeks ihlali (P2002) tanınır', () => {
    expect(tekilIhlalMi({ code: 'P2002' })).toBe(true)
    expect(tekilIhlalMi(new Error('x'))).toBe(false)
  })

  it('reddedilmiş öneri onaylanamaz; ikinci ret "geçerli değil"', async () => {
    const { db, t } = sahteDb()
    await onerileriKaydet(db, DOSYA, [{ alan: 'policeNo', deger: 'KRG-1', kaynakTuru: 'KURAL' }])
    const id = satir(t, 'policeNo')[0].id as string
    await oneriReddet(db, { dosyaId: DOSYA, oneriId: id, kullaniciId: 'a', yetki: YARDIMCI, gerekce: 'Poliçe başka araca ait' })
    await expect(oneriReddet(db, { dosyaId: DOSYA, oneriId: id, kullaniciId: 'a', yetki: YARDIMCI })).rejects.toMatchObject({ kod: 'GECERSIZ' })
    await expect(oneriOnayla(db, { dosyaId: DOSYA, oneriId: id, beklenenOnayliId: null, kullaniciId: 'a', yetki: AVUKAT })).rejects.toMatchObject({ kod: 'GECERSIZ' })
    expect(t.aktivite[0]).toMatchObject({ detayJson: expect.objectContaining({ tur: 'ALAN_RET', gerekce: 'Poliçe başka araca ait' }) })
  })

  it('başka dosyanın önerisi bulunamaz (dosya kapsamı)', async () => {
    const { db, t } = sahteDb()
    await onerileriKaydet(db, DOSYA, [{ alan: 'policeNo', deger: 'KRG-1', kaynakTuru: 'KURAL' }])
    await expect(oneriOnayla(db, { dosyaId: 'baska-dosya', oneriId: satir(t, 'policeNo')[0].id as string, beklenenOnayliId: null, kullaniciId: 'a', yetki: AVUKAT }))
      .rejects.toBeInstanceOf(OneriHata)
  })
})

describe('yetki', () => {
  it('yardımcı kritik alanı (tutar) onaylayamaz; kritik olmayanı (poliçe no) onaylar', async () => {
    const { db, t } = sahteDb()
    await onerileriKaydet(db, DOSYA, [{ alan: 'rucuTutari', deger: 100, kaynakTuru: 'KURAL' }, { alan: 'policeNo', deger: 'KRG-1', kaynakTuru: 'KURAL' }])
    await expect(oneriOnayla(db, { dosyaId: DOSYA, oneriId: satir(t, 'rucuTutari')[0].id as string, beklenenOnayliId: null, kullaniciId: 'y', yetki: YARDIMCI }))
      .rejects.toMatchObject({ kod: 'YETKI' })
    await oneriOnayla(db, { dosyaId: DOSYA, oneriId: satir(t, 'policeNo')[0].id as string, beklenenOnayliId: null, kullaniciId: 'y', yetki: YARDIMCI })
    expect(t.rucuDosyasi[0].policeNo).toBe('KRG-1')
  })

  it('rücu sebebini yalnız avukat seçer', async () => {
    const { db } = sahteDb()
    await expect(elleOnayla(db, { dosyaId: DOSYA, alan: 'rucuSebebiKod', deger: 'B4_F', beklenenOnayliId: null, kullaniciId: 'y', yetki: YARDIMCI }))
      .rejects.toMatchObject({ kod: 'YETKI' })
  })
})

describe('kaynak ve alıntı (B37, B38)', () => {
  const belge = [{ id: 'b-ktt', dosyaId: DOSYA, silindiAt: null, kategori: 'TUTANAK', altTur: null, extractedText: null }, { id: 'b-eski', dosyaId: DOSYA, silindiAt: null, kategori: 'POLICE', altTur: null, extractedText: 'Poliçe No: KRG-7788' }]
  const belgeSayfa = [
    { belgeId: 'b-ktt', dosyaId: DOSYA, sayfaNo: 1, metin: 'KAZA TESPİT TUTANAĞI' },
    { belgeId: 'b-ktt', dosyaId: DOSYA, sayfaNo: 2, metin: 'Kaza Tarihi ve Saati: 14.03.2026 14:30' },
  ]

  it('alıntısı belgede bulunmayan AI önerisi "kaynaksız" (alintiDogru = false)', async () => {
    const { db, t } = sahteDb({ belge, belgeSayfa })
    const r = await onerileriKaydet(db, DOSYA, [{ alan: 'kusur.oran', deger: '% 100', kaynakTuru: 'AI', kaynakBelgeId: 'b-ktt', sayfa: 2, alinti: 'Kusur oranı %100 karşı araçta' }])
    expect(r.kaynaksiz).toBe(1)
    expect(satir(t, 'kusur.oran')[0].alintiDogru).toBe(false)
  })

  it('alıntı aynı belgenin başka sayfasındaysa sayfa düzeltilir; eski belgede extractedText tek sayfa sayılır', async () => {
    const { db, t } = sahteDb({ belge, belgeSayfa })
    await onerileriKaydet(db, DOSYA, [
      { alan: 'kazaTarihi', deger: '2026-03-14', kaynakTuru: 'AI', kaynakBelgeId: 'b-ktt', sayfa: 1, alinti: 'Kaza Tarihi ve Saati: 14.03.2026 14:30' },
      { alan: 'policeNo', deger: 'KRG-7788', kaynakTuru: 'KURAL', kaynakBelgeId: 'b-eski', sayfa: 1, alinti: 'Poliçe No: KRG-7788' },
    ])
    expect(satir(t, 'kazaTarihi')[0]).toMatchObject({ alintiDogru: true, sayfa: 2, kaynakBelgeId: 'b-ktt' })
    expect(satir(t, 'policeNo')[0]).toMatchObject({ alintiDogru: true, sayfa: 1 })
  })

  it('Hugo satırının hücre alıntısı belgede aranmaz (kaynaksız sayılmaz)', async () => {
    const { db, t } = sahteDb({ belge, belgeSayfa })
    await onerileriKaydet(db, DOSYA, [{ alan: 'rucuTutari', deger: 123.46, kaynakTuru: 'HUGO', alinti: 'Rücu Tutarı: 123,456.00' }])
    expect(satir(t, 'rucuTutari')[0].alintiDogru).toBeNull()
  })

  it('başka dosyanın belgesine bağ kurulmaz', async () => {
    const { db, t } = sahteDb({ belge, belgeSayfa })
    await onerileriKaydet(db, DOSYA, [{ alan: 'policeNo', deger: 'KRG-1', kaynakTuru: 'AI', kaynakBelgeId: 'baska-dosyanin-belgesi', sayfa: 3 }])
    expect(satir(t, 'policeNo')[0]).toMatchObject({ kaynakBelgeId: null, sayfa: null })
  })

  it('AI\'ın yetkili icra önerisi yazılmaz; geçersiz değer sayılır', async () => {
    const { db, t } = sahteDb()
    const r = await onerileriKaydet(db, DOSYA, [{ alan: 'yetkiliIcra', deger: 'Adana İcra Dairesi', kaynakTuru: 'AI' }, { alan: 'kazaTarihi', deger: '99.99.2026', kaynakTuru: 'KURAL' }])
    expect(r.eklenen).toBe(0)
    expect(r.gecersiz).toHaveLength(2)
    expect(t.alanDegeri).toEqual([])
  })
})

describe('onay anında ayna (M5; B37)', () => {
  it('dekont önerisi onaylanınca Odeme satırı açılır; faiz başlangıcı değişmez; aynı ödeme ikinci kez açılmaz', async () => {
    const { db, t } = sahteDb({ odeme: [], cikarimJson: { onay: { ok: true }, tevzi: { daire: 'kurgu' } } })
    await onerileriKaydet(db, DOSYA, [{ alan: 'odeme[2026-03-14|12500.00]', deger: { tarih: '2026-03-14', tutar: 12500 }, kaynakTuru: 'KURAL' }])
    expect(t.odeme).toHaveLength(0) // öneri ödeme DEĞİLDİR
    await oneriOnayla(db, { dosyaId: DOSYA, oneriId: satir(t, 'odeme[2026-03-14|12500.00]')[0].id as string, beklenenOnayliId: null, kullaniciId: 'a', yetki: AVUKAT })
    expect(t.odeme).toHaveLength(1)
    expect(t.odeme[0]).toMatchObject({ dosyaId: DOSYA, tarih: new Date('2026-03-14T00:00:00.000Z'), anaOdemeMi: false, haricMi: false })
    expect(Number(t.odeme[0].tutar)).toBe(12500)
    expect(t.rucuDosyasi[0].faizBaslangic).toEqual(new Date('2026-01-01T00:00:00Z'))
    // takibe giden veri değişti → avukatın "takibe hazır" onayı düşer; tevzi kaydı korunur
    expect(t.rucuDosyasi[0].cikarimJson).toEqual({ tevzi: { daire: 'kurgu' } })
  })

  it('Odeme\'de aynı gün + tutar varsa yeni satır açılmaz', async () => {
    const { db, t } = sahteDb({ odeme: [{ dosyaId: DOSYA, tarih: new Date('2026-03-14T00:00:00Z'), tutar: 12500 }] })
    await onerileriKaydet(db, DOSYA, [{ alan: 'odeme[2026-03-14|12500.00]', deger: { tarih: '2026-03-14', tutar: 12500 }, kaynakTuru: 'AI' }])
    await oneriOnayla(db, { dosyaId: DOSYA, oneriId: t.alanDegeri[0].id as string, beklenenOnayliId: null, kullaniciId: 'a', yetki: AVUKAT })
    expect(t.odeme).toHaveLength(1)
  })

  it('Aktivite\'ye plaka maskeli yazılır; onaylı değerle aynı bekleyen öneriler eskir', async () => {
    const { db, t } = sahteDb()
    await onerileriKaydet(db, DOSYA, [
      { alan: 'karsiPlaka', deger: '34 KRG 001', kaynakTuru: 'KURAL' },
      { alan: 'karsiPlaka', deger: '34krg001', kaynakTuru: 'AI' },
    ])
    const [kural, ai] = satir(t, 'karsiPlaka')
    await oneriOnayla(db, { dosyaId: DOSYA, oneriId: kural.id as string, beklenenOnayliId: null, kullaniciId: 'a', yetki: AVUKAT })
    expect(ai.durum).toBe('ESKIDI')
    expect(String(t.aktivite[0].eylem)).toContain('34 ••• •01')
    expect(String(t.aktivite[0].eylem)).not.toContain('KRG')
    expect(t.rucuDosyasi[0].karsiPlaka).toBe('34 KRG 001')
  })
})

describe('elle seçim ve toplu onay', () => {
  it('rücu sebebi seçimi aynı koddaki Hugo önerisini onaylar (kaynak Hugo kalır); tekrar seçim değişiklik yapmaz', async () => {
    const { db, t } = sahteDb()
    await onerileriKaydet(db, DOSYA, [{ alan: 'rucuSebebiKod', deger: 'KASKO_HIZMET_KUSURU', kaynakTuru: 'HUGO', uretici: 'HUGO:RUCU_NEDENI@1' }])
    const r = await elleOnayla(db, { dosyaId: DOSYA, alan: 'rucuSebebiKod', deger: 'KASKO_HIZMET_KUSURU', beklenenOnayliId: null, kullaniciId: 'a', yetki: AVUKAT })
    expect(onayli(t, 'rucuSebebiKod')[0]).toMatchObject({ kaynakTuru: 'HUGO', id: r.onayliId })
    expect(t.rucuDosyasi[0].rucuSebebiKod).toBe('KASKO_HIZMET_KUSURU')
    const tekrar = await elleOnayla(db, { dosyaId: DOSYA, alan: 'rucuSebebiKod', deger: 'KASKO_HIZMET_KUSURU', beklenenOnayliId: r.onayliId, kullaniciId: 'a', yetki: AVUKAT })
    expect(tekrar).toEqual({ onayliId: r.onayliId, degismedi: true })
  })

  it('farklı kod seçimi eski kilidi eskitir, "Elle" kaynaklı yeni kilit açar', async () => {
    const { db, t } = sahteDb()
    const a = await elleOnayla(db, { dosyaId: DOSYA, alan: 'rucuSebebiKod', deger: 'KASKO_HALEFIYET', beklenenOnayliId: null, kullaniciId: 'a', yetki: AVUKAT })
    await elleOnayla(db, { dosyaId: DOSYA, alan: 'rucuSebebiKod', deger: 'KASKO_HIZMET_KUSURU', beklenenOnayliId: a.onayliId, kullaniciId: 'a', yetki: AVUKAT, uretici: 'SECIM:RUCU_SEBEBI' })
    expect(satir(t, 'rucuSebebiKod').map((s) => [s.degerJson, s.durum, s.kaynakTuru])).toEqual([
      ['KASKO_HALEFIYET', 'ESKIDI', 'ELLE'], ['KASKO_HIZMET_KUSURU', 'ONAYLI', 'ELLE'],
    ])
  })

  it('yetkili icra seçimi daire adını kolona yazar', async () => {
    const { db, t } = sahteDb()
    await elleOnayla(db, { dosyaId: DOSYA, alan: 'yetkiliIcra', deger: { icraDairesi: 'Adana İcra Dairesi', secenek: 'KAZA_YERI', gerekce: 'Kaza yeri' }, beklenenOnayliId: null, kullaniciId: 'a', yetki: AVUKAT })
    expect(t.rucuDosyasi[0].yetkiliIcra).toBe('Adana İcra Dairesi')
  })

  it('toplu onay yalnız uygun olanı onaylar (kural + doğru alıntı, kritik olmayan)', async () => {
    const { db, t } = sahteDb({ belge: [{ id: 'b', dosyaId: DOSYA, silindiAt: null, kategori: 'POLICE', altTur: null, extractedText: null }], belgeSayfa: [{ belgeId: 'b', dosyaId: DOSYA, sayfaNo: 1, metin: 'Poliçe No: KRG-1\nPlaka: 34 KRG 001' }] })
    await onerileriKaydet(db, DOSYA, [
      { alan: 'policeNo', deger: 'KRG-1', kaynakTuru: 'KURAL', kaynakBelgeId: 'b', sayfa: 1, alinti: 'Poliçe No: KRG-1', uretici: 'KURAL:POLICE_NO@1' },
      { alan: 'rucuTutari', deger: 100, kaynakTuru: 'KURAL', kaynakBelgeId: 'b', sayfa: 1, alinti: 'Poliçe No: KRG-1', uretici: 'KURAL:DEKONT@1' },
      { alan: 'karsiPlaka', deger: '34 KRG 001', kaynakTuru: 'AI', kaynakBelgeId: 'b', sayfa: 1, alinti: 'Plaka: 34 KRG 001' },
    ])
    const r = await topluOnayla(db, { dosyaId: DOSYA, oneriIds: t.alanDegeri.map((s) => s.id as string), kullaniciId: 'y', yetki: YARDIMCI })
    expect(r).toEqual({ onaylanan: 1, atlanan: 2 })
    expect(t.alanDegeri.filter((s) => s.durum === 'ONAYLI').map((s) => s.alan)).toEqual(['policeNo'])
  })
})
