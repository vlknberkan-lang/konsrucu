/**
 * KonsRücü — tarih/saat/para biçimlendirme TEK KAYNAK · lib/konsrucu/format.ts (client-safe)
 *
 * Vercel sunucusu UTC çalışır: timeZone verilmeyen toLocaleDateString geceye yakın tarihleri
 * BİR GÜN ERKEN gösterir ve "X gün kaldı" rozetleri kayar — hukuki sürede güven sorunu.
 * Türkiye 2016'dan beri sabit UTC+3 (DST yok) → gün hesabında sabit ofset güvenlidir.
 * Yeni tarih gösterimi yazarken bu modülü kullan; çıplak toLocaleDateString('tr-TR') YAZMA.
 */

const IST = 'Europe/Istanbul'

/** Tarih → "31.12.2026" (İstanbul günü; opts ile ay adı vb. genişletilebilir). */
export function tarihTR(d: Date | string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (d == null) return '—'
  const x = new Date(d)
  if (Number.isNaN(x.getTime())) return '—'
  return x.toLocaleDateString('tr-TR', { timeZone: IST, ...opts })
}

/** Saat → "14:05" (İstanbul). */
export function saatTR(d: Date | string | null | undefined): string {
  if (d == null) return '—'
  const x = new Date(d)
  if (Number.isNaN(x.getTime())) return '—'
  return x.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: IST })
}

/** Tarih + saat → "31.12.2026 14:05" (İstanbul). */
export function tarihSaatTR(d: Date | string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (d == null) return '—'
  const x = new Date(d)
  if (Number.isNaN(x.getTime())) return '—'
  return x.toLocaleString('tr-TR', { timeZone: IST, hour: '2-digit', minute: '2-digit', ...opts })
}

/** İstanbul takvim günü (epoch-gün) — kalanGun'un temeli. TR sabit UTC+3, DST yok. */
function gunIst(d: Date): number {
  return Math.floor((d.getTime() + 3 * 3_600_000) / 86_400_000)
}

/** Hedef tarihe İSTANBUL takvimiyle kalan gün (negatif = geçti). UTC gün kaymasından etkilenmez. */
export function kalanGun(hedef: Date | string, simdi: Date = new Date()): number {
  return gunIst(new Date(hedef)) - gunIst(simdi)
}

/** Bugünün İSTANBUL gün başlangıcı (UTC instant olarak). Sunucu UTC'yken "bugün" penceresi
 *  yanlış kurulmasın diye: new Date(y,m,d) yerine bunu kullan. */
export function bugunIstBasi(simdi: Date = new Date()): Date {
  return new Date(gunIst(simdi) * 86_400_000 - 3 * 3_600_000)
}

/** Para → "1.234,56 ₺" (kuruşlu standart gösterim). */
export function paraTR(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺'
}
