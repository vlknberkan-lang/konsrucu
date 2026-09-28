/**
 * KonsRücü — mahkemeye gidecek metin · lib/konsrucu/dilekce-v2/cikti-temizle.ts (saf)
 * Ekrandaki olgu işaretleri ([O-12]) ve eski üreticinin kaynak etiketleri ([Kaynak: …]) avukat kontrolü içindir;
 * Word çıktısına girmez. Yer tutucular (⟨…⟩) BİLEREK kalır: eksik alan sessizce kaybolmasın.
 */
export function mahkemeMetni(metin: string): string {
  return metin.replace(/[ \t]?\[O-\d+\]/g, '').replace(/[ \t]?\[Kaynak:[^\]\n]*\]/g, '')
}
