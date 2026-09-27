/**
 * S16 · Evrak metin hattı v1 — UYAP evrak ucu (POST /api/uyap/evrak) metni Belge.extractedText'e yazar;
 * metin çıkarma/yazma hatası evrak yüklemesini ASLA bozmaz; taranmış evrakta yalnız "OCR gerekli" işareti.
 * DB/Storage/kimlik sahte (vi.mock); metin çıkarıcı GERÇEK (kurgusal UDF/PDF kodda üretilir).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import JSZip from 'jszip'

const m = vi.hoisted(() => ({
  findFirst: vi.fn(),
  queryRaw: vi.fn(),
  belgeCreate: vi.fn(),
  belgeUpdate: vi.fn(),
  aktivite: vi.fn(),
  upload: vi.fn(),
  metinYaz: null as null | ((...a: unknown[]) => unknown),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    rucuDosyasi: { findFirst: m.findFirst },
    $queryRaw: m.queryRaw,
    belge: { create: m.belgeCreate, update: m.belgeUpdate },
    aktivite: { create: m.aktivite },
  },
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ storage: { from: () => ({ upload: m.upload }) } }) }))
vi.mock('@/lib/konsrucu/uyap-auth', () => ({
  uyapKimlik: async () => ({ userId: 'kullanici-1', izinli: ['musteri-1'] }),
  corsJson: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  preflight: () => new Response(null, { status: 204 }),
}))
vi.mock('@/lib/konsrucu/onemli-olay', () => ({ belgeBorcaItirazMi: () => false, belgeItirazTarihiCikar: () => null, onemliOlayTespit: vi.fn() }))
vi.mock('@/lib/konsrucu/masraf-cikar', () => ({ belgedenMasrafCikar: vi.fn() }))
// belgeMetniniYaz gerçek kalır; bir testte "beklenmedik fırlatma" için değiştirilir
vi.mock('@/lib/konsrucu/evrak-metin/sunucu', async (importOriginal) => {
  const gercek = await importOriginal<typeof import('@/lib/konsrucu/evrak-metin/sunucu')>()
  return { ...gercek, belgeMetniniYaz: (...a: Parameters<typeof gercek.belgeMetniniYaz>) => (m.metinYaz ? m.metinYaz(...a) : gercek.belgeMetniniYaz(...a)) }
})

import { POST } from '@/app/api/uyap/evrak/route'

async function udfYap(metin: string): Promise<Uint8Array> {
  const z = new JSZip()
  z.file('content.xml', `<?xml version="1.0" encoding="UTF-8" ?><template format_id="1.8"><content><![CDATA[${metin}]]></content><elements resolver="hvl-default"><paragraph><content startOffset="0" length="${metin.length}"/></paragraph></elements></template>`)
  return z.generateAsync({ type: 'uint8array' })
}

/** Yalnız tam sayfa görüntü içeren (taranmış) tek sayfalık kurgusal PDF. */
function taranmisPdf(): Uint8Array {
  const gri = 'ff00ff00>'
  const ic = 'q 595 0 0 842 0 0 cm /Im1 Do Q\n'
  const nesneler = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [5 0 R] /Count 1 >>',
    `<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length ${gri.length} >>\nstream\n${gri}\nendstream`,
    `<< /Length ${ic.length} >>\nstream\n${ic}endstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 3 0 R >> >> /Contents 4 0 R >>',
  ]
  let out = '%PDF-1.4\n'
  const ofs: number[] = []
  nesneler.forEach((n, i) => { ofs.push(out.length); out += `${i + 1} 0 obj\n${n}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${nesneler.length + 1}\n0000000000 65535 f \n` + ofs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${nesneler.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Uint8Array.from(Buffer.from(out, 'latin1'))
}

function istek(bayt: Uint8Array, dosyaAdi: string): Request {
  return new Request('http://yerel/api/uyap/evrak', {
    method: 'POST',
    body: JSON.stringify({ dosyaId: 'dosya-1', uyapEvrakId: 'KURGUSALEVRAKKIMLIK1-oturum', dosyaAdi, contentBase64: Buffer.from(bayt).toString('base64') }),
  })
}

const UDF_METNI = 'KURGUSAL İCRA DAİRESİ\nÖdeme emri borçluya tebliğ edilmiştir. Bu metin testte üretilmiştir.'

beforeEach(() => {
  vi.clearAllMocks()
  m.metinYaz = null
  m.findFirst.mockResolvedValue({ id: 'dosya-1', durum: 'TAKIPTE', uyapDurum: null })
  m.queryRaw.mockResolvedValue([])
  m.upload.mockResolvedValue({ error: null })
  m.belgeCreate.mockResolvedValue({ id: 'belge-1' })
  m.belgeUpdate.mockResolvedValue({})
  m.aktivite.mockResolvedValue({})
})

describe('POST /api/uyap/evrak — evrak metni (S16)', () => {
  it("UDF'nin metni Belge.extractedText'e yazılır (mevcut alan, yeni kolon yok)", async () => {
    const r = await POST(istek(await udfYap(UDF_METNI), 'Ödeme Emri 2099-01-02.pdf'))
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j).toMatchObject({ ok: true, eklendi: true })
    expect(j.metin).toMatchObject({ durum: 'OKUNDU', yontem: 'UDF', ocrGerekli: false, yazildi: true, not: null })
    expect(m.belgeCreate).toHaveBeenCalledTimes(1)
    expect(m.belgeUpdate).toHaveBeenCalledWith({ where: { id: 'belge-1' }, data: { extractedText: UDF_METNI } })
    expect(m.aktivite.mock.calls[0][0].data.eylem).toBe("UYAP'tan evrak indi: Ödeme Emri 2099-01-02.pdf")
  })

  it('taranmış PDF: metin yazılmaz, yalnız "OCR gerekli" işareti (Aktivite + yanıt)', async () => {
    const r = await POST(istek(taranmisPdf(), 'Tebliğ Mazbatası 2099-01-03.pdf'))
    const j = await r.json()
    expect(j).toMatchObject({ ok: true, eklendi: true })
    expect(j.metin).toMatchObject({ durum: 'OCR_GEREKLI', ocrGerekli: true, yazildi: false })
    expect(m.belgeUpdate).not.toHaveBeenCalled()
    expect(m.aktivite.mock.calls[0][0].data.eylem).toBe("UYAP'tan evrak indi: Tebliğ Mazbatası 2099-01-03.pdf · taranmış evrak — metin yok, OCR gerekli")
  })

  it('metin DB yazımı patlarsa yükleme yine başarılı', async () => {
    m.belgeUpdate.mockRejectedValue(new Error('bağlantı koptu'))
    const r = await POST(istek(await udfYap(UDF_METNI), 'Evrak.udf'))
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j).toMatchObject({ ok: true, eklendi: true })
    expect(j.metin).toMatchObject({ durum: 'OKUNDU', yazildi: false })
    expect(m.aktivite).toHaveBeenCalledTimes(1)
  })

  it('KVKK: DB hatası evrak metnini içerse bile günlüğe metin yazılmaz (yalnız hata adı/kodu)', async () => {
    const hata = Object.assign(new Error(`Invalid prisma.belge.update() invocation: { data: { extractedText: "${UDF_METNI}" } }`), { name: 'PrismaClientKnownRequestError', code: 'P2000' })
    m.belgeUpdate.mockRejectedValue(hata)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const r = await POST(istek(await udfYap(UDF_METNI), 'Evrak.udf'))
      expect(r.status).toBe(200)
      const yazilan = log.mock.calls.map((c) => c.map(String).join(' ')).join('\n')
      expect(yazilan).toContain('PrismaClientKnownRequestError P2000')
      expect(yazilan).not.toContain(UDF_METNI.slice(0, 20))
    } finally {
      log.mockRestore()
    }
  })

  it('süre: fonksiyon süresi metin bütçesinin rahatça üstünde (varsayılan 10–15 sn sınırına sıkışmaz)', async () => {
    const { maxDuration } = await import('@/app/api/uyap/evrak/route')
    const { METIN_BUTCE_MS } = await import('@/lib/konsrucu/evrak-metin/sunucu')
    expect(maxDuration * 1000).toBeGreaterThanOrEqual(METIN_BUTCE_MS * 5)
    expect(maxDuration).toBeLessThanOrEqual(60) // her Vercel planında geçerli üst sınır
  })

  it('metin hattı beklenmedik biçimde fırlatsa bile yükleme yine başarılı', async () => {
    m.metinYaz = () => { throw new Error('beklenmedik') }
    const r = await POST(istek(await udfYap(UDF_METNI), 'Evrak.udf'))
    const j = await r.json()
    expect(r.status).toBe(200)
    expect(j).toMatchObject({ ok: true, eklendi: true, metin: null })
    expect(m.belgeCreate).toHaveBeenCalledTimes(1)
    expect(m.aktivite.mock.calls[0][0].data.eylem).toBe("UYAP'tan evrak indi: Evrak.udf")
  })

  it('okunamayan bayt (bozuk dosya) yüklemeyi bozmaz; metin yazılmaz', async () => {
    const r = await POST(istek(Uint8Array.from({ length: 64 }, (_, i) => (i * 53) % 256), 'Bozuk Evrak.pdf'))
    const j = await r.json()
    expect(j).toMatchObject({ ok: true, eklendi: true })
    expect(j.metin.durum).toBe('HATA')
    expect(m.belgeUpdate).not.toHaveBeenCalled()
  })

  it('mükerrer evrak (aynı UYAP kimliği) atlanır: metin hattı hiç çalışmaz', async () => {
    m.queryRaw.mockResolvedValue([{ x: 1 }])
    const r = await POST(istek(await udfYap(UDF_METNI), 'Evrak.udf'))
    expect(await r.json()).toMatchObject({ ok: true, atlandi: true })
    expect(m.belgeCreate).not.toHaveBeenCalled()
    expect(m.belgeUpdate).not.toHaveBeenCalled()
  })
})
