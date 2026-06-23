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
