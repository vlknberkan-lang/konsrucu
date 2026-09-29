import { describe, expect, it } from 'vitest'
import { kopruPlani } from '@/lib/konsrucu/eksen/sure-kopru'
import { sureOnerisiHesapla } from '@/lib/konsrucu/sure/hesap'
import { sureTuru } from '@/lib/konsrucu/sure/turler'
import { isoGun, isoGundenTarih } from '@/lib/konsrucu/sure/takvim'

const gun = (s: string) => isoGundenTarih(s)!

describe('İİK 68 — itirazla İİK 67 yanında öneri (29.09 denetimi)', () => {
  it('itiraz onaylanınca İİK 67 ve İİK 68 birlikte açılır', () => {
    const plan = kopruPlani({
      bt: { tebligTarihi: null, tebligSekli: null, tebligSonucu: null, uetsUlasmaTarihi: null, tebligKaynakBelgeId: null, itirazVar: true, itirazVerilisTarihi: gun('2026-03-10'), itirazUyapTarihi: null, itirazKaynakBelgeId: null, itirazAlacakliyaTebligTarihi: null } as never,
      acikSureler: [],
    })
    expect(plan.filter((p) => p.islem === 'AC').map((p) => p.tur).sort()).toEqual(['IIK67', 'IIK68'])
  })
  it('tebliğ yoksa ihtiyatlı alt sınır itiraz tarihi + 6 ay; tebliğ varsa tebliğ + 6 ay', () => {
    const iht = sureOnerisiHesapla({ tur: 'IIK68', tetikTarihi: null, tetikTuru: null, uetsUlasmaTarihi: null, itirazTarihi: gun('2026-03-10') })
    expect(iht.onerilenIhtiyatli && isoGun(iht.onerilenIhtiyatli)).toBe('2026-09-10')
    const teb = sureOnerisiHesapla({ tur: 'IIK68', tetikTarihi: gun('2026-08-31'), tetikTuru: 'TEBLIG', uetsUlasmaTarihi: null })
    expect(teb.onerilenIhtiyatli && isoGun(teb.onerilenIhtiyatli)).toBe('2027-02-28')
  })
  it('İİK 68 e-posta göndermez; İİK 106 gönderir ve hak düşürücüdür', () => {
    expect(sureTuru('IIK68').eposta).toBe(false)
    expect(sureTuru('IIK106')).toMatchObject({ eposta: true, hakDusurucu: true, kural: { tip: 'AY', ay: 6 } })
  })
})
