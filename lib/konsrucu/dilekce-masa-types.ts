import type { dilekceSureleriniHazirla } from './dilekce-sureler'

export type MasaDosya = { id: string; no: string; taraf: string; mahkeme: string | null; taslakSayisi: number }
export type MasaDetay = MasaDosya & {
  ozet: string | null
  yazabilir: boolean
  belgeler: { id: string; ad: string; tarih: string; metinVar: boolean; acilabilir: boolean; uyap: boolean }[]
  gecmis: { id: string; tarih: string; baslik: string; metin: string; tarihEtiketi: string }[]
  ciktilar: { id: string; icerik: string | null; durum: string | null; createdAt: string }[]
  sureler: ReturnType<typeof dilekceSureleriniHazirla>
  kullanicilar: { id: string; ad: string; rol: string }[]
}

export type DilekceMasasiProps = {
  dosyalar: MasaDosya[]
  secili: MasaDetay | null
  toplam: number
  arama: string
  demo?: boolean
}
