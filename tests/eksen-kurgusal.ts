/**
 * Eksen testlerinin KURGUSAL senaryo verisi (test yardımcısı; kendisi test dosyası değildir).
 *
 * D1 ve D2 desenleri docs/04 §2'deki gerçek akışın GÜN SIRASINI taşır (takip → tebliğ → itiraz → arabuluculuk →
 * dava); adlar, numaralar ve metinler kurgusaldır, kişisel veri yoktur. Eklentinin gerçek sınıflandırıcısı
 * (extension/siniflandir.js) vm ile yüklenir: sunucuya giden `olaylar` onun ürettiğidir (sahte eklenti).
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

export type EklentiOlay = { tip: string; tarih: string | null; aciklama: string }
type Snf = { olaylarTuret: (rec: Record<string, unknown>) => EklentiOlay[]; ETIKET: Record<string, string> }

let snf: Snf | null = null
export function eklenti(): Snf {
  if (snf) return snf
  const baglam: { KonsSiniflandir?: Snf } = {}
  vm.createContext(baglam)
  vm.runInContext(readFileSync(path.join(process.cwd(), 'extension', 'siniflandir.js'), 'utf8'), baglam)
  snf = baglam.KonsSiniflandir!
  return snf
}

const J = <T>(x: T): T => JSON.parse(JSON.stringify(x))

/** D1 deseni: kasko halefiyeti, borçlu kamu idaresi; UETS tebliğ; tam itiraz; itirazın alacaklıya tebliği YOK;
 *  dosya alacağına haciz evrakları; harç ve tahsilat makbuzları. */
export const D1_REC = {
  durum: 'Açık (durdurulmuş : Takibe İtiraz)',
  acilis: '2026-06-21',
  evrak: [
    { tur: 'Ödeme İcra Emri', aciklama: '', tarih: '2026-06-21' },
    { tur: 'Harç Tahsil Makbuzu', aciklama: '', tarih: '2026-06-21' },
    { tur: 'Tebligat Talebi', aciklama: '', tarih: '2026-06-21' },
    { tur: 'E-Tebligat Mazbatası', aciklama: 'Ödeme emri', tarih: '2026-06-29', tebligTarihi: '2026-06-28' },
    { tur: 'Borca İtiraz Talebi', aciklama: '', tarih: '2026-06-24' },
    { tur: 'Dosya Alacağına Haciz Ekleme', aciklama: '', tarih: '2026-06-26' },
    { tur: 'Dosya Alacağına Haciz Silme', aciklama: '', tarih: '2026-07-10' },
    { tur: 'Tahsilat Makbuzu', aciklama: '', tarih: '2026-06-30' },
  ],
  safahat: [],
}

/** D2 deseni: ZMSS, iki borçlu; 1. tebligat İADE, 2. tebligat TK 21/2; itiraz; itirazın alacaklıya tebliği (UETS). */
export const D2_REC = {
  durum: 'Açık (durdurulmuş : Takibe İtiraz)',
  acilis: '2026-06-11',
  evrak: [
    { tur: 'Tebligat Mazbatası', aciklama: 'Bila tebliğ iade', tarih: '2026-06-18', tebligTarihi: '2026-06-16' },
    { tur: 'Tebligat Mazbatası', aciklama: 'Muhtara teslim TK 21/2', tarih: '2026-06-30', tebligTarihi: '2026-06-25' },
    { tur: 'Borca İtiraz Talebi', aciklama: '', tarih: '2026-06-26' },
    { tur: 'İtirazın Alacaklıya Tebliği', aciklama: 'E-Tebligat', tarih: '2026-07-01' },
  ],
  safahat: [],
}

export const d1Olaylari = () => J(eklenti().olaylarTuret(D1_REC))
export const d2Olaylari = () => J(eklenti().olaylarTuret(D2_REC))

/** Eklenti 1.9'un senkron gövdesi (content.js senkronGovde biçimi) — sahte eklenti kaydı. */
export function govde(dosyaId: string, rec: typeof D1_REC, p: { tahsilat?: number | null; olaylar?: EklentiOlay[] } = {}) {
  return {
    dosyaId, icraDosyaNo: '2026/0001', eslesme: { durum: 'OK', not: null },
    durum: rec.durum,
    olaylar: p.olaylar ?? J(eklenti().olaylarTuret(rec)),
    hesap: {
      durumMetni: rec.durum, birim: null, toplamAlacak: 100000, asilAlacak: 90000, islemisFaiz: 10000,
      tahsilat: p.tahsilat === undefined ? 0 : p.tahsilat, bakiye: null, evrakSayisi: rec.evrak.length, asama: null, uyapAcilis: rec.acilis,
    },
  }
}

/** Kurgusal mazbata metinleri (S23; biri "taranmış" — OCR ile okunmuş gibi). Adlar kurgusaldır. */
export const MAZBATA = {
  d1Uets:
    'ELEKTRONİK TEBLİGAT MAZBATASI. Muhatap: [Kurgusal Borçlu İdare] Belediye Başkanlığı. Evrak: Ödeme emri. ' +
    'Tebligatın muhatabın elektronik adresine ulaştığı tarih: 23.06.2026. Tebligat K. 7/a uyarınca ulaşmayı izleyen 5. günün sonunda okundu sayılır.',
  d2Iade:
    'TEBLİGAT MAZBATASI. Muhatap: [Kurgusal Borçlu Bir]. Bila tebliğ iade: muhatap adreste bulunamadı, ' +
    'komşusu adresten taşınmış olduğunu beyan etti. 16.06.2026 tarihinde iade edildi. T.C. Kimlik No: 12345678950',
  d2Tk21Ocr:
    'TEBLiGAT MAZBATASI  Muhatap: [Kurgusal Borçlu Bir]  Muhatap adreste bulunamadığından tebliğ evrakı ' +
    '25.06.2026 tarihinde mahalle muhtarına teslim edildi, ihbarname kapısına yapıştırıldı (TK 21/2). Tel: 0532 111 22 33',
  d2Alacakliya:
    'ELEKTRONİK TEBLİGAT MAZBATASI. Muhatap: Alacaklı vekili Av. [Kurgusal Vekil]. Evrak: Borca itiraz dilekçesi. ' +
    'Ulaştığı tarih: 26.06.2026. Okunduğu tarih: 01.07.2026.',
}
