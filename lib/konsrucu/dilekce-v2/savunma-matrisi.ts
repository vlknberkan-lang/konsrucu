/**
 * KonsRücü — Savunma matrisi (iskelet) · lib/konsrucu/dilekce-v2/savunma-matrisi.ts (saf)
 *
 * S35 (07: `savunma-matrisi.ts` yeni; S39'da tamamlanır). 06 §7.3: cevaba cevapta karşı tarafın savunmaları sayfa
 * atıflı bir iddia–savunma matrisine dökülür; Yelda her savunmayı "cevaplanacak" ya da "önemsiz" işaretler.
 * Her satırın alıntısı cevap dilekçesinde aranır; bulunamayan savunma matrise girmez.
 */
import { alintiBul, type BelgeMetni } from './alinti'
import type { KaynaksizOlgu, SavunmaKonusu, SavunmaSatiri } from './tipler'

export const SAVUNMA_KONULARI: readonly SavunmaKonusu[] = ['ZAMANASIMI', 'KUSUR', 'HUSUMET', 'LIKIDITE', 'FAIZ', 'USUL', 'GOREV_YETKI', 'DIGER']
export const SAVUNMA_KONU_ADI: Record<SavunmaKonusu, string> = {
  ZAMANASIMI: 'Zamanaşımı', KUSUR: 'Kusur', HUSUMET: 'Husumet', LIKIDITE: 'Likidite', FAIZ: 'Faiz',
  USUL: 'Usul', GOREV_YETKI: 'Görev ve yetki', DIGER: 'Diğer',
}

export type AiSavunma = { baslik: string; konu: string; belgeId: string | null; sayfa: number | null; alinti: string }

export function savunmaMatrisiKur(
  aiSavunmalar: readonly AiSavunma[],
  belgeler: ReadonlyMap<string, BelgeMetni>,
): { satirlar: SavunmaSatiri[]; kaynaksiz: KaynaksizOlgu[] } {
  const satirlar: SavunmaSatiri[] = []
  const kaynaksiz: KaynaksizOlgu[] = []
  for (const s of aiSavunmalar) {
    const belge = s.belgeId ? belgeler.get(s.belgeId) : undefined
    const r = alintiBul(s.alinti, belge, s.sayfa)
    if (!r.bulundu) {
      kaynaksiz.push({ metin: `Savunma: ${s.baslik}`, belgeId: s.belgeId, belgeAdi: belge?.ad ?? null, sayfa: s.sayfa, alinti: s.alinti, neden: r.neden })
      continue
    }
    if (satirlar.some((x) => x.alinti === s.alinti.trim() && x.belgeId === s.belgeId)) continue
    satirlar.push({
      id: `S-${satirlar.length + 1}`,
      baslik: s.baslik.trim().slice(0, 200),
      konu: (SAVUNMA_KONULARI as readonly string[]).includes(s.konu) ? (s.konu as SavunmaKonusu) : 'DIGER',
      belgeId: s.belgeId, belgeAdi: belge?.ad ?? null, sayfa: r.sayfa, alinti: s.alinti.trim(),
      isaret: null, isaretleyenId: null, isaretAt: null,
    })
  }
  return { satirlar, kaynaksiz }
}

export function savunmaIsaretle(
  satirlar: readonly SavunmaSatiri[],
  id: string,
  isaret: 'CEVAPLANACAK' | 'ONEMSIZ',
  kullaniciId: string,
  at: string,
): SavunmaSatiri[] | null {
  if (!satirlar.some((s) => s.id === id)) return null
  return satirlar.map((s) => (s.id === id ? { ...s, isaret, isaretleyenId: kullaniciId, isaretAt: at } : s))
}

/** Aşama 2'de yalnız bunlar karşılanır (S39). */
export const cevaplanacaklar = (satirlar: readonly SavunmaSatiri[]) => satirlar.filter((s) => s.isaret === 'CEVAPLANACAK')

/** Önceki sürümün işaretlerini aynı alıntılı satırlara taşır (yeniden hazırlamada Yelda'nın emeği kaybolmasın). */
export function isaretleriTasi(yeni: readonly SavunmaSatiri[], onceki: readonly SavunmaSatiri[]): SavunmaSatiri[] {
  return yeni.map((s) => {
    const o = onceki.find((x) => x.alinti === s.alinti && x.belgeId === s.belgeId && x.isaret)
    return o ? { ...s, isaret: o.isaret, isaretleyenId: o.isaretleyenId, isaretAt: o.isaretAt } : s
  })
}
