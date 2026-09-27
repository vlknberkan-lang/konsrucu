/**
 * KonsRücü — "Dosyaya Sor" AI asistanı · lib/konsrucu/dosya-sor.ts (server-only)
 * Dosyanın bağlamından (taraflar/tutarlar/aşamalar/belge metinleri/çıkarım) avukatın sorusunu yanıtlar.
 *
 * S09 (06, 5.6): yüzeyler 'soru' (Dosyaya Sor) ve 'yol' (Yol Göster) lib/ai/cagri.ts sarmalayıcısından
 * geçer. Bağlama TCKN, VKN ve adres hiç eklenmez (app/api/dosya-sor/route.ts); ad ve plaka jetonlanır,
 * cevap sunucuda geri açılır. Canlıda yüzey bayrağı kapalıyken açık bir cümleyle reddedilir.
 */
import 'server-only'
import { unvanGecir } from './unvan'
import { aiOturumu, aiKapiHatasiMi, acilamayanUyarisi, type MaskeKaynagi } from '@/lib/ai/cagri'

const MODEL = 'claude-sonnet-4-6' // hukuki Q&A → kalite katmanı

const SISTEM = `Sen alacaklı vekili bir hukuk bürosunun rücu/icra dosyalarında çalışan deneyimli bir hukuk asistanısın.
Sana bir dosyanın bağlamı (taraflar, tutarlar, aşamalar, belge metinleri, AI çıkarımı) verilir; avukatın sorusunu YALNIZCA bu bağlama dayanarak kısa, net, profesyonel Türkçe yanıtla.
- Bağlamda olmayan bir şeyi UYDURMA; bilgi yoksa "dosyada bu bilgi yok" de.
- Kesin hukuki tavsiye yerine dosyadaki veriye dayalı yorum/öneri ver; risk varsa "kontrol edilmeli" de.
- Sayı/tarih/numara verirken dosyadaki değeri aynen kullan. Sıradaki adımı önerirken kısa gerekçe ekle.
- Süre ya da son gün hesaplama; bir süreden söz edeceksen tetikleyen belgeyi ve tarihini göster, "hesap ve teyit avukatta" de.
- Cevap kısa olsun (gerektiği kadar); madde madde uygunsa madde kullan.`

// B41: örnek süre kuralı ("itiraza 7 gün") kaldırıldı — model bağlam dışı süre yazmaya itilmesin.
const SISTEM_YOL = `Sen alacaklı vekili bir hukuk bürosunun rücu/icra dosyalarında çalışan KIDEMLİ bir avukat asistanısın.
Sana dosyanın künyesi + KRONOLOJİK belge ve olay dökümü verilir (tebliğ, tensip, itiraz, haciz, tahsilat, makbuz, vekaletname…).
Belgelerin TOPLAMINA ve kronolojik sırasına bakarak şu başlıklarla kısa, net, profesyonel Türkçe değerlendirme yaz:
1. **Durum** — Süreç şu an nerede? (1-2 cümle)
2. **Kronoloji okuması** — Önemli adımlar ne zaman oldu, ne anlama geliyor (madde madde, tarihli).
3. **Riskler / dikkat** — Eksik/atlanmış adım, dikkat edilecek nokta. Her riskin dayandığı belge ya da olayı adıyla göster; dayanaksız risk yazma.
4. **Sıradaki adımlar** — Somut, sıralı yapılacaklar; her birine kısa gerekçe (yol göster).
SÜRE KURALI: Hafızandan süre ya da son gün YAZMA. Bir süreden söz edeceksen yalnız "Süre önerisi — tetikleyici: [belge adı, tarih]; hesap ve teyit avukatta" kalıbıyla yaz.
Yalnız verilen bilgilere dayan; UYDURMA. Bilgi yoksa "dosyada bu bilgi yok" de. Tarih/numara verirken dosyadaki değeri aynen kullan.`

type AiBaglami = { musteriId?: string; dosyaId?: string }
type Sonuc = { ok: boolean; cevap?: string; error?: string; kapali?: boolean }

function cevapla(metin: string, acilamayan: string[]): string {
  const uyari = acilamayanUyarisi(acilamayan)
  return (metin || '(boş yanıt)') + (uyari ? `\n\n⚠ ${uyari}` : '')
}

function hataSonucu(e: unknown): Sonuc {
  if (aiKapiHatasiMi(e)) return { ok: false, error: e.message, kapali: e.name === 'AiKvkkKapaliHata' }
  return { ok: false, error: 'Yapay zekâ yanıt veremedi; lütfen tekrar deneyin.' }
}

export async function dosyaYolGoster(baglam: string, alacakliUnvan?: string | null, ai?: AiBaglami, maske?: MaskeKaynagi): Promise<Sonuc> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: 'AI anahtarı (ANTHROPIC_API_KEY) tanımlı değil.' }
  const oturum = aiOturumu({ yuzey: 'yol', ai, maske })
  try {
    const y = await oturum.iste({
      model: MODEL,
      maxTokens: 1600,
      sistem: unvanGecir(SISTEM_YOL, alacakliUnvan),
      icerik: [
        { tur: 'belge', ad: 'Dosya künyesi ve kronolojik belge/olay dökümü', metin: baglam.slice(0, 120000) },
        { tur: 'metin', metin: 'GÖREV: Yukarıdaki belge ve olayların TOPLAMINI kronolojik değerlendir; süreç nerede, riskler ne, sıradaki adımlar ne — yol göster.' },
      ],
    })
    const kisaltildi = baglam.length > 120000 ? '\n\n(Not: dosya bağlamı uzunluk sınırı nedeniyle kısaltıldı; eski kayıtların bir kısmı değerlendirilmedi.)' : ''
    return { ok: true, cevap: cevapla(y.metin, y.acilamayanJetonlar) + kisaltildi }
  } catch (e) {
    return hataSonucu(e)
  }
}

export async function dosyaSor(baglam: string, soru: string, alacakliUnvan?: string | null, ai?: AiBaglami, maske?: MaskeKaynagi): Promise<Sonuc> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: 'AI anahtarı (ANTHROPIC_API_KEY) tanımlı değil.' }
  if (!soru.trim()) return { ok: false, error: 'Soru boş.' }
  const oturum = aiOturumu({ yuzey: 'soru', ai, maske })
  try {
    const y = await oturum.iste({
      model: MODEL,
      maxTokens: 1200,
      sistem: unvanGecir(SISTEM, alacakliUnvan),
      icerik: [
        { tur: 'belge', ad: 'Dosya bağlamı', metin: baglam.slice(0, 120000) },
        { tur: 'metin', metin: `SORU: ${soru.trim()}` },
      ],
    })
    return { ok: true, cevap: cevapla(y.metin, y.acilamayanJetonlar) }
  } catch (e) {
    return hataSonucu(e)
  }
}
