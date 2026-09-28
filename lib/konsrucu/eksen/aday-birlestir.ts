/**
 * KonsRücü — Aynı olayın birden çok UYAP kaynağını TEK karta toplama · lib/konsrucu/eksen/aday-birlestir.ts (server)
 *
 * Kök neden (Zurich ilk senkron: 448 ADAY satırı, gerçek olay çok daha az): UYAP aynı hukuki olayı birden çok
 * yerde gösterir (safahat satırı "Borçlu X hakkında Takibe İtiraz…", evrak listesi "Borca İtiraz Talebi",
 * "Tensip Zaptı Bilgi Girişi (Borca İtiraz Talebi)") — her biri farklı metin taşır, adayTekilAnahtar() (metin
 * hash'i) farklı anahtar üretir → aynı olay için 2-3 kart açılırdı.
 *
 * Bu modül GRUP ANAHTARIYLA (tekil.ts adayGrupAnahtari; dosya+altTip+hukuki gün+borçlu) "bu zaten var olan bir
 * olay mı" sorusuna bakar: eşleşme varsa (herhangi bir teyit durumunda — ADAY/TEYITLI/REDDEDILDI) YENİ SATIR
 * AÇILMAZ, ek kaynak var olan satırın hamJson.kaynaklar dizisine eklenir (idempotent: aynı tekilAnahtar iki kez
 * eklenmez — tekrar senkronda aynı kaynak yeniden katlanmaz). Hukuki tarihi olmayan aday (adayGrupAnahtari null
 * döner) hiç birleşmez — mevcut davranış (ayrı satır) korunur.
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { adayGrupAnahtari } from './tekil'
import { durumBilgiAdayiMi } from './aday-onay'

export type AdayKaynakEk = {
  aciklama: string | null
  kaynakTuru: string | null
  kaynakBelgeId: string | null
  tekilAnahtar: string | null
}

function kaynaklarOku(hamJson: unknown): AdayKaynakEk[] {
  const k = hamJson && typeof hamJson === 'object' && !Array.isArray(hamJson) ? (hamJson as { kaynaklar?: unknown }).kaynaklar : null
  return Array.isArray(k) ? (k as AdayKaynakEk[]) : []
}

/**
 * dosya + altTip + hukuki gün aynı olan (borçlu biliniyorsa çelişmeyen), herhangi bir teyit durumundaki satırı
 * arar. Hukuki tarihi olmayan adayda hep null döner (birleşme yok — ürün kararı).
 */
export async function birlesecekAdayIdBul(p: { dosyaId: string; altTip: string; hukukiTarih: Date | null; borcluId?: string | null }): Promise<string | null> {
  if (!adayGrupAnahtari(p)) return null
  const adaylar = await prisma.takipOlayi.findMany({
    where: { dosyaId: p.dosyaId, altTip: p.altTip, hukukiTarih: p.hukukiTarih, teyit: { not: null } },
    select: { id: true, borcluId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  // Borçlu çelişmiyorsa eşleşir: ikisi de biliniyorsa aynı olmalı, biri (ya da ikisi) bilinmiyorsa eşleşir
  // (çoğu aday oluşum anında borcluId taşımaz — mazbataAdaylariniIsle ile mazbata-aday.ts arasındaki desenle aynı).
  const uygun = adaylar.find((a) => !(p.borcluId && a.borcluId && a.borcluId !== p.borcluId))
  return uygun?.id ?? null
}

/**
 * Var olan adaya ek kaynak ekler; satır AÇILMAZ. İdempotent: aynı tekilAnahtar iki kez eklenmez (aynı kaynağın
 * tekrar senkronunda — ör. bir sonraki UYAP çekiminde aynı evrak listesi satırı yeniden kaydedilmez).
 * Dönüş: gerçekten eklendiyse true; hedef bulunamadıysa ya da kaynak zaten kayıtlıysa (no-op) false.
 */
export async function adayaKaynakEkle(hedefId: string, ek: AdayKaynakEk): Promise<boolean> {
  const hedef = await prisma.takipOlayi.findUnique({ where: { id: hedefId }, select: { hamJson: true } })
  if (!hedef) return false
  const kaynaklar = kaynaklarOku(hedef.hamJson)
  if (ek.tekilAnahtar && kaynaklar.some((k) => k.tekilAnahtar === ek.tekilAnahtar)) return false
  const hamJson = (hedef.hamJson && typeof hedef.hamJson === 'object' && !Array.isArray(hedef.hamJson) ? hedef.hamJson : {}) as Record<string, unknown>
  await prisma.takipOlayi.update({
    where: { id: hedefId },
    data: { hamJson: { ...hamJson, kaynaklar: [...kaynaklar, ek] } as Prisma.InputJsonValue },
  })
  return true
}

export type AdayKartSatiri = { dosyaId: string; tip: string | null; altTip: string | null; hukukiTarih: Date | null; borcluId: string | null }

/**
 * ADAY satırlarını GÖRÜNEN KART sayısına indirger (Bugün rozeti "Onay bekleyen UYAP gelişmesi" için; 06 karar 4:
 * "raw satır değil, kart" sayılır). İki kural aynı anda uygulanır:
 *   1) Hiçbir hukuki olgu taşımayan DURUM adayı (yalnız TAHSILAT_SINYALI — bkz. aday-onay.ts durumBilgiAdayiMi)
 *      hiç sayılmaz (06 karar 2).
 *   2) Kalanlar grup anahtarına göre (dosya+altTip+hukuki gün+borçlu) TEK kart sayılır — canlı senkron zaten
 *      yazarken birleştirir (route), ama bu fonksiyon henüz birleştirilmemiş ESKİ satırları da doğru sayar
 *      (temizlik betiği çalışmadan önce, ya da hukuki tarihi olmadığı için hiç birleşmeyen satırlar).
 */
export function adayKartSayisi(rows: readonly AdayKartSatiri[]): number {
  const gorulenGruplar = new Set<string>()
  let sayac = 0
  for (const r of rows) {
    if (durumBilgiAdayiMi(r)) continue
    const anahtar = adayGrupAnahtari({ dosyaId: r.dosyaId, altTip: r.altTip ?? 'DIGER', hukukiTarih: r.hukukiTarih, borcluId: r.borcluId })
    if (!anahtar) { sayac++; continue } // hukuki tarihi yok → birleşmez, kendi başına kart
    if (gorulenGruplar.has(anahtar)) continue
    gorulenGruplar.add(anahtar)
    sayac++
  }
  return sayac
}
