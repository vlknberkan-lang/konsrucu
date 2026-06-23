/**
 * KonsRücü — Dosya Detay · app/(app)/akilli-giris/[id]/page.tsx
 * Tasarım: "Dosya Detay" mockup'ından birebir (2 kolon + 372px yapışkan sağ rail "kuzey yıldızı").
 * Tüm veri gerçek DB'den (RucuDosyasi + ilişkiler); AI çıkarımı bizim analizEt (lib/konsrucu/analiz.ts).
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft, Sparkles, Check, AlertTriangle, Clock, Scale, Send, StickyNote } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { footerOlustur, aciklamaTam } from '@/lib/konsrucu/takip'
import { faizHesapla, oranlariOku, sonDekontTarihi, odenenToplam, type DekontGirdi } from '@/lib/konsrucu/faiz'
import { takipAcildi } from '../actions'
import { FaizPanel } from '@/components/akilli-giris/detay/faiz-panel'
import { Kopyala } from '@/components/akilli-giris/kopyala'
import { Badge, type Tone } from '@/components/konsrucu/ui'
import { AiCikarButton } from '@/components/akilli-giris/detay/ai-cikar-button'
import { NotForm } from '@/components/akilli-giris/detay/not-form'
import { EvrakGruplari } from '@/components/akilli-giris/detay/evrak-gruplari'
import { BelgeEkle } from '@/components/akilli-giris/detay/belge-ekle'
import { CikarimDuzenle } from '@/components/akilli-giris/detay/cikarim-duzenle'
import { AciklamaDuzenle } from '@/components/akilli-giris/detay/aciklama-duzenle'
import { BorclularDuzenle } from '@/components/akilli-giris/detay/borclular-duzenle'
import { OnayButonu } from '@/components/akilli-giris/detay/onay-butonu'
import { TakipSureci } from '@/components/akilli-giris/detay/takip-sureci'
import { UyapXmlButon } from '@/components/akilli-giris/detay/uyap-xml-buton'
import { AsamaPanel } from '@/components/akilli-giris/detay/asama-panel'
import { SurecSerit } from '@/components/akilli-giris/detay/surec-serit'
import { DosyaSor } from '@/components/akilli-giris/detay/dosya-sor'

const fmtTRY = (n: number | null | undefined) =>
  n != null && Number.isFinite(Number(n)) ? new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n)) + ' ₺' : null
const fmtDate = (d: Date | null | undefined) => (d ? d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—')
const fmtDateTime = (d: Date) => `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`
const initials = (ad: string) => ad.split(/\s+/).filter(Boolean).map((s) => s[0]).slice(0, 2).join('').toUpperCase()
// input'a yazılacak Türkçe ondalık (virgül, binlik grubu yok) — istemci numTR ile birebir round-trip eder
const toTRInput = (n: number) => (Number.isFinite(n) ? n.toLocaleString('tr-TR', { useGrouping: false, maximumFractionDigits: 2 }) : '')

const YOL_LABEL: Record<string, string> = { KLASIK: 'Klasik İcra', IDARI: 'İdari Yol', BELIRSIZ: 'Belirsiz' }

function Eyebrow({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return <div className={`font-mono text-[9.5px] uppercase tracking-[0.14em] ${accent ?? 'text-muted-foreground'}`}>{children}</div>
}

function Section({ kicker, title, sub, right, accent, children }: { kicker: string; title: string; sub?: string; right?: React.ReactNode; accent?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex items-start gap-[14px] border-b border-border-subtle px-5 py-4">
        <div className="min-w-0 flex-1">
          <Eyebrow accent={accent}>{kicker}</Eyebrow>
          <h2 className="font-display mt-1 text-[17px] font-extrabold tracking-[-0.025em] text-foreground">{title}</h2>
          {sub && <p className="mt-[5px] max-w-[64ch] text-[12.5px] leading-[1.45] text-muted-foreground">{sub}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      <div className="px-5 py-[18px]">{children}</div>
    </section>
  )
}

function Kv({ label, value, mono, strong }: { label: string; value: React.ReactNode; mono?: boolean; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      <div className={`mt-[3px] truncate text-[13px] ${strong ? 'font-bold' : 'font-semibold'} text-foreground ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</div>
    </div>
  )
}

export default async function DosyaDetayPage({ params, searchParams }: { params: { id: string }; searchParams: { asama?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const dbUser = await prisma.kullanici.findUnique({ where: { id: user.id }, include: { musteriler: true } })
  if (!dbUser) redirect('/login')
  const izinli = dbUser.musteriler.map((m) => m.musteriId)

  const dosya = await prisma.rucuDosyasi.findFirst({
    where: { musteriId: { in: izinli }, OR: [{ id: params.id }, { hasarDosyaNo: params.id }, { hukukDosyaNo: params.id }, { id: { startsWith: params.id } }] },
    include: {
      musteri: true,
      belgeler: true,
      borclular: true,
      odemeler: true,
      aktiviteler: { include: { kullanici: true } },
      notlar: { include: { kullanici: true } },
      olaylar: true,
      asamalar: { orderBy: { sira: 'asc' } },
      etkinlikler: { orderBy: { baslar: 'asc' } },
    },
  })
  if (!dosya) notFound()
  const ayarlar = await prisma.ayarlar.findUnique({ where: { musteriId: dosya.musteriId } })

  const cj = (dosya.cikarimJson ?? {}) as { aciklama?: string | null; teyit?: { not: string; tip: 'oneri' | 'uyari' | 'ok' }[]; onay?: { ok?: boolean; kim?: string; tarih?: string } }
  const teyitler = Array.isArray(cj.teyit) ? cj.teyit : []
  const onay = cj.onay && cj.onay.ok === true ? cj.onay : null
  const onayli = !!onay
  const anapara = dosya.asilAlacak != null ? Number(dosya.asilAlacak) : dosya.rucuTutari != null ? Number(dosya.rucuTutari) : null

  const footer = footerOlustur(ayarlar)
  const aciklamaMetni = aciklamaTam(cj.aciklama, footer)

  // ── FAİZ (efektif): anapara = rücu/kusur payı; başlangıç = override ?? son dekont; bitiş = override ?? bugün ──
  const bugun = new Date().toISOString().slice(0, 10)
  const faizOranlar = oranlariOku(ayarlar?.faizJson)
  const faizAnapara = dosya.rucuTutari != null ? Number(dosya.rucuTutari) : (anapara ?? 0)
  const dekontGirdi: DekontGirdi[] = dosya.odemeler.map((o) => ({ tarih: o.tarih ? o.tarih.toISOString().slice(0, 10) : null, tutar: o.tutar != null ? Number(o.tutar) : 0, haricMi: o.haricMi }))
  const odenenEksHaric = odenenToplam(dekontGirdi)
  const otoBas = sonDekontTarihi(dekontGirdi)
  const faizBasEff = dosya.faizBaslangic ? dosya.faizBaslangic.toISOString().slice(0, 10) : otoBas
  const faizBitEff = dosya.faizBitis ? dosya.faizBitis.toISOString().slice(0, 10) : bugun
  const faizHesap = faizAnapara > 0 && faizBasEff ? faizHesapla(faizAnapara, new Date(faizBasEff), new Date(faizBitEff), faizOranlar) : null
  const faizEff = dosya.faizTutari != null ? Number(dosya.faizTutari) : (faizHesap?.faiz ?? null)
  const faizToplam = faizEff != null ? faizAnapara + faizEff : null

  const faizInit = {
    davaTutari: dosya.rucuTutari != null ? toTRInput(Number(dosya.rucuTutari)) : '',
    asilAlacak: dosya.asilAlacak != null ? toTRInput(Number(dosya.asilAlacak)) : '',
    faizBaslangic: dosya.faizBaslangic ? dosya.faizBaslangic.toISOString().slice(0, 10) : '',
    faizBitis: dosya.faizBitis ? dosya.faizBitis.toISOString().slice(0, 10) : '',
    faizTutari: dosya.faizTutari != null ? toTRInput(Number(dosya.faizTutari)) : '',
    dekontlar: [...dosya.odemeler]
      .sort((a, b) => (a.tarih?.getTime() ?? 0) - (b.tarih?.getTime() ?? 0))
      .map((o) => ({ tarih: o.tarih ? o.tarih.toISOString().slice(0, 10) : '', tutar: o.tutar != null ? toTRInput(Number(o.tutar)) : '', haricMi: o.haricMi, aciklama: o.aciklama ?? '' })),
  }

  // takip süreci: bakiye + olaylar
  const toplamTalep = faizToplam ?? faizAnapara
  // ── 5-AŞAMA SEKMELERİ (İcra Öncesi · İcra · Arabuluculuk · Dava · İnfaz) ──
  const SEKME_TUR = { icra: 'ICRA_TAKIBI', arabuluculuk: 'ARABULUCULUK', dava: 'DAVA', infaz: 'INFAZ' } as const
  type SekmeKey = 'oncesi' | keyof typeof SEKME_TUR
  const aktifSekme = (['icra', 'arabuluculuk', 'dava', 'infaz'].includes(searchParams.asama ?? '') ? searchParams.asama : 'oncesi') as SekmeKey
  const asamalar = dosya.asamalar
  const TUR_SEKME: Record<string, SekmeKey> = { ICRA_TAKIBI: 'icra', ARABULUCULUK: 'arabuluculuk', DAVA: 'dava', INFAZ: 'infaz' }
  const guncelAsamaRec = [...asamalar].reverse().find((a) => a.durum === 'DEVAM') ?? asamalar[asamalar.length - 1] ?? null
  const guncelSekme: SekmeKey = guncelAsamaRec ? TUR_SEKME[guncelAsamaRec.tur] : dosya.icraDosyaNo ? 'icra' : 'oncesi'
  const serit = asamalar.map((a) => ({ tur: a.tur as string, durum: a.durum as string, sonuc: a.sonuc, kimlikNo: a.kimlikNo }))
  const aktifAsama = aktifSekme === 'oncesi' ? null : asamalar.find((a) => a.tur === SEKME_TUR[aktifSekme as keyof typeof SEKME_TUR]) ?? null
  const aktifEtkinlikler = aktifAsama ? dosya.etkinlikler.filter((e) => e.asamaId === aktifAsama.id) : []

  const tahsilEdilen = dosya.olaylar.filter((o) => o.tip === 'TAHSILAT').reduce((s, o) => s + (o.tutar != null ? Number(o.tutar) : 0), 0)
  const bakiye = { toplam: toplamTalep, tahsil: tahsilEdilen, kalan: Math.max(0, toplamTalep - tahsilEdilen) }
  const olaylarUi = dosya.olaylar.map((o) => ({ id: o.id, tip: o.tip, tarih: o.tarih ? o.tarih.toISOString() : null, tutar: o.tutar != null ? Number(o.tutar) : null, aciklama: o.aciklama }))

  const evrakVar = dosya.belgeler.length > 0
  const cikarimVar = !!dosya.yol || dosya.borclular.length > 0 || !!cj.aciklama
  const takipAcik = dosya.durum === 'TAKIP_ACILDI' || !!dosya.icraDosyaNo

  const teyitliBorclu = dosya.borclular.some((b) => b.teyitDurumu === 'TEYIT_EDILDI')
  const teyitGerek = dosya.borclular.some((b) => b.teyitDurumu === 'TEYIT_GEREK')
  const katSet = new Set(dosya.belgeler.map((b) => b.kategori))
  const evrakOk = ['POLICE', 'DEKONT', 'TUTANAK'].every((k) => katSet.has(k as never))
  const teyitOk = cikarimVar && dosya.borclular.length > 0 && !teyitGerek

  const checks = [
    { label: 'Borçlu · TC/VKN · adres', ok: teyitliBorclu, okText: `${dosya.borclular.length} borçlu çıkarıldı, en az biri teyitli`, hint: 'Çıkarım yapın; en az bir borçlu TC ve adresiyle teyitli olmalı' },
    { label: 'Asıl alacak (anapara)', ok: anapara != null, okText: fmtTRY(anapara) ?? '', hint: 'Ödenen tazminat (asıl alacak) girilmeli' },
    { label: 'Faiz başlangıcı', ok: !!faizBasEff, okText: faizBasEff ? `Son dekont · ${fmtDate(new Date(faizBasEff))}` : '', hint: 'Ödeme dekontu tarihi (faiz başlangıcı) gerekli' },
    { label: 'Örnek / mahiyet', ok: !!dosya.brans, okText: dosya.rucuSebebi ?? dosya.brans ?? '', hint: 'Takip mahiyeti (branş/örnek) belirlenmeli' },
    { label: 'İl–ilçe · yetkili icra (kaza yeri)', ok: !!dosya.yetkiliIcra, okText: dosya.yetkiliIcra ?? '', hint: 'Kaza yerine göre yetkili icra dairesi gerekli' },
    { label: 'Gerekli evrak', ok: evrakOk, okText: 'Poliçe, ödeme dekontu ve kaza tutanağı dosyada', hint: 'Poliçe, dekont ve kaza tutanağı eksik olmamalı' },
    { label: 'Teyit tamam (düşük güven kalmadı)', ok: teyitOk, okText: 'Tüm düşük güvenli alanlar onaylandı', hint: teyitGerek ? 'Bir borçlu “teyit gerekiyor” — onaylayın' : 'Çıkarımı yapıp düşük güvenli alanları teyit edin' },
    { label: 'Avukat onayı (alanlar gözden geçirildi)', ok: onayli, okText: `${onay?.kim ?? '—'} onayladı`, hint: 'Alanları düzeltip “Avukat onayı ver”e basın' },
  ]
  const done = checks.filter((c) => c.ok).length
  const hazir = done === checks.length
  const pct = Math.round((done / checks.length) * 100)

  const durumEt: { tone: Tone; label: string } = takipAcik
    ? { tone: 'kr', label: 'Takip açıldı' }
    : hazir ? { tone: 'success', label: 'Takibe hazır' }
      : evrakVar ? { tone: 'info', label: 'Hazırlanıyor' } : { tone: 'warning', label: 'Evrak bekleniyor' }

  const pipeline = ['Havuzda', 'İnceleniyor', 'Takibe Hazır', 'Takip Açıldı']
  const pipelineStep = takipAcik ? 3 : hazir ? 2 : evrakVar ? 1 : 0

  const g = dosya.zamanasimi ? Math.round((new Date(dosya.zamanasimi).getTime() - Date.now()) / 86400000) : null
  const zaRisk = g != null && g >= 0 && g < 30
  const zaWarn = g != null && g >= 30 && g < 90

  // çıkarım alanları (gerçek alanlardan)
  const alanlar: [string, string][] = ([
    ['Branş', dosya.brans], ['Sigortalı plaka', dosya.sigortaliPlaka], ['Kaza yeri (yetki)', dosya.kazaYeri || dosya.il],
    ['Kusur durumu', dosya.kusurDurumu], ['Asıl alacak', fmtTRY(anapara)], ['Yetkili icra', dosya.yetkiliIcra],
    ['Faiz başlangıcı', faizBasEff ? fmtDate(new Date(faizBasEff)) : null],
  ] as [string, string | null][]).filter((x): x is [string, string] => !!x[1])

  // zaman çizelgesi (Aktivite + Not + TakipOlayi)
  type TL = { id: string; tip: 'not' | 'aktivite' | 'takip' | 'teyit'; t: Date; kim: string; metin: string }
  const tl: TL[] = [
    ...dosya.aktiviteler.map((a) => ({ id: a.id, tip: /teyit/i.test(a.eylem) ? ('teyit' as const) : ('aktivite' as const), t: a.createdAt, kim: a.kullanici?.ad ?? 'Sistem', metin: a.eylem })),
    ...dosya.notlar.map((n) => ({ id: n.id, tip: 'not' as const, t: n.createdAt, kim: n.kullanici?.ad ?? '—', metin: n.metin })),
    ...dosya.olaylar.map((o) => ({ id: o.id, tip: 'takip' as const, t: o.createdAt, kim: 'UYAP', metin: o.aciklama ?? o.tip })),
  ].sort((a, b) => b.t.getTime() - a.t.getTime())

  const belgelerUi = dosya.belgeler.map((b) => ({ id: b.id, kategori: b.kategori as string, dosyaAdi: b.dosyaAdi, confidence: b.confidence, foto: b.kategori === 'HASAR_FOTO', acilabilir: !!b.storagePath }))

  const fmtInput = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '')
  const alanlarV = {
    yol: dosya.yol ?? '', brans: dosya.brans ?? '', hukukDosyaNo: dosya.hukukDosyaNo ?? '', hasarDosyaNo: dosya.hasarDosyaNo ?? '',
    sigortaliUnvan: dosya.sigortaliUnvan ?? '', sigortaliTelefon: dosya.sigortaliTelefon ?? '', sigortaliPlaka: dosya.sigortaliPlaka ?? '', karsiPlaka: dosya.karsiPlaka ?? '',
    rucuSebebi: dosya.rucuSebebi ?? '', rucuOrani: dosya.rucuOrani ?? '',
    asilAlacak: dosya.asilAlacak != null ? String(Number(dosya.asilAlacak)) : '', rucuTutari: dosya.rucuTutari != null ? String(Number(dosya.rucuTutari)) : '',
    kazaYeri: dosya.kazaYeri ?? '', il: dosya.il ?? '', yetkiliIcra: dosya.yetkiliIcra ?? '',
    kazaTarihi: fmtInput(dosya.kazaTarihi), hasarTarihi: fmtInput(dosya.hasarTarihi), zamanasimi: fmtInput(dosya.zamanasimi),
    kusurDurumu: dosya.kusurDurumu ?? '', olusSekli: dosya.olusSekli ?? '', muhatapOzet: dosya.muhatapOzet ?? '',
  }
  const borclularUi = dosya.borclular.map((b) => ({ id: b.id, adUnvan: b.adUnvan, tcVkn: b.tcVkn ?? '', telefon: b.telefon ?? '', adres: b.adres ?? '', rol: b.rol as string, kaynak: b.kaynak ?? '', teyit: b.teyitDurumu as string }))

  const TIP_META: Record<TL['tip'], { icon: typeof Clock; cls: string }> = {
    not: { icon: StickyNote, cls: 'bg-kr-soft text-kr-ink' },
    aktivite: { icon: Clock, cls: 'bg-surface-muted text-muted-foreground' },
    teyit: { icon: Check, cls: 'bg-success-soft text-success' },
    takip: { icon: Send, cls: 'bg-kr-soft text-kr' },
  }

  return (
    <div className="mx-auto max-w-[1320px] px-7 pb-16 pt-5">
      {/* breadcrumb */}
      <div className="mb-4 flex items-center gap-[7px] text-[12.5px]">
        <Link href="/atanan-dosyalar" className="inline-flex items-center gap-1 font-semibold text-muted-foreground transition hover:text-foreground"><ChevronLeft className="h-[15px] w-[15px]" /> Atanan Dosyalar</Link>
        <span className="text-border">/</span>
        <span className="font-mono font-semibold text-foreground">{dosya.hukukDosyaNo ?? dosya.hasarDosyaNo ?? dosya.id.slice(0, 8)}</span>
      </div>

      {/* künye başlık */}
      <div className="rounded-2xl border border-border bg-surface p-[20px_22px] shadow-card">
        <div className="flex flex-wrap items-start gap-5">
          <div className="min-w-[280px] flex-1">
            <div className="flex flex-wrap items-center gap-[10px]">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Hukuk Dosya No</span>
              <Badge tone={durumEt.tone} dot>{durumEt.label}</Badge>
              {dosya.brans && <Badge tone="info">{dosya.brans}</Badge>}
            </div>
            <h1 className="font-mono mt-[6px] text-[30px] font-semibold tracking-[0.01em] text-foreground">{dosya.hukukDosyaNo ?? dosya.hasarDosyaNo ?? `Dosya ${dosya.id.slice(0, 8)}`}</h1>
            {dosya.rucuSebebi && <p className="mt-2 text-[13.5px] font-medium text-foreground">{dosya.rucuSebebi}</p>}
            <div className="mt-3 flex flex-wrap gap-[18px]">
              {dosya.hasarDosyaNo && <Kv label="Hasar No" value={dosya.hasarDosyaNo} mono />}
              {dosya.rucuOrani && <Kv label="Rücu Oranı" value={dosya.rucuOrani} mono />}
              {fmtTRY(anapara) && <Kv label="Asıl Alacak" value={fmtTRY(anapara)} mono strong />}
              {dosya.kadroluAvukat && <Kv label="Atanan" value={dosya.kadroluAvukat} />}
              {dosya.islemYapanYrd && <Kv label="İşlem Yapan" value={dosya.islemYapanYrd} />}
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            {g != null && (
              <div className={`inline-flex items-center gap-[9px] rounded-xl border p-[8px_13px] ${zaRisk ? 'border-danger/30 bg-danger-soft text-danger' : zaWarn ? 'border-warning/30 bg-warning-soft text-[hsl(var(--warning-fg))]' : 'border-border bg-surface-muted text-muted-foreground'}`}>
                {zaRisk ? <AlertTriangle className="h-[17px] w-[17px]" /> : <Clock className="h-[17px] w-[17px]" />}
                <div>
                  <div className="font-mono text-[8.5px] uppercase tracking-[0.12em] opacity-80">Zamanaşımı</div>
                  <div className="font-mono text-[16px] font-bold leading-[1.1]">{g < 0 ? `${-g} gün geçti` : `${g} gün kaldı`}</div>
                </div>
              </div>
            )}
            {!evrakVar ? (
              <BelgeEkle dosyaId={dosya.id} compact />
            ) : !cikarimVar ? (
              <AiCikarButton dosyaId={dosya.id} label="AI ile Çıkarım Yap" />
            ) : (
              <span className="inline-flex items-center gap-2 rounded-[10px] border border-kr/[0.18] bg-kr-soft px-4 py-2.5 text-[13px] font-semibold text-kr-ink"><Check className="h-4 w-4" /> Çıkarım tamamlandı</span>
            )}
          </div>
        </div>
      </div>

      <SurecSerit asamalar={serit} aktif={aktifSekme} guncelSekme={guncelSekme} icraNo={dosya.icraDosyaNo} />
      <DosyaSor dosyaId={dosya.id} />
      {aktifSekme !== 'oncesi' ? (
        <AsamaPanel
          sekme={aktifSekme}
          dosyaId={dosya.id}
          asama={aktifAsama}
          etkinlikler={aktifEtkinlikler}
          prefill={aktifSekme === 'icra' ? { no: dosya.icraDosyaNo, birim: dosya.icraDairesi ?? dosya.yetkiliIcra } : undefined}
        />
      ) : (
        <>
      {/* durum pipeline */}
      <div className="mt-[14px] flex items-center overflow-x-auto rounded-[14px] border border-border bg-surface p-[12px_18px]">
        {pipeline.map((label, i) => {
          const isDone = i < pipelineStep, now = i === pipelineStep
          return (
            <span key={label} className="flex items-center">
              {i > 0 && <span className={`h-[2px] w-7 ${i <= pipelineStep ? 'bg-success' : 'bg-border'}`} />}
              <span className={`flex items-center gap-2 rounded-full px-[11px] py-[5px] ${now ? 'bg-kr-soft' : ''}`}>
                <span className={`font-mono grid h-[22px] w-[22px] place-items-center rounded-full border text-[11px] font-semibold ${isDone ? 'border-success bg-success text-white' : now ? 'border-kr bg-kr text-white' : 'border-border bg-surface-muted text-muted-foreground'}`}>{isDone ? <Check className="h-3 w-3" /> : i + 1}</span>
                <span className={`text-[12.5px] font-semibold ${isDone ? 'text-foreground' : now ? 'text-kr-ink' : 'text-muted-foreground'}`}>{label}</span>
              </span>
            </span>
          )
        })}
      </div>

      {/* gövde: 2 kolon */}
      <div className="dd-grid mt-5">
        {/* SOL KOLON */}
        <div className="flex flex-col gap-[18px]">
          {/* 1 · EVRAK */}
          <Section kicker="1 · EVRAK" title="Dosya Evrakı" sub="İcra için gerekli belgeler. Yüz belgeye varan dosyalarda yapay zeka her belgenin ne olduğunu anlayıp kategorilere ayırır; emin olmadıklarını “gözden geçir” işaretler." right={evrakVar ? <span className="font-mono text-[11px] text-muted-foreground">{dosya.belgeler.length} belge</span> : undefined}>
            <div className="mb-[14px]"><BelgeEkle dosyaId={dosya.id} /></div>
            {evrakVar ? <EvrakGruplari belgeler={belgelerUi} /> : <div className="py-2 text-center text-[12.5px] text-muted-foreground">Henüz belge yok · icra için gerekli evrakları (poliçe, dekont, tutanak…) yukarıdan ekleyin.</div>}
          </Section>

          {/* 2 · AI ÇIKARIM */}
          <Section kicker="2 · AI ÇIKARIM" title="Yapay Zeka Çıkarımı" accent="text-kr" sub="Yüklü evraktan borçlular, durum önerisi, özet ve riskler çıkarılır. Çıkarım motoru: bizim AI asistanı (Katman 3)." right={cikarimVar ? <AiCikarButton dosyaId={dosya.id} variant="ghost" icon="reset" size="sm" label="Yeniden çalıştır" /> : undefined}>
            <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface-muted/40 px-3.5 py-2.5">
              <span className="text-[12px] text-muted-foreground">AI'ın çıkardığı alanlar <b className="text-foreground">elle düzeltilebilir</b> — takip öncesi her şeyi kontrol edin.</span>
              <CikarimDuzenle dosyaId={dosya.id} v={alanlarV} />
            </div>
            {!cikarimVar ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <span className={`grid h-[50px] w-[50px] place-items-center rounded-[14px] ${evrakVar ? 'bg-kr-soft text-kr-ink' : 'bg-surface-muted text-muted-foreground'}`}><Sparkles className="h-6 w-6" /></span>
                <h3 className="font-display text-[16px] font-bold">{evrakVar ? 'Çıkarım henüz çalıştırılmadı' : 'Önce evrak yükleyin'}</h3>
                <p className="max-w-[48ch] text-[12.5px] text-muted-foreground">{evrakVar ? '“Çıkarım Yap” ile borçlular, kusur durumu ve faiz alanları yüklü evraktan otomatik çıkarılsın.' : 'AI çıkarımı için en az bir belge gerekli. Yukarıdaki Evrak bölümünden belge ekleyin.'}</p>
                {evrakVar ? <AiCikarButton dosyaId={dosya.id} label="Çıkarım Yap" /> : <button type="button" disabled className="inline-flex cursor-not-allowed items-center gap-2 rounded-[10px] bg-kr px-4 py-2.5 text-[13px] font-semibold text-kr-foreground opacity-60"><Sparkles className="h-4 w-4" /> Çıkarım Yap</button>}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-[9px]">
                  {dosya.yol && <Badge tone="kr">{YOL_LABEL[dosya.yol] ?? dosya.yol}</Badge>}
                  {dosya.yolGuven != null && <Badge tone="success" dot>Güven %{Math.round(dosya.yolGuven * 100)}</Badge>}
                </div>
                {(dosya.yolNeden || cj.aciklama) && (
                  <div className="rounded-xl border border-border-subtle bg-surface-muted p-[13px_15px]">
                    <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Özet</div>
                    <p className="mt-1 text-[13px] leading-[1.55] text-foreground">{dosya.yolNeden || cj.aciklama}</p>
                  </div>
                )}
                {alanlar.length > 0 && (
                  <div>
                    <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Çıkarılan Alanlar</div>
                    <div className="overflow-hidden rounded-xl border border-border">
                      {alanlar.map(([k, v], i) => (
                        <div key={k} className={`flex items-center gap-3 p-[10px_13px] ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
                          <span className="w-[168px] shrink-0 text-[12px] text-muted-foreground">{k}</span>
                          <span className="flex-1 text-[13px] font-semibold text-foreground">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {teyitler.length > 0 && (
                  <div>
                    <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Riskler ve Öneriler</div>
                    <div className="flex flex-col gap-2">
                      {teyitler.map((t, i) => {
                        const m = t.tip === 'uyari' ? { I: AlertTriangle, cls: 'border-warning/40 bg-warning-soft text-[hsl(var(--warning-fg))]' } : t.tip === 'ok' ? { I: Check, cls: 'border-success/30 bg-success-soft text-success' } : { I: Scale, cls: 'border-kr/30 bg-kr-soft text-kr-ink' }
                        return <div key={i} className={`flex items-start gap-[11px] rounded-[11px] border p-[10px_13px] ${m.cls}`}><m.I className="mt-px h-4 w-4 shrink-0" /><span className="text-[12.5px] leading-[1.45]">{t.not}</span></div>
                      })}
                    </div>
                  </div>
                )}
                <div className="rounded-xl border border-border-subtle bg-surface-muted/50 p-[13px_15px]">
                  <div className="flex items-center gap-2"><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">UYAP Takip Açıklaması</div><span className="ml-auto"><Kopyala metin={aciklamaMetni} /></span></div>
                  <AciklamaDuzenle
                    dosyaId={dosya.id}
                    init={cj.aciklama ?? ''}
                    alan={{
                      kazaTarihi: (dosya.kazaTarihi ?? dosya.hasarTarihi)?.toISOString() ?? '',
                      sigortaliPlaka: dosya.sigortaliPlaka ?? '',
                      karsiPlaka: dosya.karsiPlaka ?? '',
                      alacakliUnvan: ayarlar?.alacakliUnvan ?? '',
                    }}
                  />
                  {footer
                    ? <pre className="mt-2 whitespace-pre-wrap border-t border-border-subtle pt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">{footer}</pre>
                    : <div className="mt-1.5 text-[11px] text-muted-foreground">Footer (alacaklı/MERSİS/IBAN) için <b>Şirket Bilgileri</b>'ni doldurun.</div>}
                </div>
              </div>
            )}
          </Section>

          {/* 3 · BORÇLULAR — ekle/düzelt/sil */}
          <Section kicker="3 · BORÇLULAR" title="Borçlular" sub="İcra takibinin açılacağı kişiler. AI çıkardı; elle düzeltilebilir/eklenebilir. Sürücü ve araç sahibi farklıysa müteselsil sorumluluk için ikisi de eklenir.">
            <BorclularDuzenle dosyaId={dosya.id} borclular={borclularUi} />
          </Section>

          {/* 4 · FAİZ & DAVA TUTARI */}
          <Section kicker="4 · FAİZ & DAVA TUTARI" title="Faiz Hesabı" accent="text-kr" sub="Dava tutarı (rücu/kusur payı) ve işlemiş faiz. Dekontlar yüklü evraktan çıkarılır; ekspertiz ücreti anaparaya katılmaz. Birden fazla parçalı ödemede faiz son dekont tarihinden işler. Tutar ve tarihler elle düzenlenebilir.">
            <FaizPanel dosyaId={dosya.id} init={faizInit} oranlar={faizOranlar} bugun={bugun} />
          </Section>

          {/* 5 · ZAMAN ÇİZELGESİ */}
          <Section kicker="5 · ZAMAN ÇİZELGESİ" title="Geçmiş ve Notlar" sub="Dosyanın tüm olayları: tevdiye, çekim, çıkarım, teyit ve eklenen notlar — kronolojik.">
            <NotForm dosyaId={dosya.id} init={initials(dbUser.ad)} />
            {tl.length === 0 ? (
              <div className="text-[13px] text-muted-foreground">Henüz işlem yok.</div>
            ) : (
              <ol className="relative">
                <span className="absolute bottom-2 left-[15px] top-2 w-[1.5px] bg-border-subtle" />
                {tl.map((o) => {
                  const M = TIP_META[o.tip]
                  return (
                    <li key={o.id} className="relative flex gap-3 pb-4 last:pb-0">
                      <span className={`z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-surface ${M.cls}`}><M.icon className="h-4 w-4" /></span>
                      <div className="min-w-0 pt-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-[12.5px] font-bold text-foreground">{o.kim}</span>
                          {o.tip === 'not' && <span className="font-mono rounded-full bg-kr-soft px-1.5 py-[1px] text-[9px] uppercase text-kr-ink">Not</span>}
                          <span className="font-mono text-[10.5px] text-muted-foreground">{fmtDateTime(o.t)}</span>
                        </div>
                        <p className={`mt-0.5 text-[12.8px] leading-[1.5] ${o.tip === 'not' ? 'text-foreground' : 'text-muted-foreground'}`}>{o.metin}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </Section>

          {takipAcik && <TakipSureci dosyaId={dosya.id} durum={dosya.durum} olaylar={olaylarUi} bakiye={bakiye} />}
        </div>

        {/* SAĞ RAIL */}
        <aside className="dd-rail flex flex-col gap-[18px]">
          {/* Hazırlık paneli — kuzey yıldızı */}
          <div className="overflow-hidden rounded-[18px] border border-border bg-surface shadow-float">
            <div className={`p-[16px_18px] ${takipAcik ? 'bg-kr-soft' : hazir ? 'bg-success-soft' : 'bg-surface-muted'}`}>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${takipAcik ? 'bg-kr' : hazir ? 'bg-success' : 'bg-warning'}`} />
                <span className={`font-mono text-[9.5px] uppercase tracking-[0.14em] ${takipAcik ? 'text-kr-ink' : hazir ? 'text-success' : 'text-foreground'}`}>{takipAcik ? 'Takip Açıldı' : hazir ? 'Takibe Hazır' : 'Hazırlık Sürüyor'}</span>
              </div>
              <h2 className={`font-display mt-1.5 font-extrabold tracking-[-0.03em] ${takipAcik || hazir ? 'text-[22px]' : 'text-[19px]'} text-foreground`}>{takipAcik ? 'UYAP’ta takip açıldı ve eşleştirildi' : hazir ? 'UYAP’tan icra açmaya hazır' : `${checks.length - done} madde tamamlanmadı`}</h2>
              <p className="mt-1.5 text-[12.5px] leading-[1.45] text-muted-foreground">{takipAcik ? 'İcra dosya no eşleştirildi; eklenti dosyayı izlemeye alır.' : hazir ? 'Tüm zorunlu alanlar dolu ve teyitli. Takip-aç bloğunu UYAP’a gönderebilirsiniz.' : 'Aşağıdaki eksikler tamamlanınca dosya otomatik “Takibe Hazır” olur.'}</p>
              {!takipAcik && (
                <div className="mt-3">
                  <div className="flex items-center justify-between font-mono text-[10.5px] text-muted-foreground"><span>{done} / {checks.length} madde tamam</span><span>%{pct}</span></div>
                  <div className="mt-1 h-[6px] overflow-hidden rounded-full bg-foreground/10"><div className={`h-full rounded-full transition-[width] duration-500 ${hazir ? 'bg-success' : 'bg-warning'}`} style={{ width: `${pct}%` }} /></div>
                </div>
              )}
            </div>

            <ul className="p-[8px_8px_4px]">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-[11px] rounded-[11px] p-[10px_12px]">
                  <span className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border ${c.ok ? 'border-success/30 bg-success-soft text-success' : 'border-border bg-surface-muted text-muted-foreground'}`}>{c.ok ? <Check className="h-3.5 w-3.5" /> : <span className="text-[12px]">·</span>}</span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-foreground">{c.label}</div>
                    <div className={`text-[11.5px] ${c.ok ? 'text-success' : 'text-[hsl(var(--warning-fg))]'}`}>{c.ok ? c.okText : c.hint}</div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-3 border-t border-border-subtle p-[12px_16px_16px]">
              {takipAcik ? (
                <div className="flex items-center gap-[9px] rounded-[11px] bg-kr-soft p-[11px_14px] text-[12.5px] text-kr-ink"><Check className="h-4 w-4 shrink-0" /><span><b>UYAP’a gönderildi</b> · {dosya.icraDosyaNo ?? 'eşleştirme bekleniyor'}</span></div>
              ) : (
                <>
                  <OnayButonu dosyaId={dosya.id} onayli={onayli} onayKim={onay?.kim} onayTarih={onay?.tarih} />
                  <UyapXmlButon dosyaId={dosya.id} />
                  {hazir ? (
                    <form action={takipAcildi} className="flex flex-col gap-2.5">
                      <input type="hidden" name="dosyaId" value={dosya.id} />
                      <input name="daire" defaultValue={dosya.yetkiliIcra ?? dosya.kazaYeri ?? ''} placeholder="İcra Dairesi" className="rounded-[10px] border border-border bg-surface-muted px-3 py-2.5 text-[13px] outline-none transition focus:border-kr focus:bg-surface focus:ring-4 focus:ring-kr/15" />
                      <input name="no" placeholder="İcra Dosya No (2026/…)" className="font-mono rounded-[10px] border border-border bg-surface-muted px-3 py-2.5 text-[13px] outline-none transition focus:border-kr focus:bg-surface focus:ring-4 focus:ring-kr/15" />
                      <input name="tarih" type="date" className="rounded-[10px] border border-border bg-surface-muted px-3 py-2.5 text-[13px] text-foreground outline-none transition focus:border-kr focus:bg-surface focus:ring-4 focus:ring-kr/15" />
                      <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-[11px] bg-success px-5 py-3 text-[14.5px] font-semibold text-white shadow-[0_2px_8px_hsl(160_60%_18%/0.35)] transition hover:bg-success/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/50"><Send className="h-4 w-4" /> Takip Aç · UYAP’a Gönder</button>
                    </form>
                  ) : (
                    <>
                      <button type="button" disabled className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-[11px] bg-kr px-5 py-3 text-[14.5px] font-semibold text-kr-foreground opacity-60"><Send className="h-4 w-4" /> Takip Aç · UYAP’a Gönder</button>
                      <p className="text-center font-mono text-[11px] text-muted-foreground">{!onayli ? 'önce avukat onayı verin' : 'eksik maddeler tamamlanınca aktifleşir'}</p>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Künye facts */}
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="border-b border-border-subtle p-[14px_18px]">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">Dosya Künyesi</div>
              <h3 className="font-display text-[15px] font-extrabold">Dosya Bilgileri</h3>
            </div>
            <dl>
              {([
                ['Hasar tarihi', fmtDate(dosya.hasarTarihi), true],
                ['Zamanaşımı', fmtDate(dosya.zamanasimi), true],
                ['Sigortalı tel', dosya.sigortaliTelefon, true],
                ['Sigortalı plaka', dosya.sigortaliPlaka, true],
                ['Kaza yeri', dosya.kazaYeri || dosya.il, false],
                ['Yetkili icra', dosya.yetkiliIcra, false],
                ['Asıl alacak', fmtTRY(anapara), true],
                ['Dava miktarı', fmtTRY(dosya.davaMiktari != null ? Number(dosya.davaMiktari) : null), true],
                ['Sözleşmeli av.', dosya.sozlesmeliAvukat, false],
                ['Gönderen birim', dosya.gonderenBirim, false],
                ['Tevdiye', dosya.atanmaTarihi ? fmtDate(dosya.atanmaTarihi) : null, true],
              ] as [string, string | null, boolean][]).filter(([, v]) => v).map(([k, v, mono], i) => (
                <div key={k} className={`flex items-center gap-3 p-[9px_18px] ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
                  <dt className="w-[124px] shrink-0 text-[11.5px] text-muted-foreground">{k}</dt>
                  <dd className={`flex-1 text-right text-[12.5px] font-semibold text-foreground ${mono ? 'font-mono tabular-nums' : ''}`}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Faiz & Toplam */}
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="border-b border-border-subtle p-[14px_18px]"><div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">Faiz & Toplam</div><h3 className="font-display text-[15px] font-extrabold">İşlemiş Faiz</h3></div>
            <div className="p-[14px_18px]">
              {!faizBasEff ? (
                <p className="text-[12px] text-muted-foreground">Faiz başlangıcı yok — aşağıdaki <b className="text-foreground">Faiz Hesabı</b> bölümünden dekont ekleyin ya da başlangıcı elle seçin.</p>
              ) : faizAnapara <= 0 ? (
                <p className="text-[12px] text-muted-foreground">Dava tutarı (rücu/kusur payı) gerekli — <b className="text-foreground">Faiz Hesabı</b> bölümünden girin.</p>
              ) : faizOranlar.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">Faiz oranı tanımlı değil — <Link href="/ayarlar" className="font-semibold text-kr-ink hover:underline">Şirket Bilgileri → Faiz Oranları</Link>'ndan ekleyin.</p>
              ) : faizEff != null ? (
                <div className="space-y-2 text-[12.5px]">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Anapara (dava tutarı)</span><span className="font-mono font-semibold">{fmtTRY(faizAnapara)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">İşlemiş faiz{faizHesap ? ` · ${faizHesap.gun} gün` : ''}{dosya.faizTutari != null ? ' · elle' : ''}</span><span className="font-mono font-semibold">{fmtTRY(faizEff)}</span></div>
                  <div className="flex items-center justify-between border-t border-border-subtle pt-2"><span className="font-bold">Toplam</span><span className="font-mono text-[14px] font-extrabold text-kr-ink">{fmtTRY(faizToplam ?? faizAnapara)}</span></div>
                  <div className="font-mono text-[10px] text-muted-foreground">{fmtDate(new Date(faizBasEff))} → {dosya.faizBitis ? fmtDate(new Date(faizBitEff)) : 'bugün'} · {faizOranlar.length} dönem</div>
                  {odenenEksHaric > 0 && odenenEksHaric !== faizAnapara && <div className="font-mono text-[10px] text-muted-foreground">Ödenen (eksp. hariç): {fmtTRY(odenenEksHaric)}</div>}
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">Faiz hesaplanamadı — tarih/oran aralığını kontrol edin.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
        </>
      )}
    </div>
  )
}
