/**
 * KonsRücü — mahkeme türü ↔ arabuluculuk türü çapraz kontrolü · lib/konsrucu/dava/capraz-kontrol.ts (saf)
 *
 * 06 2(g) "Ne ters gidebilir": seçilen mahkeme türü ile arabuluculuk türü çelişiyorsa (ör. ticari dava seçilmiş,
 * arabuluculuk "ihtiyari" işaretli; TTK 5/A) KIRMIZI engel; yazılı gerekçeyle geçilebilir. Kural K1'den geçene kadar
 * her uyarı "teyit gerekli" etiketi taşır (07 S27 risk). Program görevli mahkemeyi SEÇMEZ; yalnız tutarsızlığı gösterir.
 */

export type CaprazUyari = {
  kod: 'CK-TICARET-IHTIYARI' | 'CK-TUKETICI-IHTIYARI' | 'CK-TUR-SECILMEDI' | 'CK-SARTLI-TUTANAK-YOK'
  seviye: 'KIRMIZI' | 'SARI'
  mesaj: string
  dayanak: string
  gecilebilir: boolean
}

/** Arabuluculuğun dava şartı sayıldığı olası mahkeme türleri (bilgi amaçlı; K1'den geçene kadar teyit gerekli). */
const SARTLI_OLABILIR: Record<string, string> = {
  ASLIYE_TICARET: 'TTK 5/A (teyit gerekli)',
  TUKETICI: 'TKHK 73/A (teyit gerekli)',
}

export function caprazKontrol(p: {
  mahkemeTuru: string | null | undefined
  arabuluculukTuru: string | null | undefined
  arabuluculukVar: boolean
  sonTutanakVar: boolean
}): CaprazUyari[] {
  const out: CaprazUyari[] = []
  const m = p.mahkemeTuru ?? null
  const a = p.arabuluculukTuru ?? null
  if (m && SARTLI_OLABILIR[m] && a === 'IHTIYARI') {
    out.push({
      kod: m === 'ASLIYE_TICARET' ? 'CK-TICARET-IHTIYARI' : 'CK-TUKETICI-IHTIYARI',
      seviye: 'KIRMIZI',
      mesaj: `Mahkeme türü (${m === 'ASLIYE_TICARET' ? 'Asliye Ticaret' : 'Tüketici'}) ile arabuluculuk türü (ihtiyari) uyumsuz olabilir: bu davada arabuluculuk dava şartı olabilir.`,
      dayanak: SARTLI_OLABILIR[m],
      gecilebilir: true,
    })
  }
  if (m && SARTLI_OLABILIR[m] && p.arabuluculukVar && (!a || a === 'BELIRSIZ')) {
    out.push({
      kod: 'CK-TUR-SECILMEDI',
      seviye: 'SARI',
      mesaj: 'Arabuluculuk türü seçilmedi ya da belirsiz: seçilen mahkeme türünde dava şartı olabilir.',
      dayanak: SARTLI_OLABILIR[m],
      gecilebilir: true,
    })
  }
  if (a === 'DAVA_SARTI' && !p.sonTutanakVar) {
    out.push({
      kod: 'CK-SARTLI-TUTANAK-YOK',
      seviye: 'KIRMIZI',
      mesaj: 'Dava şartı arabuluculukta son tutanak yok: dava usulden reddedilebilir.',
      dayanak: 'HUAK 18/A (teyit gerekli)',
      gecilebilir: false,
    })
  }
  return out
}
