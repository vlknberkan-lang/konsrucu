/**
 * KonsRücü — "Dosyaya Sor" AI asistanı · lib/konsrucu/dosya-sor.ts (server-only)
 * Dosyanın bağlamından (taraflar/tutarlar/aşamalar/belge metinleri/çıkarım) avukatın sorusunu yanıtlar.
 */
import 'server-only'
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-4-6' // hukuki Q&A → kalite katmanı

const SISTEM = `Sen Küçükislamoğlu Hukuk'un Ray Sigorta rücu/icra dosyalarında çalışan deneyimli bir hukuk asistanısın.
Sana bir dosyanın bağlamı (taraflar, tutarlar, aşamalar, belge metinleri, AI çıkarımı) verilir; avukatın sorusunu YALNIZCA bu bağlama dayanarak kısa, net, profesyonel Türkçe yanıtla.
- Bağlamda olmayan bir şeyi UYDURMA; bilgi yoksa "dosyada bu bilgi yok" de.
- Kesin hukuki tavsiye yerine dosyadaki veriye dayalı yorum/öneri ver; risk varsa "kontrol edilmeli" de.
- Sayı/tarih/numara verirken dosyadaki değeri aynen kullan. Sıradaki adımı önerirken kısa gerekçe ekle.
- Cevap kısa olsun (gerektiği kadar); madde madde uygunsa madde kullan.`

const SISTEM_YOL = `Sen Küçükislamoğlu Hukuk'un Ray Sigorta rücu/icra dosyalarında çalışan KIDEMLİ bir icra-takip avukatısın.
Sana dosyanın künyesi + KRONOLOJİK belge ve olay dökümü verilir (tebliğ, tensip, itiraz, haciz, tahsilat, makbuz, vekaletname…).
Belgelerin TOPLAMINA ve kronolojik sırasına bakarak şu başlıklarla kısa, net, profesyonel Türkçe değerlendirme yaz:
1. **Durum** — Süreç şu an nerede? (1-2 cümle)
2. **Kronoloji okuması** — Önemli adımlar ne zaman oldu, ne anlama geliyor (madde madde, tarihli).
3. **Riskler / dikkat** — Zamanaşımı, işleyen/kaçan süreler (örn. itiraza 7 gün), eksik/atlanmış adım.
4. **Sıradaki adımlar** — Somut, sıralı yapılacaklar; her birine kısa gerekçe (yol göster).
Yalnız verilen bilgilere dayan; UYDURMA. Bilgi yoksa "dosyada bu bilgi yok" de. Tarih/numara verirken dosyadaki değeri aynen kullan.`

export async function dosyaYolGoster(baglam: string): Promise<{ ok: boolean; cevap?: string; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { ok: false, error: 'AI anahtarı (ANTHROPIC_API_KEY) tanımlı değil.' }
  const client = new Anthropic({ apiKey: key })
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1600,
      system: SISTEM_YOL,
      messages: [{ role: 'user', content: `DOSYA — KÜNYE + KRONOLOJİK BELGE/OLAY DÖKÜMÜ:\n${baglam.slice(0, 120000)}\n\nGÖREV: Yukarıdaki belge ve olayların TOPLAMINI kronolojik değerlendir; süreç nerede, riskler ne, sıradaki adımlar ne — yol göster.` }],
    })
    const txt = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim()
    return { ok: true, cevap: txt || '(boş yanıt)' }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function dosyaSor(baglam: string, soru: string): Promise<{ ok: boolean; cevap?: string; error?: string }> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { ok: false, error: 'AI anahtarı (ANTHROPIC_API_KEY) tanımlı değil.' }
  if (!soru.trim()) return { ok: false, error: 'Soru boş.' }
  const client = new Anthropic({ apiKey: key })
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: SISTEM,
      messages: [{ role: 'user', content: `DOSYA BAĞLAMI:\n${baglam.slice(0, 120000)}\n\nSORU: ${soru.trim()}` }],
    })
    const txt = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim()
    return { ok: true, cevap: txt || '(boş yanıt)' }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
