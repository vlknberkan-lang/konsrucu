import { describe, expect, it } from 'vitest'
import {
  epostaKipi, gonderimSaatiMi, guncelEsik, hatirlatmaHedefi, hatirlatmaKarari, hatirlatmaKaydiEkle, tekillestir, EN_COK_DENEME, type HatirlatmaKaydi,
} from '@/lib/konsrucu/sure/hatirlatma'
import { gorunumDurumu, sureSimdiOnerisi, type SureSatiri } from '@/lib/konsrucu/sure/gorunum'
import { gunEkle, isoGun, isoGundenTarih } from '@/lib/konsrucu/sure/takvim'

const g = (s: string) => isoGundenTarih(s) as Date
// İstanbul 2026-10-01 10:00 (07:00 UTC)
const SIMDI = new Date('2026-10-01T07:00:00Z')
const GERCEK = { kip: 'resend', gercek: true }
const KONSOL = { kip: 'console', gercek: false }

const sure = (p: Partial<{ durum: string; tur: string; onaylananSonGun: Date | null; onerilenIhtiyatli: Date | null; hatirlatmaJson: unknown; silindiAt: Date | null }> = {}) => ({
  durum: 'ACIK', tur: 'IIK67', onaylananSonGun: null, onerilenIhtiyatli: null, hatirlatmaJson: null, silindiAt: null, ...p,
})

