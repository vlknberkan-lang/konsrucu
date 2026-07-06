/**
 * KonsRücü — Takip Aç Kopilotu (Faz 1) · POST /api/uyap/takip-tevzi
 * Eklenti, UYAP tevzi (icra_takip_tevzi_islemleri) BAŞARILI dönünce sonucu buraya yazar:
 * hangi icra dairesine düştü, takibe esas tutar, tevzi anı. Esas no HENÜZ YOK — harç ödemesi
 * (manuel, avukatta) tamamlanınca dosya numara alır; o zaman mevcut "Takip Açıldı" formu /
 * senkron eşleşmesi devreye girer.
 *
 * İdempotent: cikarimJson.tevzi doluysa ikinci yazım REDDEDİLİR (çift tevzi koruması —
 * takip-hedefler de tevzi'li dosyayı listeden düşürür). Tenant-kapsamlı (Bearer).
 */
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { uyapKimlik, corsJson, preflight } from '@/lib/konsrucu/uyap-auth'

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return preflight()
}

/** UYAP "07/07/2026 00:09:39" (GG/AA/YYYY) → Date; bozuksa null. */
function uyapTarih(s: unknown): Date | null {
  const m = String(s ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/)
  if (!m) return null
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 12) - 3, +(m[5] ?? 0), +(m[6] ?? 0))) // TR saati → UTC
  return Number.isNaN(d.getTime()) ? null : d
}

export async function POST(req: Request) {
  const k = await uyapKimlik(req)
  if (!k) return corsJson({ ok: false, error: 'unauthorized' }, 401)

  let body: {
    dosyaId?: string
    tevzi?: { birimAdi?: string; birimID?: string; dosyaAcilisTarihi?: string; takibeEsasTutar?: number; uyapDosyaId?: string; harcToplam?: number }
  }
  try { body = await req.json() } catch { return corsJson({ ok: false, error: 'bad json' }, 400) }

  const dosyaId = String(body?.dosyaId ?? '').trim()
  const t = body?.tevzi
  if (!dosyaId || !t || !t.birimAdi) return corsJson({ ok: false, error: 'dosyaId ve tevzi.birimAdi gerekli' }, 400)

  const dosya = await prisma.rucuDosyasi.findFirst({
    where: { id: dosyaId, musteriId: { in: k.izinli } },
    select: { id: true, icraDairesi: true, cikarimJson: true, hukukDosyaNo: true },
  })
  if (!dosya) return corsJson({ ok: false, error: 'dosya bulunamadı' }, 404)

  const cj = (dosya.cikarimJson ?? {}) as Record<string, unknown>
  if (cj.tevzi) return corsJson({ ok: false, error: 'bu dosya zaten tevzi edilmiş', tevzi: cj.tevzi }, 409)

  const tevziKaydi = {
    birimAdi: String(t.birimAdi).slice(0, 160),
    birimID: t.birimID ? String(t.birimID).slice(0, 40) : null,
    dosyaAcilisTarihi: t.dosyaAcilisTarihi ? String(t.dosyaAcilisTarihi).slice(0, 40) : null,
    takibeEsasTutar: Number.isFinite(Number(t.takibeEsasTutar)) ? Number(t.takibeEsasTutar) : null,
    uyapDosyaId: t.uyapDosyaId ? String(t.uyapDosyaId).slice(0, 200) : null, // şifreli UYAP kimliği (ileride işe yarayabilir)
    harcToplam: Number.isFinite(Number(t.harcToplam)) ? Number(t.harcToplam) : null,
    at: new Date().toISOString(),
    kaynak: 'eklenti-kopilot',
  }

  const acilis = uyapTarih(t.dosyaAcilisTarihi)
  await prisma.rucuDosyasi.update({
    where: { id: dosya.id },
    data: {
      cikarimJson: { ...cj, tevzi: tevziKaydi } as Prisma.InputJsonValue,
      icraDairesi: dosya.icraDairesi ?? tevziKaydi.birimAdi, // senkronun (daire+esas) kimliği için daire hazır
      takipTarihi: acilis ?? undefined,
    },
  })

  const tutarStr = tevziKaydi.takibeEsasTutar != null ? `takibe esas ${tevziKaydi.takibeEsasTutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL` : ''
  const harcStr = tevziKaydi.harcToplam != null ? `harç ~${tevziKaydi.harcToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL` : ''
  await prisma.not.create({
    data: {
      dosyaId: dosya.id,
      tip: 'ISLEM',
      metin: [`UYAP tevzi tamamlandı (eklenti kopilotu): ${tevziKaydi.birimAdi}`, tutarStr, harcStr, 'Sırada: harç ödemesi (UYAP, manuel) → esas no gelince "Takip Açıldı" ile eşleştir.'].filter(Boolean).join(' · '),
    },
  })
  await prisma.aktivite.create({
    data: { dosyaId: dosya.id, eylem: `UYAP tevzi (eklenti kopilotu): ${tevziKaydi.birimAdi}`, detayJson: tevziKaydi as Prisma.InputJsonValue },
  })

  return corsJson({ ok: true, tevzi: tevziKaydi })
}
