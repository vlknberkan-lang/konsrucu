/**
 * KonsRücü — "Dosyaya Sor" ucu · app/api/dosya-sor/route.ts
 * POST { dosyaId, soru } → dosya bağlamı + AI yanıtı. Auth + tenant-kapsamlı.
 * S09: bağlama TCKN, VKN ve adres HİÇ eklenmez; adlar, plakalar ve telefonlar lib/ai/cagri.ts'te
 * jetonlanır (bilinen kayıtlar maske kaynağı olarak verilir), cevap sunucuda geri açılır.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { dosyaSor, dosyaYolGoster } from '@/lib/konsrucu/dosya-sor'
import { tarihTR } from '@/lib/konsrucu/format'
import { KVKK_KAPALI_MESAJI, yuzeyAcik } from '@/lib/ai/bayrak'

const fmtTRY = (n: unknown) => (n != null ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(Number(n)) + ' TL' : '—')
const fmtDate = (d: Date | null) => tarihTR(d)

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
  const mode = String(body?.mode ?? '')
  // KVKK kapısı (S02/S09): yüzey canlıda kapalıysa dosya verisi hiç okunmaz, AI'a hiçbir şey gitmez.
  if (!yuzeyAcik(mode === 'yol' ? 'yol' : 'soru')) return NextResponse.json({ ok: false, error: KVKK_KAPALI_MESAJI, kapali: true }, { status: 403 })

  const dosya = await prisma.rucuDosyasi.findUnique({
    where: { id: dosyaId },
    include: {
      borclular: true,
      odemeler: true,
      asamalar: { orderBy: { sira: 'asc' } },
      belgeler: { select: { dosyaAdi: true, kategori: true, extractedText: true, createdAt: true, kaynakRef: true } },
      olaylar: true,
    },
  })
  if (!dosya || !izinli.includes(dosya.musteriId)) return NextResponse.json({ ok: false, error: 'Dosya bulunamadı' }, { status: 404 })
  const ayar = await prisma.ayarlar.findUnique({ where: { musteriId: dosya.musteriId }, select: { alacakliUnvan: true } })

  const cj = (dosya.cikarimJson ?? {}) as { aciklama?: string | null }
  const sat: string[] = []
  sat.push(`Hukuk dosya no: ${dosya.hukukDosyaNo ?? '—'} · Hasar no: ${dosya.hasarDosyaNo ?? '—'} · Branş: ${dosya.brans ?? '—'} · Durum: ${dosya.durum}`)
  sat.push(`Sigortalı: ${dosya.sigortaliUnvan ?? '—'} (${dosya.sigortaliPlaka ?? '—'}) · Karşı plaka: ${dosya.karsiPlaka ?? '—'} · Kaza yeri: ${dosya.kazaYeri ?? '—'} · Kaza tarihi: ${fmtDate(dosya.kazaTarihi)}`)
  sat.push(`Kusur: ${dosya.kusurDurumu ?? dosya.rucuOrani ?? '—'} · Asıl alacak: ${fmtTRY(dosya.asilAlacak)} · Rücu/kusur payı: ${fmtTRY(dosya.rucuTutari)} · İşlemiş faiz: ${fmtTRY(dosya.faizTutari)} · Zamanaşımı: ${fmtDate(dosya.zamanasimi)}`)
  sat.push(`Yetkili icra: ${dosya.yetkiliIcra ?? '—'} · İcra dairesi: ${dosya.icraDairesi ?? '—'} · İcra dosya no: ${dosya.icraDosyaNo ?? '—'}`)
  // KVKK (S09): TCKN/VKN ve adres bağlama girmez; yalnız ad (jetonlanır), rol ve teyit durumu.
  if (dosya.borclular.length) sat.push('Borçlular:\n' + dosya.borclular.map((b) => `  - ${b.adUnvan} (rol: ${b.rol}, teyit: ${b.teyitDurumu})`).join('\n'))
  if (dosya.asamalar.length) sat.push('Aşamalar:\n' + dosya.asamalar.map((a) => `  - ${a.tur} [${a.durum}${a.sonuc ? '/' + a.sonuc : ''}] no:${a.kimlikNo ?? '—'} birim:${a.birim ?? '—'} ${a.ozet ?? ''}`).join('\n'))
  if (cj.aciklama) sat.push(`Takip açıklaması: ${cj.aciklama}`)
  const belgeMetin = dosya.belgeler.filter((b) => b.extractedText).map((b) => `### ${b.dosyaAdi} (${b.kategori})\n${(b.extractedText ?? '').slice(0, 6000)}`).join('\n\n')
  if (belgeMetin) sat.push('BELGE METİNLERİ:\n' + belgeMetin)

  // KRONOLOJİK belge + olay dökümü (yol göster için kilit; UYAP evrak adında tarih varsa ondan sırala)
  const adTarih = (ad: string): number | null => {
    const m = ad.match(/(\d{4})[-.](\d{2})[-.](\d{2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime()
    const m2 = ad.match(/(\d{2})[.](\d{2})[.](\d{4})/); if (m2) return new Date(+m2[3], +m2[2] - 1, +m2[1]).getTime()
    return null
  }
  const tl: { t: number; tip: string; metin: string }[] = []
  for (const b of dosya.belgeler) tl.push({ t: adTarih(b.dosyaAdi) ?? b.createdAt.getTime(), tip: b.kaynakRef ? 'UYAP-EVRAK' : 'BELGE', metin: `${b.dosyaAdi} (${b.kategori})` })
  for (const o of dosya.olaylar) tl.push({ t: o.tarih ? o.tarih.getTime() : o.createdAt.getTime(), tip: o.tip, metin: o.aciklama ?? o.tip })
  tl.sort((a, b) => a.t - b.t)
  if (tl.length) sat.push('KRONOLOJİK BELGE/OLAY DÖKÜMÜ (eskiden yeniye):\n' + tl.map((x) => `  - ${fmtDate(new Date(x.t))} · [${x.tip}] ${x.metin}`).join('\n'))

  const aiCtx = { musteriId: dosya.musteriId, dosyaId: dosya.id }
  // Bilinen kişisel veriler (DB sırasıyla → deterministik jetonlar). TCKN/VKN bağlamda yok ama belge
  // metinlerinde geçebilir: burada yalnız maskelensin diye verilir.
  const maske = {
    kisiler: [...dosya.borclular.map((b) => b.adUnvan), dosya.sigortaliUnvan],
    kimlikler: dosya.borclular.map((b) => b.tcVkn),
    telefonlar: [...dosya.borclular.map((b) => b.telefon), dosya.sigortaliTelefon],
    plakalar: [dosya.sigortaliPlaka, dosya.karsiPlaka],
  }
  const r = mode === 'yol'
    ? await dosyaYolGoster(sat.join('\n'), ayar?.alacakliUnvan ?? null, aiCtx, maske)
    : await dosyaSor(sat.join('\n'), soru, ayar?.alacakliUnvan ?? null, aiCtx, maske)
  return NextResponse.json(r, { status: r.ok ? 200 : r.kapali ? 403 : 500 })
}
