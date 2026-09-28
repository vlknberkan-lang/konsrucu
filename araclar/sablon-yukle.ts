/**
 * KonsRücü — Dilekçe iskeleti (DilekceSablon) yükleme CLI · araclar/sablon-yukle.ts
 *
 * S36/07: `rucu-hukuk-asistani/bilgi-bankasi/dilekce/sablonlar/*.md` dosyalarını okuyup her birinin
 * `{{...}}` gövdesini (bkz. `lib/konsrucu/dilekce-v2/sablon-kaynak.ts`) `DilekceSablon` adayına çevirir.
 * 4 dosya (kasko, zmss-alkol, cevaba-cevap, delil) tek aday verir; `beyan.md` altı ayrı durumun (belge sunma,
 * müzekkere cevabı, basit usulde karşı beyan, …) her biri için ayrı bir aday verir (`kod` = "beyan-N").
 *
 * Şablonlar Ray Sigorta için yazıldı; başka bir müvekkile (ör. Zurich) yüklenen kopya HER ZAMAN onaysız başlar
 * (`aktif=false, onayAt=null`) — avukat ekrandan (`/dilekceler/sablon`, `sablonKaydetVeOnayla` deseninin
 * incelemesiyle) onaylar. Bu script DB'ye hiçbir onaylı satırı EZMEZ: aynı kod'da içerik değiştiyse yeni bir
 * `surum` satırı açılır, var olan (özellikle onaylı) satıra dokunulmaz (bkz. sablon-kaynak.ts `sablonYuklemePlani`).
 *
 * Kullanım (proje kökünden):
 *   JITI_TSCONFIG_PATHS=true node node_modules/jiti/lib/jiti-cli.mjs araclar/sablon-yukle.ts --musteri=Zurich
 *       → KURU çalıştırma (varsayılan): her md → aday raporu (blok/alan/AI yuvası sayısı) + plan + hash.
 *
 *   ... araclar/sablon-yukle.ts --musteri=Zurich --uygula --plan=<kuru çalıştırmanın verdiği hash>
 *       → gerçek yükleme (tek transaction, hepsi aktif=false/onayAt=null).
 *
 *   ... araclar/sablon-yukle.ts --musteri=Zurich --pasif=<yuklemeId> [--uygula]
 *       → o yuklemeId ile yazılmış AMA HENÜZ ONAYLANMAMIŞ satırları toplu pasife alır (onaylı satırlara dokunmaz).
 *
 *   --kaynak=<dizin> ile bilgi bankası dizini değiştirilebilir (varsayılan: aşağıdaki VARSAYILAN_KAYNAK_DIZINI).
 *
 * jiti + JITI_TSCONFIG_PATHS=true GEREKLİ: sablon-kaynak.ts → sablon-dil.ts `@/lib/konsrucu/format` takma adını
 * kullanır; düz `node` bunu çözemez (bkz. tsconfig.json `paths`).
 */
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient, Prisma } from '@prisma/client'
import { sablonKaynagiYaz } from '../lib/konsrucu/dilekce-v2/iskelet'
import { bloklaraBol, sablonAlanlari, sablonAyristir, SablonHatasi } from '../lib/konsrucu/dilekce-v2/sablon-dil'
import {
  mdDenSablonAdaylariCikar,
  sablonIcerikOzeti,
  sablonYuklemePlani,
  SablonKaynakHatasi,
  type SablonAdayi,
} from '../lib/konsrucu/dilekce-v2/sablon-kaynak'
import { argDegeri, bayrakVar, musteriBul, yuklemeIdUret } from './_ortak'

const VARSAYILAN_KAYNAK_DIZINI =
  'C:\\Users\\SENFONİ-Berkan\\Desktop\\Yazılım\\rucu-hukuk-asistani\\bilgi-bankasi\\dilekce\\sablonlar'

const jsonVeri = (v: unknown) => v as Prisma.InputJsonValue

type Hata = { dosya: string; mesaj: string }

/** Dizindeki her .md dosyasını adaylara çevirir; sablonAyristir ile doğrular. Hatalar fırlatılmaz, toplanır. */
function adaylariTopla(dizin: string): { adaylar: SablonAdayi[]; hatalar: Hata[] } {
  const dosyalar = fs.readdirSync(dizin).filter((d) => d.toLowerCase().endsWith('.md')).sort()
  if (!dosyalar.length) throw new Error(`"${dizin}" içinde .md dosyası yok.`)
  const adaylar: SablonAdayi[] = []
  const hatalar: Hata[] = []
  for (const dosya of dosyalar) {
    const md = fs.readFileSync(path.join(dizin, dosya), 'utf8')
    let dosyaAdaylari: SablonAdayi[]
    try {
      dosyaAdaylari = mdDenSablonAdaylariCikar(md, dosya)
    } catch (e) {
      hatalar.push({ dosya, mesaj: e instanceof SablonKaynakHatasi ? e.message : `beklenmeyen hata: ${String(e)}` })
      continue
    }
    for (const a of dosyaAdaylari) {
      try {
        const dugumler = sablonAyristir(a.kaynakMetni)
        const bloklar = bloklaraBol(dugumler)
        const { alanlar, kosullar, aiYuvasi } = sablonAlanlari(dugumler)
        console.log(`  ${a.kod} [${a.tur}] · "${a.bolumBasligi}" · ${bloklar.length} blok · ${alanlar.length} alan · ${kosullar.length} koşul · ${aiYuvasi} AI yuvası`)
        console.log(`      varyant: ${JSON.stringify(a.varyantJson)}`)
        adaylar.push(a)
      } catch (e) {
        hatalar.push({ dosya, mesaj: `${a.kod}: ${e instanceof SablonHatasi ? `şablon dili hatası — ${e.message}` : String(e)}` })
      }
    }
  }
  return { adaylar, hatalar }
}