describe('S24 · hatırlatma kararı (7-3-1, mükerrer yok)', () => {
  it('güncel eşik: 7..4 → 7, 3..2 → 3, 1..0 → 1; pencere dışı ve geçmiş → yok', () => {
    expect([8, 7, 5, 4, 3, 2, 1, 0, -1].map(guncelEsik)).toEqual([null, 7, 7, 7, 3, 3, 1, 1, null])
  })

  it('onaylanan gün varsa ona, yoksa ihtiyatlı öneriye göre planlanır', () => {
    expect(hatirlatmaHedefi({ onaylananSonGun: g('2026-10-20'), onerilenIhtiyatli: g('2026-10-04') })?.kaynak).toBe('ONAYLANAN')
    const k = hatirlatmaKarari(sure({ onerilenIhtiyatli: gunEkle(g('2026-10-01'), 3) }), SIMDI, GERCEK)
    expect(k).toMatchObject({ gonder: true, esik: 3, kaynak: 'IHTIYATLI', kalan: 3 })
    const k2 = hatirlatmaKarari(sure({ onerilenIhtiyatli: g('2026-10-04'), onaylananSonGun: g('2026-10-20') }), SIMDI, GERCEK)
    expect(k2).toMatchObject({ gonder: false, sebep: 'pencere dışında' })
  })

  it('aynı eşik ve aynı son gün için ikinci kez gitmez; son gün değişince eşikler yeniden sayılır', () => {
    const hedef = gunEkle(g('2026-10-01'), 3)
    const gonderildi: HatirlatmaKaydi = { esik: 3, hedef: isoGun(hedef), kaynak: 'IHTIYATLI', at: SIMDI.toISOString(), kip: 'resend', gonderildi: true }
    expect(hatirlatmaKarari(sure({ onerilenIhtiyatli: hedef, hatirlatmaJson: [gonderildi] }), SIMDI, GERCEK)).toMatchObject({ gonder: false })
    // avukat onaylanan günü girdi: aynı eşik ama farklı hedef gün → yeniden gider
    const onay = gunEkle(g('2026-10-01'), 2)
    expect(hatirlatmaKarari(sure({ onerilenIhtiyatli: hedef, onaylananSonGun: onay, hatirlatmaJson: [gonderildi] }), SIMDI, GERCEK)).toMatchObject({ gonder: true, esik: 3, kaynak: 'ONAYLANAN' })
  })

  it('console kipi: gönderilmiş sayılmaz; aynı eşik console kaydıyla tekrar yazılmaz; gerçek kipe geçince gider', () => {
    const hedef = gunEkle(g('2026-10-01'), 1)
    expect(hatirlatmaKarari(sure({ onerilenIhtiyatli: hedef }), SIMDI, KONSOL)).toMatchObject({ gonder: true, esik: 1 })
    const konsolKaydi: HatirlatmaKaydi = { esik: 1, hedef: isoGun(hedef), kaynak: 'IHTIYATLI', at: SIMDI.toISOString(), kip: 'console', gonderildi: false }
    expect(hatirlatmaKarari(sure({ onerilenIhtiyatli: hedef, hatirlatmaJson: [konsolKaydi] }), SIMDI, KONSOL)).toMatchObject({ gonder: false })
    expect(hatirlatmaKarari(sure({ onerilenIhtiyatli: hedef, hatirlatmaJson: [konsolKaydi] }), SIMDI, GERCEK)).toMatchObject({ gonder: true })
  })

  it('gerçek kipte başarısız gönderim en çok 3 kez denenir', () => {
    const hedef = gunEkle(g('2026-10-01'), 7)
    const hata = (i: number): HatirlatmaKaydi => ({ esik: 7, hedef: isoGun(hedef), kaynak: 'IHTIYATLI', at: `2026-10-01T0${i}:00:00Z`, kip: 'resend', gonderildi: false, hata: 'x' })
    expect(hatirlatmaKarari(sure({ onerilenIhtiyatli: hedef, hatirlatmaJson: [hata(1), hata(2)] }), SIMDI, GERCEK)).toMatchObject({ gonder: true })
    expect(hatirlatmaKarari(sure({ onerilenIhtiyatli: hedef, hatirlatmaJson: Array.from({ length: EN_COK_DENEME }, (_, i) => hata(i)) }), SIMDI, GERCEK)).toMatchObject({ gonder: false, sebep: 'deneme sınırı' })
  })

  it('kapalı, silinmiş ve e-posta almayan türler (İİK 62, İİK 78) hatırlatılmaz', () => {
    const hedef = gunEkle(g('2026-10-01'), 1)
    expect(hatirlatmaKarari(sure({ onerilenIhtiyatli: hedef, durum: 'KAPANDI' }), SIMDI, GERCEK).gonder).toBe(false)
    expect(hatirlatmaKarari(sure({ onerilenIhtiyatli: hedef, silindiAt: SIMDI }), SIMDI, GERCEK).gonder).toBe(false)
    expect(hatirlatmaKarari(sure({ onerilenIhtiyatli: hedef, tur: 'IIK78' }), SIMDI, GERCEK).gonder).toBe(false)
    expect(hatirlatmaKarari(sure({ onerilenIhtiyatli: hedef, tur: 'IIK62' }), SIMDI, GERCEK).gonder).toBe(false)
    expect(hatirlatmaKarari(sure({ onerilenIhtiyatli: hedef, tur: 'HMK345' }), SIMDI, GERCEK).gonder).toBe(true)
  })

  it('aynı dosya + tür + borçlu için tek temsilci: onaylanan günü olan seçilir, diğerinin geçmişi taşınır', () => {
    const kayit: HatirlatmaKaydi = { esik: 7, hedef: '2026-10-08', kaynak: 'IHTIYATLI', at: SIMDI.toISOString(), kip: 'resend', gonderildi: true }
    const r = tekillestir([
      { id: 'a', dosyaId: 'd1', tur: 'IIK67', borcluId: 'b1', onaylananSonGun: null, onerilenIhtiyatli: g('2026-10-08'), hatirlatmaJson: [kayit] },
      { id: 'b', dosyaId: 'd1', tur: 'IIK67', borcluId: 'b1', onaylananSonGun: g('2026-10-20'), onerilenIhtiyatli: g('2026-10-08'), hatirlatmaJson: null },
      { id: 'c', dosyaId: 'd1', tur: 'IIK67', borcluId: 'b2', onaylananSonGun: null, onerilenIhtiyatli: g('2026-10-08'), hatirlatmaJson: null },
    ])
    expect(r).toHaveLength(2)
    const b1 = r.find((x) => x.sure.borcluId === 'b1')!
    expect(b1.sure.id).toBe('b')
    expect(b1.atlananIds).toEqual(['a'])
    expect(b1.digerGecmis).toEqual([kayit])
  })

  it('kayıt geçmişi sınırlanır; bozuk JSON yok sayılır', () => {
    const k: HatirlatmaKaydi = { esik: 1, hedef: '2026-10-02', kaynak: 'IHTIYATLI', at: SIMDI.toISOString(), kip: 'console', gonderildi: false }
    expect(hatirlatmaKaydiEkle([{ bozuk: true }, 'x'], k)).toEqual([k])
    expect(hatirlatmaKaydiEkle(Array.from({ length: 50 }, () => k), k, 40)).toHaveLength(40)
  })

  it('e-posta kipi varsayılan console; gönderim İstanbul 08:00 sonrası', () => {
    expect(epostaKipi({})).toEqual({ kip: 'console', gercek: false })
    expect(epostaKipi({ EMAIL_SERVICE: 'Resend' })).toEqual({ kip: 'resend', gercek: true })
    expect(gonderimSaatiMi(new Date('2026-10-01T04:59:00Z'))).toBe(false) // 07:59 İstanbul
    expect(gonderimSaatiMi(new Date('2026-10-01T05:00:00Z'))).toBe(true) // 08:00 İstanbul
  })
})

