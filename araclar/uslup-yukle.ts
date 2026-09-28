/**
 * KonsRücü — Üslup kartı (UslupKurali) yükleme CLI · araclar/uslup-yukle.ts
 *
 * S36/07: `rucu-hukuk-asistani/bilgi-bankasi/dilekce/anatomi-ve-uslup.md` §1 "Mutlak yasaklar (kalite kapısı:
 * ENGEL)" — Y1-Y9 tablosu + "Mutlak ifadeler" paragrafı — `UslupKurali`ya yükler (bkz.
 * `lib/konsrucu/dilekce-v2/uslup-kaynak.ts`). §2 vd. anlatı/kontrol listesidir, kural DEĞİLDİR; buraya girmez.
 *
 * `UslupKurali` şemasında (musteriId, kod) gibi doğal bir tekillik anahtarı yok; idempotentlik `metin`in
 * BAŞINDAKİ `[Y1] ` önekiyle sağlanır (bkz. uslup-kaynak.ts başlığı). Yüklenen satırlar HER ZAMAN
 * `durum='ONERI'` başlar (elle giriş akışı olan `uslupKaydetVeOnayla`nın aksine otomatik ONAYLI OLMAZ) —
 * avukat `/dilekceler/sablon` ekranından inceleyip onaylar ya da pasife alır.
 *
 * Kullanım (proje kökünden):
 *   JITI_TSCONFIG_PATHS=true node node_modules/jiti/lib/jiti-cli.mjs araclar/uslup-yukle.ts --musteri=Zurich
 *       → KURU çalıştırma (varsayılan): eklenecek/yeni sürüm/aynı kalacak + plan hash.
 *
 *   ... araclar/uslup-yukle.ts --musteri=Zurich --uygula --plan=<kuru çalıştırmanın verdiği hash>
 *       → gerçek yükleme (tek transaction, hepsi durum='ONERI').
 *
 *   ... araclar/uslup-yukle.ts --musteri=Zurich --pasif=<yuklemeId> [--uygula]
 *       → o yuklemeId ile yazılmış AMA HENÜZ ONAYLANMAMIŞ (durum='ONERI') satırları pasife alır (durum='PASIF').
 *
 *   --kaynak=<dosya> ile bilgi bankası md dosyası değiştirilebilir (varsayılan: VARSAYILAN_KAYNAK_DOSYASI).
 *
 * jiti + JITI_TSCONFIG_PATHS=true gerekli değildir (bu script ve uslup-kaynak.ts yalnız göreli import ve
 * `node:crypto`/`node:fs` kullanır) ama sablon-yukle.ts ile aynı çalıştırma biçimi belgelenir (tutarlılık).
 */
import fs from 'node:fs'
import { PrismaClient } from '@prisma/client'
import {
  anatomiUslupKurallariCikar,
  uslupYuklemePlani,
  UslupKaynakHatasi,
  type AnatomiKuralAdayi,
} from '../lib/konsrucu/dilekce-v2/uslup-kaynak'
import { argDegeri, bayrakVar, musteriBul, yuklemeIdUret } from './_ortak'

const VARSAYILAN_KAYNAK_DOSYASI =
  'C:\\Users\\SENFONİ-Berkan\\Desktop\\Yazılım\\rucu-hukuk-asistani\\bilgi-bankasi\\dilekce\\anatomi-ve-uslup.md'

