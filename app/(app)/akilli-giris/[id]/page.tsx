import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, FileText, Image as ImageIcon, Building2, Hash, CalendarDays, Link2, Info, Clock, ScanLine, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { takipAcildi } from '../actions'

const DURUM: Record<string, { label: string; cls: string }> = {
  HAVUZDA: { label: 'Havuzda', cls: 'bg-muted text-muted-foreground' },
  INCELENIYOR: { label: 'İnceleniyor', cls: 'bg-warning-soft text-warning' },
  TAKIBE_HAZIR: { label: 'Takibe hazır', cls: 'bg-kr-soft text-kr-ink' },
  TAKIP_ACILDI: { label: 'Takip açıldı', cls: 'bg-info-soft text-info' },
  TEBLIG_EDILDI: { label: 'Tebliğ edildi', cls: 'bg-info-soft text-info' },
  ITIRAZ: { label: 'İtiraz', cls: 'bg-warning-soft text-warning' },
  KESINLESTI: { label: 'Kesinleşti', cls: 'bg-success-soft text-success' },
  TAHSIL: { label: 'Tahsil', cls: 'bg-success-soft text-success' },
  KAPANDI: { label: 'Kapandı', cls: 'bg-muted text-muted-foreground' },
  IDARI_YOL: { label: 'İdari yol', cls: 'bg-kr-soft text-kr-ink' },
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">{children}</div>
}