async function main() {
  const musteriOnEk = argDegeri('musteri')
  if (!musteriOnEk) {
    console.error('Kullanım: --musteri=<ad öneki, ör. Zurich> [--kaynak=<dizin>] [--uygula --plan=<hash>] | --pasif=<yuklemeId> [--uygula]')
    process.exitCode = 1
    return
  }
  const kaynakDizini = argDegeri('kaynak') ?? VARSAYILAN_KAYNAK_DIZINI

  const db = new PrismaClient()
  try {
    const musteri = await musteriBul(db, musteriOnEk)
    console.log(`Müvekkil: ${musteri.ad} (${musteri.id})`)

    const pasifId = argDegeri('pasif')
    if (pasifId) {
      const uygula = bayrakVar('uygula')
      const hedefler = await db.dilekceSablon.findMany({
        where: { musteriId: musteri.id, yuklemeId: pasifId, onayAt: null, aktif: true },
        select: { id: true, kod: true, surum: true },
      })
      console.log(`${uygula ? 'UYGULANDI' : 'KURU ÇALIŞTIRMA'}: yükleme "${pasifId}" → ${hedefler.length} onaysız kayıt${uygula ? ' pasife alındı' : ' pasife alınacak'}: ${hedefler.map((h) => `${h.kod}@${h.surum}`).join(', ') || '(yok)'}`)
      if (uygula && hedefler.length) {
        await db.dilekceSablon.updateMany({ where: { id: { in: hedefler.map((h) => h.id) } }, data: { aktif: false } })
      }
      return
    }

    console.log(`Kaynak dizin: ${kaynakDizini}`)
    console.log('Adaylar:')
    const { adaylar, hatalar } = adaylariTopla(kaynakDizini)

    if (hatalar.length) {
      console.error('\nPARSE HATALARI (bu adaylar plana HİÇ girmedi):')
      for (const h of hatalar) console.error(`  ✗ ${h.dosya}: ${h.mesaj}`)
    }

    const mevcutlar = await db.dilekceSablon.findMany({
      where: { musteriId: musteri.id },
      select: { id: true, kod: true, surum: true, icerikOzet: true, aktif: true, onayAt: true },
    })
    const plan = sablonYuklemePlani(mevcutlar, adaylar)

    console.log('\nPlan:')
    const satir = (ad: string, liste: readonly { kod: string; surum: number }[]) =>
      console.log(`  ${ad} (${liste.length}): ${liste.length ? liste.map((x) => `${x.kod}@${x.surum}`).join(', ') : '(yok)'}`)
    satir('Eklenecek', plan.eklenecek)
    console.log(`  Yeni sürüm (${plan.yeniSurum.length}): ${plan.yeniSurum.length ? plan.yeniSurum.map((y) => `${y.kod}@${y.surum} (önceki ${y.oncekiSurum}${y.oncekiOnayli ? ', ONAYLI — dokunulmadı' : ''})`).join(', ') : '(yok)'}`)
    satir('Aynı kalacak', plan.ayniKalacak)
    console.log(`  Katalog dışı (dokunulmaz) (${plan.katalogDisi.length}): ${plan.katalogDisi.join(', ') || '(yok)'}`)
    console.log(`  Plan hash: ${plan.ozet}`)

    const uygula = bayrakVar('uygula')
    if (!uygula) {
      console.log(`\nUygulamak için: --musteri=${JSON.stringify(musteriOnEk)} --uygula --plan=${plan.ozet}`)
      if (hatalar.length) process.exitCode = 1
      return
    }
    if (hatalar.length) throw new Error(`${hatalar.length} dosya/adayda ayrıştırma hatası var; önce bunları düzeltin (yukarıdaki listeye bakın).`)
    const planHash = argDegeri('plan')
    if (!planHash) throw new Error('--uygula için --plan=<hash> zorunlu (önce kuru çalıştırıp hash alın).')
    if (planHash !== plan.ozet) throw new Error('Plan, kuru çalıştırmadan sonra değişti (bilgi bankası ya da DB değişti olabilir). Yeniden kuru çalıştırıp hash alın.')

    const yuklemeId = yuklemeIdUret('sablon-cli')
    const yazilacaklar = [...plan.eklenecek, ...plan.yeniSurum].map((adim) => {
      const aday = adaylar.find((a) => a.kod === adim.kod)!
      return { aday, surum: adim.surum }
    })
    await db.$transaction(
      yazilacaklar.map(({ aday, surum }) =>
        db.dilekceSablon.create({
          data: {
            musteriId: musteri.id, kod: aday.kod, tur: aday.tur, surum,
            varyantJson: jsonVeri(aday.varyantJson), bloklarJson: jsonVeri(sablonKaynagiYaz(aday.kaynakMetni)),
            kaynakOrnek: aday.kaynakOrnek, bilgiBankasiYolu: aday.bilgiBankasiYolu,
            icerikOzet: sablonIcerikOzeti(aday), yuklemeId, aktif: false, onayAt: null,
          },
        }),
      ),
    )
    console.log(`\nUYGULANDI: ${yazilacaklar.length} kayıt yazıldı (hepsi aktif=false, onayAt=null). yuklemeId=${yuklemeId}`)
    console.log('Avukat onayı: /dilekceler/sablon ekranından incelenip onaylanmalı.')
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error('HATA:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