async function main() {
  const musteriOnEk = argDegeri('musteri')
  if (!musteriOnEk) {
    console.error('Kullanım: --musteri=<ad öneki, ör. Zurich> [--kaynak=<dosya>] [--uygula --plan=<hash>] | --pasif=<yuklemeId> [--uygula]')
    process.exitCode = 1
    return
  }
  const kaynakDosyasi = argDegeri('kaynak') ?? VARSAYILAN_KAYNAK_DOSYASI

  const db = new PrismaClient()
  try {
    const musteri = await musteriBul(db, musteriOnEk)
    console.log(`Müvekkil: ${musteri.ad} (${musteri.id})`)

    const pasifId = argDegeri('pasif')
    if (pasifId) {
      const uygula = bayrakVar('uygula')
      const hedefler = await db.uslupKurali.findMany({
        where: { musteriId: musteri.id, yuklemeId: pasifId, durum: 'ONERI' },
        select: { id: true, metin: true, surum: true },
      })
      console.log(`${uygula ? 'UYGULANDI' : 'KURU ÇALIŞTIRMA'}: yükleme "${pasifId}" → ${hedefler.length} onaysız kural${uygula ? ' pasife alındı' : ' pasife alınacak'}: ${hedefler.map((h) => `${(/^\[([A-Z_0-9]+)\]/.exec(h.metin)?.[1]) ?? h.id}@${h.surum}`).join(', ') || '(yok)'}`)
      if (uygula && hedefler.length) {
        await db.uslupKurali.updateMany({ where: { id: { in: hedefler.map((h) => h.id) } }, data: { durum: 'PASIF' } })
      }
      return
    }

    console.log(`Kaynak dosya: ${kaynakDosyasi}`)
    let adaylar: AnatomiKuralAdayi[]
    try {
      adaylar = anatomiUslupKurallariCikar(fs.readFileSync(kaynakDosyasi, 'utf8'))
    } catch (e) {
      throw new Error(e instanceof UslupKaynakHatasi ? `Ayrıştırma hatası: ${e.message}` : String(e))
    }
    console.log(`Adaylar (${adaylar.length}):`)
    for (const a of adaylar) console.log(`  ${a.id} [${a.kapsam}] · ${a.metin.length} karakter · örnek: ${a.ornek ? `"${a.ornek.slice(0, 60)}${a.ornek.length > 60 ? '…' : ''}"` : '(yok)'}`)

    const mevcutlar = await db.uslupKurali.findMany({
      where: { musteriId: musteri.id },
      select: { id: true, kapsam: true, metin: true, ornek: true, surum: true, durum: true },
    })
    const plan = uslupYuklemePlani(mevcutlar, adaylar)

    console.log('\nPlan:')
    const satir = (ad: string, liste: readonly { id: string; surum: number }[]) =>
      console.log(`  ${ad} (${liste.length}): ${liste.length ? liste.map((x) => `${x.id}@${x.surum}`).join(', ') : '(yok)'}`)
    satir('Eklenecek', plan.eklenecek)
    console.log(`  Yeni sürüm (${plan.yeniSurum.length}): ${plan.yeniSurum.length ? plan.yeniSurum.map((y) => `${y.id}@${y.surum} (önceki ${y.oncekiSurum}${y.oncekiOnayli ? ', ONAYLI — dokunulmadı' : ''})`).join(', ') : '(yok)'}`)
    satir('Aynı kalacak', plan.ayniKalacak)
    console.log(`  Plan hash: ${plan.ozet}`)

    const uygula = bayrakVar('uygula')
    if (!uygula) {
      console.log(`\nUygulamak için: --musteri=${JSON.stringify(musteriOnEk)} --uygula --plan=${plan.ozet}`)
      return
    }
    const planHash = argDegeri('plan')
    if (!planHash) throw new Error('--uygula için --plan=<hash> zorunlu (önce kuru çalıştırıp hash alın).')
    if (planHash !== plan.ozet) throw new Error('Plan, kuru çalıştırmadan sonra değişti (bilgi bankası ya da DB değişti olabilir). Yeniden kuru çalıştırıp hash alın.')

    const yuklemeId = yuklemeIdUret('uslup-cli')
    const yazilacaklar = [...plan.eklenecek, ...plan.yeniSurum].map((adim) => ({ aday: adaylar.find((a) => a.id === adim.id)!, surum: adim.surum }))
    await db.$transaction(
      yazilacaklar.map(({ aday, surum }) =>
        db.uslupKurali.create({
          data: { musteriId: musteri.id, kapsam: aday.kapsam, metin: aday.metin, ornek: aday.ornek, kaynak: 'ELLE', durum: 'ONERI', surum, yuklemeId },
        }),
      ),
    )
    console.log(`\nUYGULANDI: ${yazilacaklar.length} kural yazıldı (hepsi durum='ONERI'). yuklemeId=${yuklemeId}`)
    console.log('Avukat onayı: /dilekceler/sablon ekranından incelenip onaylanmalı.')
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error('HATA:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
