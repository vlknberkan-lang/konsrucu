/**
 * AI çıktısı zod doğrulama (toolCikti) — forced-tool-use `input`'u bozuk/eksik şekil dönerse `as`
 * cast'iyle sessizce kabul edilmemeli; null dönüp çağıran graceful yola (null/[]) düşmeli.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { toolCikti } from '@/lib/konsrucu/ai-util'

// analizEt'in çekirdek kontratının küçük bir örneği
const Z = z.object({
  yol: z.enum(['klasik', 'idari', 'belirsiz']),
  borclular: z.array(z.object({ adUnvan: z.string() }).passthrough()),
}).passthrough()

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {}) // başarısızlık logunu sustur
})

describe('toolCikti', () => {
  it('geçerli şekil geçer ve fazladan alanları korur (passthrough)', () => {
    const r = toolCikti({ yol: 'klasik', borclular: [{ adUnvan: 'X', tcVkn: '123' }], aciklama: 'not' }, Z, 't')
    expect(r).not.toBeNull()
    expect(r!.borclular[0].adUnvan).toBe('X')
    expect((r as Record<string, unknown>).aciklama).toBe('not') // passthrough
  })

  it('eksik/bozuk şekil → null', () => {
    expect(toolCikti({ borclular: [] }, Z, 't')).toBeNull() // yol yok
    expect(toolCikti({ yol: 'boş', borclular: [] }, Z, 't')).toBeNull() // yol enum dışı
    expect(toolCikti({ yol: 'klasik', borclular: [{}] }, Z, 't')).toBeNull() // borçlu adUnvan yok
    expect(toolCikti(null, Z, 't')).toBeNull()
    expect(toolCikti('değil', Z, 't')).toBeNull()
  })
})
