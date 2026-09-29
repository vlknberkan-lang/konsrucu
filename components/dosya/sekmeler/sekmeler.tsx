/**
 * KonsRücü — dosya ekranı sekmeleri · components/dosya/sekmeler/sekmeler.tsx (sunucu bileşenleri)
 * Dosya ekranı uzun bir akış değil: üstte künye + Şimdi sabit, altında sekmeler. Her sekme YALNIZ kendi verisini
 * yükler (açık olmayan sekme sorgu yapmaz). Bileşenler eski ayrıntılı ekrandakilerin aynısıdır (tek kaynak).
 */
import Link from 'next/link'
import { Check, Clock, Send, StickyNote } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { EvrakGruplari } from '@/components/akilli-giris/detay/evrak-gruplari'
import { UyapEvraklar } from '@/components/akilli-giris/detay/uyap-evraklar'
import { BelgeEkle } from '@/components/akilli-giris/detay/belge-ekle'
import { BorclularDuzenle } from '@/components/akilli-giris/detay/borclular-duzenle'
import { CikarimDuzenle } from '@/components/akilli-giris/detay/cikarim-duzenle'
import { FaizPanel } from '@/components/akilli-giris/detay/faiz-panel'
import { NotForm } from '@/components/akilli-giris/detay/not-form'
import { oranlariOku } from '@/lib/konsrucu/faiz'
import { sonAiCikarimi } from '@/lib/konsrucu/oneri/yukle'
import { yuzeyAcik } from '@/lib/ai/bayrak'
import { tarihTR, saatTR } from '@/lib/konsrucu/format'
import { toTRInput as sayiToTRInput } from '@/lib/konsrucu/sayi'

export type SekmeKey = 'is' | 'evrak' | 'taraflar' | 'gecmis'
export const SEKMELER: readonly SekmeKey[] = ['is', 'evrak', 'taraflar', 'gecmis']

const trInput = (n: number) => sayiToTRInput(n, { binlik: false })
const gunInput = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '')
const initials = (ad: string) => ad.split(/\s+/).filter(Boolean).map((s) => s[0]).slice(0, 2).join('').toUpperCase()
const kutu = 'rounded-2xl border border-border bg-surface p-5'

function Baslik({ baslik, alt }: { baslik: string; alt?: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-[16px] font-bold tracking-[-0.01em]">{baslik}</h2>
      {alt && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{alt}</p>}
    </div>
  )
}