export default async function DosyaDetayPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const dbUser = await prisma.kullanici.findUnique({ where: { id: user.id }, include: { musteriler: true } })
  if (!dbUser) redirect('/login')
  const izinli = dbUser.musteriler.map((m) => m.musteriId)

  const dosya = await prisma.rucuDosyasi.findFirst({
    where: {
      musteriId: { in: izinli },
      OR: [{ id: params.id }, { hasarDosyaNo: params.id }, { id: { startsWith: params.id } }],
    },
    include: {
      belgeler: true,
      borclular: true,
      odemeler: true,
      musteri: true,
      aktiviteler: { orderBy: { createdAt: 'desc' }, take: 25, include: { kullanici: true } },
    },
  })
  if (!dosya) notFound()

  const cj = (dosya.cikarimJson ?? {}) as { alanlar?: Record<string, string[]> }
  const alanlar = cj.alanlar ?? {}
  const fotoSayi = dosya.belgeler.filter((b) => b.kategori === 'HASAR_FOTO').length
  const belgeSayi = dosya.belgeler.length - fotoSayi
  const acildi = dosya.durum === 'TAKIP_ACILDI' || !!dosya.icraDosyaNo
  const d = DURUM[dosya.durum] ?? { label: dosya.durum, cls: 'bg-muted text-muted-foreground' }

  const ALAN_ETIKET: [string, string][] = [
    ['plaka', 'Plaka'], ['tc', 'T.C. No'], ['tarih', 'Tarih'], ['tutar', 'Tutar'], ['iban', 'IBAN'],
  ]

  return (
    <div className="mx-auto max-w-[1100px] px-7 py-6">
      <Link href="/akilli-giris" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground transition hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Gelen Kutusu
      </Link>

      {/* başlık */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div>
          <Eyebrow>Rücu Dosyası · {dosya.musteri.ad}</Eyebrow>
          <h1 className="font-display mt-1 text-[28px] font-extrabold tracking-[-0.035em] text-foreground">
            {dosya.hasarDosyaNo || dosya.hukukDosyaNo || `Dosya ${dosya.id.slice(0, 8)}`}
          </h1>
        </div>
        <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold ${d.cls}`}>{d.label}</span>
      </div>
      <div className="font-mono mt-1 text-[11px] text-muted-foreground">
        Oluşturuldu: {dosya.createdAt.toLocaleString('tr-TR')} · {dosya.belgeler.length} belge ({belgeSayi} belge · {fotoSayi} foto)
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* SOL: çıkarım + belgeler */}
        <div className="flex flex-col gap-5">
          {/* çıkarılan alanlar */}
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <div className="flex items-center gap-2"><ScanLine className="h-4 w-4 text-kr" /><h2 className="font-display text-[15px] font-bold">Çıkarılan Alanlar</h2><span className="font-mono ml-auto text-[10px] text-muted-foreground">yerel · ₺0</span></div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ALAN_ETIKET.map(([k, lbl]) => {
                const vals = alanlar[k] ?? []
                return (
                  <div key={k} className="rounded-xl border border-border-subtle bg-surface-muted/40 p-3">
                    <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{lbl} · {vals.length}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {vals.length === 0 && <span className="text-[12px] text-muted-foreground">—</span>}
                      {vals.slice(0, 8).map((v) => <span key={v} className="font-mono rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px]">{v}</span>)}
                      {vals.length > 8 && <span className="text-[11px] text-muted-foreground">+{vals.length - 8}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-[10px] border border-border-subtle bg-surface-muted px-3.5 py-2.5 text-[11.5px] text-muted-foreground">
              <Info className="mt-px h-3.5 w-3.5 shrink-0 text-kr" />
              Kusur/oluş şekli (LLM · Katman 3), borçlu çıkarımı ve triyaj (klasik/idari) sıradaki adım.
            </div>
          </section>

          {/* belgeler */}
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-kr" /><h2 className="font-display text-[15px] font-bold">Belgeler</h2><span className="font-mono ml-auto text-[10px] text-muted-foreground">{dosya.belgeler.length}</span></div>
            <div className="mt-3 max-h-80 overflow-y-auto">
              {dosya.belgeler.length === 0 && <div className="py-3 text-[13px] text-muted-foreground">Belge yok.</div>}
              {dosya.belgeler.map((b) => {
                const foto = b.kategori === 'HASAR_FOTO'
                return (
                  <div key={b.id} className="flex items-center gap-3 border-b border-border-subtle py-2.5 text-[13px] last:border-0">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-[8px] ${foto ? 'bg-success-soft text-success' : 'bg-info-soft text-info'}`}>
                      {foto ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{b.dosyaAdi}</span>
                    <span className="font-mono hidden shrink-0 text-[10.5px] text-muted-foreground sm:block">
                      {foto ? `${b.genislik ?? '?'}×${b.yukseklik ?? '?'}${b.kamera ? ' · ' + b.kamera : ''}` : b.kategori}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground">Dosya önizleme (Supabase Storage'tan açma): sıradaki adım.</div>
          </section>
        </div>

        {/* SAĞ: takip / eşleştirme + geçmiş */}
        <div className="flex flex-col gap-5">
          {/* takip açıldı / eşleştirme */}
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-kr" /><h2 className="font-display text-[15px] font-bold">UYAP Takibi</h2></div>
            {acildi ? (
              <div className="mt-4 space-y-2.5">
                <div className="flex items-center gap-2 rounded-xl border border-success/40 bg-success-soft/50 px-3.5 py-3 text-[13px]">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                  <div><b>Takip açıldı.</b> <span className="font-mono">{dosya.icraDosyaNo}</span></div>
                </div>
                <div className="font-mono text-[12px] text-muted-foreground">{dosya.icraDairesi ?? dosya.yetkiliIcra ?? '—'}{dosya.takipTarihi ? ' · ' + dosya.takipTarihi.toLocaleDateString('tr-TR') : ''}</div>
                <div className="rounded-[10px] border border-border-subtle bg-surface-muted px-3.5 py-2.5 text-[11.5px] text-muted-foreground">Tebliğ · tahsilat · bakiye · itiraz → UYAP Senkron (Chrome eklentisi köprüsü) ile otomatik gelecek.</div>
              </div>
            ) : (
              <form action={takipAcildi} className="mt-4 flex flex-col gap-3">
                <input type="hidden" name="dosyaId" value={dosya.id} />
                <p className="text-[12.5px] text-muted-foreground">UYAP'ta takibi açtıysanız bilgileri girip <b className="text-foreground">eşleştirin</b>. Yalnız bu 3 alan elle — gerisi eklentiden gelir.</p>
                {[
                  { name: 'daire', label: 'İcra Dairesi', icon: Building2, def: dosya.yetkiliIcra ?? dosya.kazaYeri ?? '', type: 'text', ph: 'Örn. Gaziosmanpaşa İcra Dairesi' },
                  { name: 'no', label: 'İcra Dosya No', icon: Hash, def: '', type: 'text', ph: '2026 / 32147' },
                  { name: 'tarih', label: 'Açılış Tarihi', icon: CalendarDays, def: '', type: 'date', ph: '' },
                ].map((f) => {
                  const Icon = f.icon
                  return (
                    <div key={f.name}>
                      <label className="font-mono mb-1 block text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{f.label}</label>
                      <div className="relative">
                        <Icon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <input name={f.name} type={f.type} defaultValue={f.def} placeholder={f.ph} className="w-full rounded-[10px] border border-border bg-surface-muted py-2.5 pl-9 pr-3 text-[13px] text-foreground outline-none transition focus:border-kr focus:bg-surface focus:ring-4 focus:ring-kr/15" />
                      </div>
                    </div>
                  )
                })}
                <button type="submit" className="mt-1 flex items-center justify-center gap-2 rounded-[10px] bg-kr px-4 py-2.5 text-[13.5px] font-semibold text-kr-foreground shadow-[0_2px_8px_hsl(var(--kr)/0.32)] transition hover:bg-kr/90">
                  <Link2 className="h-4 w-4" /> Takip Açıldı &amp; Eşleştir
                </button>
              </form>
            )}
          </section>

          {/* geçmiş */}
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-kr" /><h2 className="font-display text-[15px] font-bold">Geçmiş</h2></div>
            <div className="mt-3 space-y-3">
              {dosya.aktiviteler.length === 0 && <div className="text-[13px] text-muted-foreground">Henüz işlem yok.</div>}
              {dosya.aktiviteler.map((a) => (
                <div key={a.id} className="flex gap-2.5 text-[12.5px]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-kr" />
                  <div>
                    <div className="text-foreground">{a.eylem}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{a.createdAt.toLocaleString('tr-TR')}{a.kullanici ? ' · ' + a.kullanici.ad : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
