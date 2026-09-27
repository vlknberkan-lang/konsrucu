/**
 * KonsRücü — Dosya Yol Haritası · sıradaki adım · lib/konsrucu/yol-haritasi/siradaki-adim.ts (saf; client-safe)
 *
 * `siradakiAdim(g, bugun) → { simdi, sonra[≤3], engeller[], bekleme?, bilgi[] }` (06 §8.1). Veritabanına erişmez.
 *
 * Seçim (06 §8.2): eşleşen EYLEM adımları öncelik numarasına göre sıralanır (0 veri engeli … 5 evre ilerletme);
 * eşitlikte en yakın son gün, o da eşitse kural tablosundaki sıra kazanır. "Şimdi" en düşük numaradır; en çok
 * 3'ü "Sonra"ya girer, kalanı katlanır. Yapılacak iş yoksa bekleme kartı gösterilir (EV-02, TB-03 … ya da GN-08).
 *
 * Güvenlik:
 *   - Bir kural hesaplanırken hata verirse sessizce atlanmaz: "Durum bilinmiyor" türünde bir ENGEL adımı üretilir
 *     (program bilmediğini tahmin etmez; 06 2(b)).
 *   - Ertelenen adım bitiş gününe kadar Şimdi/Sonra'ya girmez; ama öncelik 0–2 (veri engeli, süre riski, süre
 *     başlatan aday) HİÇBİR ZAMAN ertelenmez.
 *   - Prova modunda (g.kesimTarihi dolu) canlı veriye dayanan kurallar (nabız, son senkron) değerlendirilmez.
 */
import type { Adim, Eslesme, Gercekler, Kural, SiradakiAdimSonuc } from './tipler'
import { KURALLAR } from './kurallar'
import { gunMetni, istGun, kalan } from './yardimci'

/** Ertelenemeyen en yüksek öncelik numarası (0, 1, 2 ertelenmez). */
export const ERTELENEMEZ_ONCELIK = 2

/** "Sonra" listesinin görünen uzunluğu. */
export const SONRA_EN_COK = 3

function adimKur(k: Kural, e: Eslesme, bugun: Date): Adim {
  const eylem = e.eylem === undefined ? k.eylem : e.eylem
  // EYLEM kuralı duruma göre eylemsiz dönebilir (ör. TK-03 "Harç ödemesi bekleniyor") → bekleme sayılır
  const tur = k.tur === 'EYLEM' && !eylem ? 'BEKLEME' : k.tur
  const oncelik = tur === 'BEKLEME' ? 6 : k.oncelik
  return {
    kural: k.kod,
    surum: k.surum,
    grup: k.grup,
    durak: e.durak ?? k.durak,
    oncelik,
    rol: tur === 'EYLEM' ? k.rol : '-',
    engel: tur === 'EYLEM' && k.engel,
    tur,
    metin: e.metin,
    neden: e.neden,
    eylem: tur === 'EYLEM' ? eylem : null,
    sonGun: gunMetni(e.sonGun ?? null),
    kalanGun: e.sonGun ? kalan(e.sonGun, bugun) : null,
    hukukiEtiket: k.hukukiEtiket,
    kanit: e.kanit,
    adet: Math.max(1, e.adet ?? 1),
    ertelendi: null,
  }
}

/** Kural hesaplanamadıysa: güvenli yön — engel olarak göster. */
function hataAdimi(k: Kural): Adim {
  return {
    kural: k.kod, surum: k.surum, grup: k.grup, durak: k.durak, oncelik: 0, rol: 'A', engel: true, tur: 'EYLEM',
    metin: `Durum bilinmiyor: ${k.kod} kuralı hesaplanamadı, dosyayı elle kontrol edin`,
    neden: 'Yönlendirme kuralı bu dosyanın verisiyle çalışırken hata verdi; program tahmin etmek yerine durur. Bu durum "Bu öneri yanlış" ile bildirilebilir.',
    eylem: { etiket: 'Durumu teyit et', hedef: 'durum-teyit' }, sonGun: null, kalanGun: null, hukukiEtiket: null, kanit: [], adet: 1, ertelendi: null,
  }
}

