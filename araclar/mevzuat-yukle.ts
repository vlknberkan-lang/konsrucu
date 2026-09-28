/**
 * KonsRücü — Mevzuat kütüphanesi yükleme CLI · araclar/mevzuat-yukle.ts
 *
 * S33 (06 §6.4, §7.1-2): `lib/konsrucu/mevzuat/yukle.ts`'nin (`MEVZUAT_KATALOGU` → `MevzuatKaynak`) başlığında
 * "araclar/mevzuat-yukle.ts CLI'sinin çağırması beklenir" diyen script bu dosyadır. Aynı `mevzuatYukle` /
 * `yuklemeyiPasifeAl` fonksiyonları `app/(app)/dilekceler/kutuphane/actions.ts`'de UI'dan da çağrılır (admin,
 * tarayıcıdan); bu script YENİ bir müvekkilin kütüphanesini terminalden/otomasyonla ilk kez doldurmak içindir.
 *
 * Kullanım (proje kökünden):
 *   JITI_TSCONFIG_PATHS=true node node_modules/jiti/lib/jiti-cli.mjs araclar/mevzuat-yukle.ts --musteri=Zurich
 *       → KURU çalıştırma (varsayılan): eklenecek/değişecek/aynı kalacak/pasif kalacak/katalog dışı + plan hash.
 *
 *   ... araclar/mevzuat-yukle.ts --musteri=Zurich --uygula --plan=<kuru çalıştırmanın verdiği hash>
 *       → gerçek yükleme (tek transaction). Plan, kuru çalıştırmadan sonra değiştiyse durur (PlanDegistiHata).
 *
 *   ... araclar/mevzuat-yukle.ts --musteri=Zurich --pasif=<yuklemeId> [--uygula]
 *       → o yuklemeId ile yazılmış aktif kayıtları toplu pasife alır (aktif=false, durum=KULLANMA).
 *
 * `@prisma/client`'ı doğrudan kullanır (yukle.ts/katalog.ts 'server-only' import ETMEZ — Next dışında çalışır).
 * DATABASE_URL: Prisma Client .env dosyasını proje kökünden kendiliğinden okur (bkz. scripts/rls-ac.local.cjs).
 * jiti gerekçesi: yukle.ts/katalog.ts yalnız göreli import kullanır (`@/...` takma adı GEREKMEZ) ama bu script
 * ileride `@/...` kullanan bir modülü import ederse (ör. sablon-yukle.ts) aynı çalıştırma biçimi geçerli olsun
 * diye iki script de aynı jiti komutuyla belgelenir.
 */
import { PrismaClient } from '@prisma/client'
import { mevzuatYukle, yuklemeyiPasifeAl, type MevzuatDb, type YuklemePlani } from '../lib/konsrucu/mevzuat/yukle'
import { argDegeri, bayrakVar, musteriBul, yuklemeIdUret } from './_ortak'

function planYazdir(plan: YuklemePlani) {
  const satir = (ad: string, liste: readonly string[]) => console.log(`  ${ad} (${liste.length}): ${liste.length ? liste.join(', ') : '(yok)'}`)
  satir('Eklenecek', plan.eklenecek)
  satir('Değişecek', plan.degisecek)
  satir('Aynı kalacak', plan.ayniKalacak)
  satir('Pasif kalacak', plan.pasifKalacak)
  satir('Katalog dışı (dokunulmaz)', plan.katalogDisi)
  console.log(`  Plan hash: ${plan.ozet}`)
}

async function main() {
  const musteriOnEk = argDegeri('musteri')
  if (!musteriOnEk) {
    console.error('Kullanım: --musteri=<ad öneki, ör. Zurich> [--uygula --plan=<hash>] | --pasif=<yuklemeId> [--uygula]')
    process.exitCode = 1
    return
  }

  const db = new PrismaClient()
  try {
    const musteri = await musteriBul(db, musteriOnEk)
    console.log(`Müvekkil: ${musteri.ad} (${musteri.id})`)

    const pasifId = argDegeri('pasif')
    if (pasifId) {
      const uygula = bayrakVar('uygula')
      const sonuc = await yuklemeyiPasifeAl(db as unknown as MevzuatDb, { musteriId: musteri.id, yuklemeId: pasifId, kuru: !uygula })
      console.log(`${uygula ? 'UYGULANDI' : 'KURU ÇALIŞTIRMA'}: yükleme "${pasifId}" → ${sonuc.etkilenecek.length} kayıt${uygula ? ' pasife alındı' : ' pasife alınacak'}: ${sonuc.etkilenecek.join(', ') || '(yok)'}`)
      return
    }

    const uygula = bayrakVar('uygula')
    if (!uygula) {
      const { plan } = await mevzuatYukle(db as unknown as MevzuatDb, { musteriId: musteri.id, kuru: true })
      console.log('KURU ÇALIŞTIRMA (hiçbir şey yazılmadı):')
      planYazdir(plan)
      console.log(`\nUygulamak için: --musteri=${JSON.stringify(musteriOnEk)} --uygula --plan=${plan.ozet}`)
      return
    }

    const planHash = argDegeri('plan')
    if (!planHash) throw new Error('--uygula için --plan=<hash> zorunlu (önce kuru çalıştırıp hash alın).')
    const yuklemeId = yuklemeIdUret('mevzuat-cli')
    const sonuc = await db.$transaction((tx) => mevzuatYukle(tx as unknown as MevzuatDb, { musteriId: musteri.id, kuru: false, yuklemeId, beklenenPlanOzeti: planHash }))
    console.log(`UYGULANDI: ${sonuc.yazilan} kayıt yazıldı. yuklemeId=${yuklemeId}`)
    planYazdir(sonuc.plan)
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error('HATA:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
