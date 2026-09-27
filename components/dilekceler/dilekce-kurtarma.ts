export type TaslakKaydi = { id: string; icerik: string | null; durum: string | null; createdAt: string }
type Calisma = { taslak: TaslakKaydi; metin: string }

// Only the client editor writes here. Petition text never goes to persistent browser storage.
// Keeping the original baseline also preserves the server's concurrent-edit check after recovery.
const calismalar = new Map<string, Calisma>()

export function calismayiOku(dosyaAnahtari: string): Calisma | undefined {
  const calisma = calismalar.get(dosyaAnahtari)
  return calisma ? { taslak: { ...calisma.taslak }, metin: calisma.metin } : undefined
}

export function calismayiSakla(dosyaAnahtari: string, taslak: TaslakKaydi, metin: string) {
  if (metin === (taslak.icerik ?? '')) {
    calismalar.delete(dosyaAnahtari)
    return
  }
  calismalar.set(dosyaAnahtari, { taslak: { ...taslak }, metin })
}

export function calismayiSil(dosyaAnahtari: string, beklenen?: { ciktiId: string; metin: string }) {
  const calisma = calismalar.get(dosyaAnahtari)
  if (beklenen && calisma && (calisma.taslak.id !== beklenen.ciktiId || calisma.metin !== beklenen.metin)) return
  calismalar.delete(dosyaAnahtari)
}

export function kurtarmaIleBaslat(taslaklar: TaslakKaydi[], calisma?: Calisma) {
  if (!calisma) return { taslaklar, seciliId: taslaklar[0]?.id ?? null, metin: taslaklar[0]?.icerik ?? '', kurtarildi: false }
  const guncel = taslaklar.find((t) => t.id === calisma.taslak.id)
  // Use the current status (in particular a sent/read-only record), but retain the old baseline.
  const taban = { ...(guncel ?? calisma.taslak), icerik: calisma.taslak.icerik }
  const kurtarilanlar = guncel
    ? taslaklar.map((t) => t.id === taban.id ? taban : t)
    : [taban, ...taslaklar]
  return { taslaklar: kurtarilanlar, seciliId: taban.id, metin: calisma.metin, kurtarildi: true }
}
