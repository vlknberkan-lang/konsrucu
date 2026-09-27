/**
 * S26 · müvekkil onayı kapısı (B16; açık karar 4): onay kaydı yokken kilitli; RET kapalı; süre koruma istisnası
 * yalnız DAVA_ACMA'da ve ihtiyatlı İİK 67 son güne ≤ 14 gün kaldıysa, yazılı gerekçeyle.
 */
import { describe, expect, it } from 'vitest'
import { istisnaDogrula, istisnaMumkunMu, musteriOnayiKapisi, onaySiniri, type OnayKaydiOzet } from '@/lib/konsrucu/arabuluculuk/onay'

const SIMDI = new Date('2026-09-27T09:00:00Z')
const o = (p: Partial<OnayKaydiOzet>): OnayKaydiOzet => ({ id: Math.random().toString(36), tur: 'DAVA_ACMA', sonuc: 'BEKLIYOR', alinmaAt: null, istisnaGerekce: null, ...p })

describe('musteriOnayiKapisi', () => {
  it('kayıt yoksa kilitli', () => {
    const k = musteriOnayiKapisi('DAVA_ACMA', [], { simdi: SIMDI })
    expect(k.acik).toBe(false)
    if (!k.acik) expect(k.neden).toBe('YOK')
  })
  it('bekleyen talep kapıyı açmaz', () => {
    const k = musteriOnayiKapisi('DAVA_ACMA', [o({ sonuc: 'BEKLIYOR' })], { simdi: SIMDI })
    expect(k.acik).toBe(false)
    if (!k.acik) expect(k.neden).toBe('BEKLIYOR')
  })
  it('ONAY kapıyı açar; en son karar geçerlidir (RET sonra gelirse kapalı)', () => {
    expect(musteriOnayiKapisi('DAVA_ACMA', [o({ sonuc: 'ONAY', alinmaAt: new Date('2026-08-01') })], { simdi: SIMDI }).acik).toBe(true)
    const k = musteriOnayiKapisi('DAVA_ACMA', [o({ sonuc: 'ONAY', alinmaAt: new Date('2026-08-01') }), o({ sonuc: 'RET', alinmaAt: new Date('2026-08-10') })], { simdi: SIMDI })
    expect(k.acik).toBe(false)
    if (!k.acik) expect(k.neden).toBe('RET')
  })
  it('başka türdeki onay bu kapıyı açmaz; silinmiş onay sayılmaz', () => {
    expect(musteriOnayiKapisi('DAVA_ACMA', [o({ tur: 'SULH_ISKONTO', sonuc: 'ONAY', alinmaAt: new Date('2026-08-01') })], { simdi: SIMDI }).acik).toBe(false)
    expect(musteriOnayiKapisi('DAVA_ACMA', [o({ sonuc: 'ONAY', alinmaAt: new Date('2026-08-01'), silindiAt: new Date() })], { simdi: SIMDI }).acik).toBe(false)
  })
  it('istisna: ≤ 14 gün kala gerekçeli bekleyen kayıt kapıyı açar; > 14 gün açmaz', () => {
    const istisna = o({ sonuc: 'BEKLIYOR', istisnaGerekce: 'Son güne 10 gün kaldı, müvekkile ulaşılamadı.' })
    const yakin = musteriOnayiKapisi('DAVA_ACMA', [istisna], { simdi: SIMDI, ihtiyatliSonGun: new Date('2026-10-07') }) // 10 gün
    expect(yakin.acik).toBe(true)
    if (yakin.acik) expect(yakin.neden).toBe('ISTISNA')
    const uzak = musteriOnayiKapisi('DAVA_ACMA', [istisna], { simdi: SIMDI, ihtiyatliSonGun: new Date('2026-11-30') })
    expect(uzak.acik).toBe(false)
  })
  it('kanun yolu kapısı davaya bağlı onayı okur', () => {
    const kanun = o({ tur: 'KANUN_YOLU', sonuc: 'ONAY', alinmaAt: new Date('2026-09-01'), davaId: 'dava-1' })
    expect(musteriOnayiKapisi('KANUN_YOLU', [kanun], { davaId: 'dava-1', simdi: SIMDI }).acik).toBe(true)
    expect(musteriOnayiKapisi('KANUN_YOLU', [kanun], { davaId: 'dava-2', simdi: SIMDI }).acik).toBe(false)
  })
})

describe('istisna', () => {
  it('istisnaMumkunMu yalnız DAVA_ACMA ve ≤ 14 gün', () => {
    expect(istisnaMumkunMu('DAVA_ACMA', new Date('2026-10-11'), SIMDI)).toEqual({ mumkun: true, kalanGun: 14 })
    expect(istisnaMumkunMu('DAVA_ACMA', new Date('2026-10-12'), SIMDI).mumkun).toBe(false)
    expect(istisnaMumkunMu('SULH_ISKONTO', new Date('2026-10-01'), SIMDI).mumkun).toBe(false)
    expect(istisnaMumkunMu('DAVA_ACMA', null, SIMDI).mumkun).toBe(false)
  })
  it('istisnaDogrula: gerekçe zorunlu, eşik dışı reddedilir', () => {
    expect(istisnaDogrula({ tur: 'DAVA_ACMA', gerekce: 'kısa', ihtiyatliSonGun: new Date('2026-10-01'), simdi: SIMDI }).ok).toBe(false)
    expect(istisnaDogrula({ tur: 'DAVA_ACMA', gerekce: 'Müvekkile ulaşılamadı, süre dolmak üzere.', ihtiyatliSonGun: new Date('2026-12-01'), simdi: SIMDI }).ok).toBe(false)
    expect(istisnaDogrula({ tur: 'DAVA_ACMA', gerekce: 'Müvekkile ulaşılamadı, süre dolmak üzere.', ihtiyatliSonGun: new Date('2026-10-01'), simdi: SIMDI }).ok).toBe(true)
    expect(istisnaDogrula({ tur: 'KANUN_YOLU', gerekce: 'Müvekkile ulaşılamadı, süre dolmak üzere.', ihtiyatliSonGun: new Date('2026-10-01'), simdi: SIMDI }).ok).toBe(false)
  })
})

describe('onaySiniri', () => {
  it('en son SULH_ISKONTO onayının tutarını verir; yoksa null', () => {
    expect(onaySiniri([])).toBeNull()
    const s = onaySiniri([o({ tur: 'SULH_ISKONTO', sonuc: 'ONAY', alinmaAt: new Date('2026-08-01'), tutar: 150000, onaylayanUnvan: 'Birim Müdürü' })])
    expect(s).toMatchObject({ tutar: 150000, unvan: 'Birim Müdürü' })
  })
})
