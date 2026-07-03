/**
 * KonsRücü — Tenant alacaklı unvanı enjeksiyonu · lib/konsrucu/unvan.ts
 * AI promptları/dilekçe şablonları tarihsel olarak "Ray Sigorta A.Ş." sabitiyle yazıldı. Çok-tenant'ta
 * (Ray, Zurich…) bu sabit, aktif müşterinin Ayarlar.alacakliUnvan değeriyle değiştirilir — prompt metni
 * hiç değişmeden runtime'da. "Ray Sigorta A.Ş." / "Ray Sigorta" / "Ray'in" (iyelik) kalıplarını kapsar.
 * Hukuk bürosu adı (Küçükislamoğlu / K/Partners) tenant'a göre değişmez; dokunulmaz.
 */
export function unvanGecir(metin: string, alacakliUnvan: string | null | undefined): string {
  const alacakli = (alacakliUnvan || '').trim() || 'sigorta şirketi'
  const kisa = alacakli.split(/\s+/)[0] // "Zurich Sigorta A.Ş." → "Zurich" (iyelik halleri için)
  return metin
    .replaceAll('Ray Sigorta A.Ş.', alacakli) // önce noktalı (uzun) eşleşme
    .replaceAll('Ray Sigorta A.Ş', alacakli) // sonra noktasız
    .replaceAll('Ray Sigorta', alacakli)
    .replaceAll("Ray'", `${kisa}'`) // "Ray'in", "Ray'e", "Ray'den"…
}