describe('S24 · GN-04 Şimdi kartı ve görünüm durumu', () => {
  const satir = (p: Partial<SureSatiri>): SureSatiri => ({
    id: 's', dosyaId: 'd', dosyaNo: 'HK-KURGU-1', icraNo: null, borcluId: null, borcluEtiket: null, davaId: null, tur: 'IIK67', turEtiket: 'İİK 67',
    turAd: 'İtirazın iptali davası süresi', grupEtiket: 'İcra takibi', dayanak: 'İİK 67/1', kritik: true, tetikAciklama: 'x', tetikTarihi: null, tetikTuru: null,
    uetsUlasmaTarihi: null, hakimSuresiGun: null, kesinSureIhtari: null, kaynakAlinti: null, kaynakBelgeId: null, onerilenIhtiyatli: null, onerilenSonGun: null,
    onaylananSonGun: null, onaylayanAd: null, onayAt: null, bakilanEvrak: null, ikinciTeyitAd: null, ikinciTeyitAt: null, onaylayanId: null, sorumluAd: null,
    durum: 'ACIK', kapanisNot: null, kapanisAt: null, kapanisKanitiBelgeId: null, iz: [], uyarilar: [], eksik: null, hatirlatmalar: [], ...p,
  })

  it('onaysız ve 10 gün kalan süre GN-04 olarak en üste çıkar; onaylı 30 günlük süre çıkmaz', () => {
    const on = satir({ id: 'on', onerilenIhtiyatli: gunEkle(g('2026-10-01'), 10).toISOString() })
    const onayli = satir({ id: 'onayli', onaylananSonGun: gunEkle(g('2026-10-01'), 30).toISOString(), onerilenIhtiyatli: gunEkle(g('2026-10-01'), 30).toISOString() })
    const uzak = satir({ id: 'uzak', onerilenIhtiyatli: gunEkle(g('2026-10-01'), 40).toISOString() })
    const o = sureSimdiOnerisi([uzak, onayli, on], SIMDI)
    expect(o).toMatchObject({ kod: 'GN-04', sureId: 'on', kalanGun: 10, rol: 'A+2', eylem: 'Son günü onayla' })
    expect(o?.metin).toContain('teyit gerekli')
    expect(gorunumDurumu(on, SIMDI)).toBe('ONAYSIZ')
    expect(gorunumDurumu(onayli, SIMDI)).toBe('ACIK')
  })

  it('onaylı süreye 7 gün ya da az kalınca GN-05; geçmiş onaysız süre GN-04 olarak kalır', () => {
    const onayli = satir({ id: 'y', onaylananSonGun: gunEkle(g('2026-10-01'), 5).toISOString() })
    expect(sureSimdiOnerisi([onayli], SIMDI)).toMatchObject({ kod: 'GN-05', kalanGun: 5 })
    const gecmis = satir({ id: 'g', onerilenIhtiyatli: gunEkle(g('2026-10-01'), -3).toISOString() })
    expect(sureSimdiOnerisi([onayli, gecmis], SIMDI)).toMatchObject({ kod: 'GN-04', sureId: 'g', kalanGun: -3 })
    expect(gorunumDurumu(gecmis, SIMDI)).toBe('GECTI')
  })
})