/** Sekme çubuğu: bağlantılar (sunucu tarafı; klavye ve geri tuşu doğal çalışır). */
export function SekmeCubugu({ aktif, href, etiketler }: { aktif: SekmeKey; href: (s: SekmeKey) => string; etiketler: Record<SekmeKey, string> }) {
  return (
    <nav aria-label="Dosya bölümleri" className="sticky top-0 z-20 -mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-1 backdrop-blur">
      {SEKMELER.map((s) => {
        const on = s === aktif
        return (
          <Link
            key={s}
            href={href(s)}
            aria-current={on ? 'page' : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-[13.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 ${on ? 'border-kr text-kr' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {etiketler[s]}
          </Link>
        )
      })}
    </nav>
  )
}

/** Evrak: bizim evrak (Hasar/Excel/yüklenen) ve UYAP evrakı ayrı ayrı. */
export async function EvrakSekmesi({ dosyaId, alt, altHref }: { dosyaId: string; alt: 'bizim' | 'uyap'; altHref: (a: 'bizim' | 'uyap') => string }) {
  const belgeler = await prisma.belge.findMany({
    where: { dosyaId },
    select: { id: true, kategori: true, dosyaAdi: true, confidence: true, storagePath: true, kaynakRef: true, belgeTarihi: true, createdAt: true },
  })
  const bizim = belgeler.filter((b) => !b.kaynakRef)
  const uyap = belgeler.filter((b) => b.kaynakRef)
  const secenek = (a: 'bizim' | 'uyap', etiket: string, n: number) => (
    <Link
      href={altHref(a)}
      aria-current={alt === a ? 'true' : undefined}
      className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 ${alt === a ? 'bg-kr text-white' : 'bg-surface-muted text-muted-foreground hover:text-foreground'}`}
    >
      {etiket} <span className="font-mono">{n}</span>
    </Link>
  )
  return (
    <section className={kutu}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {secenek('bizim', 'Bizim evrak', bizim.length)}
        {secenek('uyap', 'UYAP evrakı', uyap.length)}
      </div>
      {alt === 'bizim' ? (
        <>
          <Baslik baslik="Bizim evrak" alt="Müvekkilden, Excel'den ya da elle yüklenen evrak: poliçe, ekspertiz, tutanak, dekont, fotoğraflar." />
          <div className="mb-4"><BelgeEkle dosyaId={dosyaId} otomatikBul /></div>
          {bizim.length ? (
            <EvrakGruplari belgeler={bizim.map((b) => ({ id: b.id, kategori: b.kategori as string, dosyaAdi: b.dosyaAdi, confidence: b.confidence, foto: b.kategori === 'HASAR_FOTO', acilabilir: !!b.storagePath }))} />
          ) : (
            <p className="text-[13px] text-muted-foreground">Henüz evrak yok. Poliçe, ekspertiz, kaza tutanağı ve ödeme dekontunu yükleyin.</p>
          )}
        </>
      ) : (
        <>
          {uyap.length ? (
            <UyapEvraklar
              evraklar={uyap
                .map((b) => ({ id: b.id, dosyaAdi: b.dosyaAdi, kategori: b.kategori as string, t: (b.belgeTarihi ?? b.createdAt).toISOString(), indirme: b.createdAt.toISOString(), acilabilir: !!b.storagePath }))
                .sort((a, b) => b.t.localeCompare(a.t))}
            />
          ) : (
            <p className="text-[13px] text-muted-foreground">UYAP'tan henüz evrak inmedi. İcra numarası girildiğinde eklenti evrakı kendiliğinden çeker.</p>
          )}
        </>
      )}
    </section>
  )
}

/** Taraflar ve bilgiler: borçlular, dosya künyesi (düzenlenebilir), faiz. */
export async function TaraflarSekmesi({ dosyaId, musteriId }: { dosyaId: string; musteriId: string }) {
  const [d, ayarlar] = await Promise.all([
    prisma.rucuDosyasi.findFirst({ where: { id: dosyaId, musteriId }, include: { borclular: true, odemeler: true } }),
    prisma.ayarlar.findUnique({ where: { musteriId }, select: { faizJson: true } }),
  ])
  if (!d) return null
  const bugun = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10)
  return (
    <div className="space-y-4">
      <section className={kutu} id="taraflar-borclular">
        <Baslik baslik="Borçlular" alt="Rücu muhatapları. Teyit edilmeyen borçlu takip talebine girmez." />
        <BorclularDuzenle
          dosyaId={d.id}
          borclular={d.borclular.map((b) => ({ id: b.id, adUnvan: b.adUnvan, tcVkn: b.tcVkn ?? '', telefon: b.telefon ?? '', adres: b.adres ?? '', rol: b.rol as string, kaynak: b.kaynak ?? '', teyit: b.teyitDurumu as string }))}
        />
      </section>
      <section className={kutu} id="taraflar-kunye">
        <Baslik baslik="Dosya bilgileri" alt="Hasar, kaza ve tutar bilgileri. Düzeltme kaydedilince yeniden çıkarım onu ezmez." />
        <CikarimDuzenle
          dosyaId={d.id}
          v={{
            yol: d.yol ?? '', brans: d.brans ?? '', hukukDosyaNo: d.hukukDosyaNo ?? '', hasarDosyaNo: d.hasarDosyaNo ?? '',
            sigortaliUnvan: d.sigortaliUnvan ?? '', sigortaliTelefon: d.sigortaliTelefon ?? '', sigortaliPlaka: d.sigortaliPlaka ?? '', karsiPlaka: d.karsiPlaka ?? '',
            rucuSebebi: d.rucuSebebi ?? '', rucuOrani: d.rucuOrani ?? '',
            asilAlacak: d.asilAlacak != null ? String(Number(d.asilAlacak)) : '', rucuTutari: d.rucuTutari != null ? String(Number(d.rucuTutari)) : '',
            kazaYeri: d.kazaYeri ?? '', il: d.il ?? '', yetkiliIcra: d.yetkiliIcra ?? '',
            kazaTarihi: gunInput(d.kazaTarihi), hasarTarihi: gunInput(d.hasarTarihi), zamanasimi: gunInput(d.zamanasimi),
            kusurDurumu: d.kusurDurumu ?? '', olusSekli: d.olusSekli ?? '', muhatapOzet: d.muhatapOzet ?? '',
          }}
        />
      </section>
      <section className={kutu} id="taraflar-faiz">
        <Baslik baslik="Faiz" alt="Anapara kusur payıdır; faiz son dekont tarihinden bugüne işler. Hepsi düzenlenebilir." />
        <FaizPanel
          dosyaId={d.id}
          oranlar={oranlariOku(ayarlar?.faizJson)}
          bugun={bugun}
          init={{
            davaTutari: d.rucuTutari != null ? trInput(Number(d.rucuTutari)) : '',
            asilAlacak: d.asilAlacak != null ? trInput(Number(d.asilAlacak)) : '',
            faizBaslangic: gunInput(d.faizBaslangic),
            faizBitis: gunInput(d.faizBitis),
            faizTutari: d.faizTutari != null ? trInput(Number(d.faizTutari)) : '',
            dekontlar: [...d.odemeler]
              .sort((a, b) => (a.tarih?.getTime() ?? 0) - (b.tarih?.getTime() ?? 0))
              .map((o) => ({ tarih: gunInput(o.tarih), tutar: o.tutar != null ? trInput(Number(o.tutar)) : '', haricMi: o.haricMi, aciklama: o.aciklama ?? '' })),
          }}
        />
      </section>
    </div>
  )
}

/** Geçmiş: not ekle + kronolojik zaman çizelgesi (işlemler, notlar, UYAP olayları). */
export async function GecmisSekmesi({ dosyaId, kullaniciAd }: { dosyaId: string; kullaniciAd: string }) {
  const [aktiviteler, notlar, olaylar] = await Promise.all([
    prisma.aktivite.findMany({ where: { dosyaId }, include: { kullanici: { select: { ad: true } } }, orderBy: { createdAt: 'desc' }, take: 300 }),
    prisma.not.findMany({ where: { dosyaId }, include: { kullanici: { select: { ad: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.takipOlayi.findMany({ where: { dosyaId }, select: { id: true, tip: true, aciklama: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 300 }),
  ])
  type Satir = { id: string; tip: 'not' | 'aktivite' | 'takip' | 'teyit'; t: Date; kim: string; metin: string }
  const satirlar: Satir[] = [
    ...aktiviteler.map((a) => ({ id: a.id, tip: /teyit/i.test(a.eylem) ? ('teyit' as const) : ('aktivite' as const), t: a.createdAt, kim: a.kullanici?.ad ?? 'Sistem', metin: a.eylem })),
    ...notlar.map((n) => ({ id: n.id, tip: 'not' as const, t: n.createdAt, kim: n.kullanici?.ad ?? 'Not', metin: n.metin })),
    ...olaylar.map((o) => ({ id: o.id, tip: 'takip' as const, t: o.createdAt, kim: 'UYAP', metin: o.aciklama ?? o.tip })),
  ].sort((a, b) => b.t.getTime() - a.t.getTime())
  const META = {
    not: { icon: StickyNote, cls: 'bg-kr-soft text-kr-ink' },
    aktivite: { icon: Clock, cls: 'bg-surface-muted text-muted-foreground' },
    teyit: { icon: Check, cls: 'bg-success-soft text-success' },
    takip: { icon: Send, cls: 'bg-kr-soft text-kr' },
  } as const
  return (
    <section className={kutu}>
      <Baslik baslik="Geçmiş ve notlar" alt="Dosyadaki bütün işlemler, notlar ve UYAP gelişmeleri; en yeni üstte." />
      <NotForm dosyaId={dosyaId} init={initials(kullaniciAd)} />
      {satirlar.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Henüz işlem yok.</p>
      ) : (
        <ol className="relative mt-2">
          <span className="absolute bottom-2 left-[15px] top-2 w-[1.5px] bg-border-subtle" aria-hidden />
          {satirlar.map((o) => {
            const M = META[o.tip]
            return (
              <li key={`${o.tip}-${o.id}`} className="relative flex gap-3 pb-4 last:pb-0">
                <span className={`z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-surface ${M.cls}`}><M.icon className="h-4 w-4" aria-hidden /></span>
                <div className="min-w-0 pt-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[12.5px] font-bold text-foreground">{o.kim}</span>
                    {o.tip === 'not' && <span className="font-mono rounded-full bg-kr-soft px-1.5 py-[1px] text-[9px] uppercase text-kr-ink">Not</span>}
                    <span className="font-mono text-[10.5px] text-muted-foreground">{tarihTR(o.t, { day: '2-digit', month: '2-digit', year: 'numeric' })} · {saatTR(o.t)}</span>
                  </div>
                  <p className={`mt-0.5 whitespace-pre-line text-[12.8px] leading-[1.5] ${o.tip === 'not' ? 'text-foreground' : 'text-muted-foreground'}`}>{o.metin}</p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

/** Hazırlık adımları (icra öncesi): üç adım — Evrak → Kontrol → Takibi aç. Adıma tıklayınca o bölüme iner. */
export async function HazirlikAdimlari({ dosyaId, musteriId, adimHref }: { dosyaId: string; musteriId: string; adimHref: (capa: string) => string }) {
  const [d, belge, borclu, teyitli, oneri, metinli, sonAi] = await Promise.all([
    prisma.rucuDosyasi.findFirst({ where: { id: dosyaId, musteriId }, select: { cikarimJson: true, icraDosyaNo: true } }),
    prisma.belge.count({ where: { dosyaId, kaynakRef: null } }),
    prisma.borclu.count({ where: { dosyaId } }),
    prisma.borclu.count({ where: { dosyaId, teyitDurumu: 'TEYIT_EDILDI' } }),
    prisma.alanDegeri.count({ where: { dosyaId, durum: 'ONERI', silindiAt: null } }),
    prisma.belge.count({ where: { dosyaId, kaynakRef: null, silindiAt: null, extractedText: { not: null } } }),
    sonAiCikarimi(dosyaId),
  ])
  const cj = (d?.cikarimJson ?? {}) as { onay?: { ok?: boolean }; tevzi?: unknown }
  const onayli = !!cj.onay?.ok
  const tevzi = !!cj.tevzi
  // metni okunan evrak var ama yapay zekâ hiç çalışmadı → kontrol adımı önce çıkarımı ister
  const aiBekliyor = metinli > 0 && yuzeyAcik('cikarim') && !sonAi
  const kontrolDetay = aiBekliyor ? 'Önce evrak okunmalı'
    : oneri > 0 ? `${oneri} bilgi kontrol bekliyor`
      : borclu > teyitli ? `${borclu - teyitli} borçlu teyit bekliyor`
        : onayli ? 'Onaylandı' : 'Onay bekliyor'
  const adimlar = [
    { no: 1, ad: 'Evrak', durum: belge > 0 ? 'tamam' : 'simdi', detay: belge > 0 ? `${belge} belge` : 'Poliçe, ekspertiz, tutanak, dekont', capa: 'yh-evrak' },
    { no: 2, ad: 'Kontrol', durum: onayli ? 'tamam' : belge > 0 ? 'simdi' : 'sirada', detay: kontrolDetay, capa: 'yh-hap' },
    { no: 3, ad: 'Takibi aç', durum: d?.icraDosyaNo ? 'tamam' : onayli ? 'simdi' : 'sirada', detay: tevzi ? 'Esas no bekleniyor' : onayli ? "UYAP'ta açılmaya hazır" : 'Kontrolden sonra', capa: 'yh-takip' },
  ] as const
  // İlk "simdi" dışındakiler "sırada" görünür: tek odak
  const ilk = adimlar.find((a) => a.durum === 'simdi')?.no
  return (
    <nav aria-label="Hazırlık adımları" className={`${kutu} mb-2`}>
      <ol className="grid gap-2 sm:grid-cols-3">
        {adimlar.map((a) => {
          const tamam = a.durum === 'tamam'
          const simdi = a.no === ilk
          return (
            <li key={a.no}>
              <Link
                href={adimHref(a.capa)}
                aria-current={simdi ? 'step' : undefined}
                className={`flex h-full flex-col gap-1 rounded-xl border px-3 py-2.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50 ${simdi ? 'border-kr bg-kr/[0.06]' : 'border-border-subtle hover:border-kr/40'}`}
              >
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${tamam ? 'bg-success-soft text-success' : simdi ? 'bg-kr text-white' : 'bg-surface-muted text-muted-foreground'}`}>
                  {tamam ? <Check className="h-3.5 w-3.5" aria-label="tamam" /> : a.no}
                </span>
                <span className="text-[13px] font-semibold text-foreground">{a.ad}</span>
                <span className="text-[11.5px] text-muted-foreground">{a.detay}</span>
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
