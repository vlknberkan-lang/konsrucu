/**
 * KonsRücü — "Dosyaya Sor" ucu · app/api/dosya-sor/route.ts
 * POST { dosyaId, soru } → dosya bağlamı + AI yanıtı. Auth + tenant-kapsamlı.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { dosyaSor } from '@/lib/konsrucu/dosya-sor'

const fmtTRY = (n: unknown) => (n != null ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(Number(n)) + ' TL' : '—')
const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString('tr-TR') : '—')

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Oturum yok' }, { status: 401 })
  const dbUser = await prisma.kullanici.findUnique({ where: { id: user.id }, include: { musteriler: true } })
  if (!dbUser) return NextResponse.json({ ok: false, error: 'Yetki yok' }, { status: 401 })
  const izinli = dbUser.musteriler.map((m) => m.musteriId)

  const body = await req.json().catch(() => null)
  const dosyaId = String(body?.dosyaId ?? '')
  const soru = String(body?.soru ?? '')

  const dosya = await prisma.rucuDosyasi.findUnique({
    where: { id: dosyaId },
    include: {
      borclular: true,
      odemeler: true,
      asamalar: { orderBy: { sira: 'asc' } },
      belgeler: { select: { dosyaAdi: true, kategori: true, extractedText: true } },
    },
  })
  if (!dosya || !izinli.includes(dosya.musteriId)) return NextResponse.json({ ok: false, error: 'Dosya bulunamadı' }, { status: 404 })

  const cj = (dosya.cikarimJson ?? {}) as { aciklama?: string | null }
  const sat: string[] = []
  sat.push(`Hukuk dosya no: ${dosya.hukukDosyaNo ?? '—'} · Hasar no: ${dosya.hasarDosyaNo ?? '—'} · Branş: ${dosya.brans ?? '—'} · Durum: ${dosya.durum}`)
  sat.push(`Sigortalı: ${dosya.sigortaliUnvan ?? '—'} (${dosya.sigortaliPlaka ?? '—'}) · Karşı plaka: ${dosya.karsiPlaka ?? '—'} · Kaza yeri: ${dosya.kazaYeri ?? '—'} · Kaza tarihi: ${fmtDate(dosya.kazaTarihi)}`)
  sat.push(`Kusur: ${dosya.kusurDurumu ?? dosya.rucuOrani ?? '—'} · Asıl alacak: ${fmtTRY(dosya.asilAlacak)} · Rücu/kusur payı: ${fmtTRY(dosya.rucuTutari)} · İşlemiş faiz: ${fmtTRY(dosya.faizTutari)} · Zamanaşımı: ${fmtDate(dosya.zamanasimi)}`)
  sat.push(`Yetkili icra: ${dosya.yetkiliIcra ?? '—'} · İcra dairesi: ${dosya.icraDairesi ?? '—'} · İcra dosya no: ${dosya.icraDosyaNo ?? '—'}`)
  if (dosya.borclular.length) sat.push('Borçlular:\n' + dosya.borclular.map((b) => `  - ${b.adUnvan} (TC/VKN: ${b.tcVkn ?? '—'}, rol: ${b.rol}, teyit: ${b.teyitDurumu})`).join('\n'))
  if (dosya.asamalar.length) sat.push('Aşamalar:\n' + dosya.asamalar.map((a) => `  - ${a.tur} [${a.durum}${a.sonuc ? '/' + a.sonuc : ''}] no:${a.kimlikNo ?? '—'} birim:${a.birim ?? '—'} ${a.ozet ?? ''}`).join('\n'))
  if (cj.aciklama) sat.push(`Takip açıklaması: ${cj.aciklama}`)
  const belgeMetin = dosya.belgeler.filter((b) => b.extractedText).map((b) => `### ${b.dosyaAdi} (${b.kategori})\n${(b.extractedText ?? '').slice(0, 6000)}`).join('\n\n')
  if (belgeMetin) sat.push('BELGE METİNLERİ:\n' + belgeMetin)

  const r = await dosyaSor(sat.join('\n'), soru)
  return NextResponse.json(r, { status: r.ok ? 200 : 500 })
}
