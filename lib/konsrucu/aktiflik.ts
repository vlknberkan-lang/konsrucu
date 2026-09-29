/**
 * KonsRücü — Dosya AKTİFLİK kapısı · lib/konsrucu/aktiflik.ts  (client-safe; DB/Prisma yok)
 *
 * TEK KAYNAK: bir dosya hangi otomatik akışın kapsamında? Eskiden tek bir "kapalı durumlar" listesi
 * vardı (TAHSIL/KAPANDI/IDARI_YOL) ve üç ayrı soruya aynı cevabı veriyordu. İDARİ_YOL da orada
 * olduğu için idari yol dosyalarında görev hatırlatması ve zamanaşımı radarı SUSUYORDU (B12, F18).
 * S06 ile liste üçe ayrıldı — her akış kendi listesini kullanır:
 *
 *   1) OTOMASYON_DISI   → UYAP sorgusu (eklenti hedef listesi), evrak indirme, masraf AI.
 *                         TAHSIL, KAPANDI, IDARI_YOL: idari yolda icra dosyası yoktur, UYAP'ta aranacak bir şey yok.
 *   2) HATIRLATMA_DISI  → görev hatırlatma e-postası ve "açık iş" sayımları. Yalnız TAHSIL, KAPANDI.
 *                         İdari yol dosyası süre izler (İYUK süreleri S24'te gelir); hatırlatma ALIR.
 *   3) ZAMANASIMI_RADARI→ zamanaşımı radarının izlediği durumlar: takip öncesi üç durum + IDARI_YOL.
 *                         Takip açılınca rücu zamanaşımı kesilir; idari yolda icra takibi yoktur, bu yüzden
 *                         radar dosyayı izlemeye devam eder. (İdari başvurunun zamanaşımına etkisi: teyit gerekli —
 *                         radar yalnız kayıtlı tarihi gösterir, hukuki son günü avukat belirler.)
 *
 * İkinci sinyal: uyapDurum (UYAP'ın serbest metni) açık/kapalı için YETKİLİ kaynak (hafıza: uyap-dosya-durum-kontrol).
 * UYAP "Kapalı"/"Kapandı"/"İnfazen kapandı" derse, dosya.durum güncellenmemiş olsa bile üç akıştan da çıkar.
 *
 * Kapı yalnız OTOMASYON kapsamını daraltır — dosya silinmez, detay ekranı + elle işlem etkilenmez.
 */

/** Otomasyon dışı durumlar: UYAP sorgusu, evrak indirme, masraf AI (Prisma where `durum: { notIn }` ile aynı). */
export const OTOMASYON_DISI = ['TAHSIL', 'KAPANDI', 'IDARI_YOL'] as const

/** Hatırlatma dışı durumlar: görev hatırlatma e-postası ve "açık iş" sayımları. İDARİ_YOL bu listede YOK (S06). */
export const HATIRLATMA_DISI = ['TAHSIL', 'KAPANDI'] as const

/** Zamanaşımı radarının izlediği durumlar (Bugün, haftalık rapor, Atanan Dosyalar süzgeci ve dışa aktarım). */
export const ZAMANASIMI_RADARI = ['HAVUZDA', 'INCELENIYOR', 'TAKIBE_HAZIR', 'IDARI_YOL'] as const

/**
 * Eski ad — OTOMASYON_DISI'na işaret eder (UYAP hedefleri, senkron sağlığı, masraf tarama bu adla çağırır).
 * Yeni kodda amacına göre OTOMASYON_DISI / HATIRLATMA_DISI / ZAMANASIMI_RADARI kullanın.
 */
export const KAPALI_DURUMLAR = OTOMASYON_DISI

type DurumGirdi = { durum?: string | null; uyapDurum?: string | null }

const icinde = (liste: readonly string[], durum: string | null | undefined) => !!durum && liste.includes(durum)

/**
 * UYAP'ın serbest durum metni dosyanın KAPALI olduğunu mu söylüyor?
 * "Kapalı" → "kapal", "Kapandı"/"İnfazen kapandı" → "kapan" köküyle yakalanır (Türkçe büyük/küçük İ/ı
 * sorunundan kaçınmak için ASCII kökünde case-insensitive regex). "Açık"/"Derdest" → false.
 */
export function uyapKapaliMi(uyapDurum: string | null | undefined): boolean {
  if (!uyapDurum) return false
  return /kapa(l|n)/i.test(uyapDurum)
}

/** Dosya tekrarlayan/pahalı otomasyona (UYAP sorgusu, evrak, masraf AI) dahil edilmeli mi? */
export function dosyaAktif(d: DurumGirdi): boolean {
  if (icinde(OTOMASYON_DISI, d.durum)) return false
  if (uyapKapaliMi(d.uyapDurum)) return false
  return true
}

/** Dosyanın görevleri hatırlatma e-postası almalı mı? (İDARİ_YOL alır; TAHSIL/KAPANDI ve UYAP-kapalı almaz.) */
export function hatirlatmaKapsaminda(d: DurumGirdi): boolean {
  if (icinde(HATIRLATMA_DISI, d.durum)) return false
  if (uyapKapaliMi(d.uyapDurum)) return false
  return true
}

/** Dosya zamanaşımı radarında görünmeli mi? (takip öncesi + İDARİ_YOL; UYAP-kapalı dosya radar dışı.) */
export function zamanasimiRadarinda(d: DurumGirdi): boolean {
  if (!icinde(ZAMANASIMI_RADARI, d.durum)) return false
  if (uyapKapaliMi(d.uyapDurum)) return false
  return true
}

/**
 * Hatırlatılacak/listelenecek etkinlik süzgeci (Prisma where parçası). İptal edilmiş, gerçekleşmiş ya da ertelenmiş
 * (yeni tarihli kaydı ayrıdır) etkinlik, avukatın reddettiği aday (UYAP/Excel) ve kapanmış dosyanın etkinliği
 * hatırlatılmaz. `yalnizPlanli=false`: listelerde (sabah özeti, Bugün) yalnız iptal ve reddedilen düşer.
 * teyit NULL olabilir: `not: 'REDDEDILDI'` tek başına NULL'ları da eler, bu yüzden OR.
 */
export function etkinlikHatirlatmaSuzgeci(musteriId: string, yalnizPlanli = true) {
  return {
    dosya: { musteriId, durum: { notIn: [...HATIRLATMA_DISI] } },
    durum: yalnizPlanli ? ('PLANLANDI' as const) : { not: 'IPTAL' as const },
    OR: [{ teyit: null }, { teyit: { not: 'REDDEDILDI' } }],
  }
}
