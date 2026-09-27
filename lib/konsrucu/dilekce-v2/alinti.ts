/**
 * KonsRücü — Olgu alıntısı doğrulama · lib/konsrucu/dilekce-v2/alinti.ts (saf)
 *
 * 06 §7.3: "Sunucu her alıntıyı belge metninde arar; bulamazsa olgu 'kaynaksız' olur ve karta giremez."
 * Arama belge metninin ham (maskesiz) hâlinde yapılır; yapay zekânın maskeli alıntısı sarmalayıcıda geri açılmış
 * olarak gelir. Karşılaştırma büyük/küçük harf, boşluk, satır sonu heceleme tiresi ve tırnak biçimine duyarsızdır;
 * kısaltma ("…", "(...)") kabul edilmez: alıntı belgede kesintisiz geçmelidir.
 */

export type BelgeSayfaMetni = { sayfaNo: number | null; metin: string }
export type BelgeMetni = { belgeId: string; ad: string; sayfalar: BelgeSayfaMetni[] }

export const ALINTI_EN_AZ = 8
export const ALINTI_EN_COK = 300

/** Arama biçimi: Türkçe küçük harf, heceleme tiresi birleştirilmiş, tek boşluk, tek tip tırnak. */
export function aramaNormal(s: string): string {
  return s
    .replace(/[­​‌‍﻿]/g, '')
    .replace(/(\p{L})-\s*\r?\n\s*(\p{L})/gu, '$1$2')
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('tr')
}

export type AlintiSonucu =
  | { bulundu: true; sayfa: number | null; sayfaDuzeltildi: boolean }
  | { bulundu: false; neden: string }

/**
 * Alıntıyı belgede arar. Önce belirtilen sayfaya, sonra bütün sayfalara bakar; başka sayfada bulunursa sayfa
 * düzeltilir (olgu kaynağı yanlış sayfayı göstermesin).
 */
export function alintiBul(alinti: string | null | undefined, belge: BelgeMetni | undefined, sayfa?: number | null): AlintiSonucu {
  if (!belge) return { bulundu: false, neden: 'Kaynak belge bu dosyada bulunamadı.' }
  const ham = (alinti ?? '').trim()
  if (!ham) return { bulundu: false, neden: 'Alıntı yok.' }
  if (ham.length > ALINTI_EN_COK) return { bulundu: false, neden: `Alıntı ${ALINTI_EN_COK} karakteri aşıyor.` }
  if (/…|\.\.\.|\(\s*…\s*\)/.test(ham)) return { bulundu: false, neden: 'Alıntı kısaltılmış; belgede kesintisiz geçen metin olmalı.' }
  const a = aramaNormal(ham)
  if (a.length < ALINTI_EN_AZ) return { bulundu: false, neden: 'Alıntı çok kısa; olguyu belgeye bağlamaya yetmiyor.' }
  const sayfalar = belge.sayfalar.filter((s) => s.metin?.trim())
  if (!sayfalar.length) return { bulundu: false, neden: 'Belgenin okunmuş metni yok.' }
  const hedef = sayfa != null ? sayfalar.find((s) => s.sayfaNo === sayfa) : undefined
  if (hedef && aramaNormal(hedef.metin).includes(a)) return { bulundu: true, sayfa: hedef.sayfaNo, sayfaDuzeltildi: false }
  for (const s of sayfalar) {
    if (aramaNormal(s.metin).includes(a)) return { bulundu: true, sayfa: s.sayfaNo, sayfaDuzeltildi: sayfa != null && s.sayfaNo !== sayfa }
  }
  // Sayfa sınırına denk gelen alıntı: ardışık sayfalar birlikte
  const tum = aramaNormal(sayfalar.map((s) => s.metin).join(' '))
  if (tum.includes(a)) return { bulundu: true, sayfa: sayfa ?? sayfalar[0].sayfaNo, sayfaDuzeltildi: false }
  return { bulundu: false, neden: 'Alıntı belgede bulunamadı.' }
}