function sirala(a: { adim: Adim; sira: number }, b: { adim: Adim; sira: number }): number {
  if (a.adim.oncelik !== b.adim.oncelik) return a.adim.oncelik - b.adim.oncelik
  const sa = a.adim.sonGun, sb = b.adim.sonGun
  if (sa && sb && sa !== sb) return sa < sb ? -1 : 1
  if (sa && !sb) return -1
  if (!sa && sb) return 1
  return a.sira - b.sira
}

/** Kural için geçerli erteleme bitişi (bugünden sonra biten en geç kayıt). */
function ertelemeBitisi(g: Gercekler, kod: string, bugun: Date): Date | null {
  let m: Date | null = null
  for (const e of g.ertelemeler) {
    if (e.kural !== kod) continue
    if (istGun(e.bitis) <= istGun(bugun)) continue
    if (!m || e.bitis.getTime() > m.getTime()) m = e.bitis
  }
  return m
}

export interface SiradakiAdimSecenek {
  /** Test ve sürüm karşılaştırması için farklı tablo verilebilir; varsayılan KURALLAR. */
  kurallar?: readonly Kural[]
}

/**
 * Sıradaki adım. `bugun` canlıda şu an, provada kesim anıdır. Saf fonksiyon: aynı girdi → aynı çıktı.
 */
export function siradakiAdim(g: Gercekler, bugun: Date, secenek: SiradakiAdimSecenek = {}): SiradakiAdimSonuc {
  const tablo = secenek.kurallar ?? KURALLAR
  const prova = !!g.kesimTarihi
  const eylemler: { adim: Adim; sira: number }[] = []
  const beklemeler: { adim: Adim; sira: number }[] = []
  const bilgi: Adim[] = []
  const ertelenenler: Adim[] = []
  let gn08: Adim | null = null

  for (let sira = 0; sira < tablo.length; sira++) {
    const k = tablo[sira]
    if (prova && k.canli) continue
    let e: Eslesme | null
    try {
      e = k.degerlendir(g, bugun)
    } catch {
      eylemler.push({ adim: hataAdimi(k), sira })
      continue
    }
    if (!e) continue
    const adim = adimKur(k, e, bugun)
    if (k.kod === 'GN-08') { gn08 = adim; continue }
    if (adim.tur === 'BILGI') { bilgi.push(adim); continue }
    if (adim.tur === 'BEKLEME') { beklemeler.push({ adim, sira }); continue }
    const bitis = !prova && adim.oncelik > ERTELENEMEZ_ONCELIK ? ertelemeBitisi(g, k.kod, bugun) : null
    if (bitis) { ertelenenler.push({ ...adim, ertelendi: gunMetni(bitis) }); continue }
    eylemler.push({ adim, sira })
  }

  eylemler.sort(sirala)
  beklemeler.sort(sirala)
  const sirali = eylemler.map((x) => x.adim)
  const simdi = sirali[0] ?? null
  const sonra = sirali.slice(1, 1 + SONRA_EN_COK)
  return {
    simdi,
    sonra,
    sonraKatlanan: Math.max(0, sirali.length - 1 - SONRA_EN_COK),
    engeller: sirali.filter((a) => a.engel),
    bekleme: simdi ? null : (beklemeler[0]?.adim ?? gn08),
    bilgi,
    ertelenenler,
    tumu: sirali,
    bugun: gunMetni(bugun) as string,
    prova,
  }
}

/** "Şimdi ne yapmalıyım?" sorusunun tek cümlelik yanıtı. */
export function tekCumle(s: SiradakiAdimSonuc): string {
  const nokta = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`)
  if (s.simdi) return nokta(`Şimdi: ${s.simdi.metin}`)
  if (s.bekleme) return nokta(`Bekliyoruz: ${s.bekleme.metin.replace(/^Beklenen:\s*/, '')}`)
  return 'Şu an yapmanız gereken bir iş yok.'
}
