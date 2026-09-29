/**
 * KonsRücü — Dosya Yol Haritası · app/(app)/dosya/[id]/page.tsx
 * Tasarım: rucu-hukuk-asistani/docs/06-ana-senaryo-tasarimi.md §2 (satır 105–175) — künye → Şimdi kartı → Sonra
 * → 8 durak → panel çubuğu. Yalnız seçili durağın verisi yüklenir (`?durak`); eski ekran (`/akilli-giris/[id]`)
 * "Ayrıntılı görünüm (eski)" bağlantısıyla açılır, silinmez.
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { DosyaYolHaritasi } from '@/components/dosya/yol-haritasi/yol-haritasi'
import { EYLEM_CAPA } from '@/components/dosya/yol-haritasi/eylem'
import { yolHaritasiYukle, onbellekGuncelle } from '@/lib/konsrucu/yol-haritasi/yukle'
import type { DurakNo, EylemHedef } from '@/lib/konsrucu/yol-haritasi/tipler'
import type { YolHaritasiGorunum } from '@/lib/konsrucu/yol-haritasi/gorunum'
import { DurakPaneli } from '@/components/dosya/durak-paneli'
import { SiraGecis } from '@/components/dosya/sira-gecis'
import { DurakListesi } from '@/components/dosya/yol-haritasi/durak-listesi'
import { SekmeCubugu, EvrakSekmesi, TaraflarSekmesi, GecmisSekmesi, HazirlikAdimlari, SEKMELER, type SekmeKey } from '@/components/dosya/sekmeler/sekmeler'
import { oneriPaneliYukle } from '@/lib/konsrucu/oneri/yukle'
import { olayPaneliYukle } from '@/lib/konsrucu/eksen/yukle'
import { arabuluculukPaneli } from '@/lib/konsrucu/arabuluculuk/veri'
import { davaPaneli } from '@/lib/konsrucu/dava/veri'
import { dilekceV2Acik } from '@/lib/konsrucu/dilekce-v2/bayrak'
import { dilekceV2Ozeti } from '@/lib/konsrucu/dilekce-v2/kart-veri'

/** "AI ile Çıkarım Yap" bu sayfanın sunucu eyleminde çalışır: taranmış belgelerin görsel okuması (≤110 sn) + çıkarım. */
export const maxDuration = 300

/** Eylem çapası (EYLEM_CAPA değeri, "yh-" öneki hariç) → durağı ("Bağla" aşaması; 06 §2). */
const CAPA_DURAK: Record<string, DurakNo> = {
  'yh-ai-cikarim': 1, 'yh-hap': 1, 'yh-bulduklarimiz': 1, 'yh-eksik-evrak': 1, 'yh-rucu-sebebi': 1, 'yh-evrak': 1,
  'yh-hazirlik': 2, 'yh-idari-yol': 2, 'yh-takip': 2,
  'yh-uyap': 3,
  'yh-teblig-itiraz': 4, 'yh-onaylar': 4,
  'yh-arabuluculuk': 5, 'yh-yol-secimi': 5, 'yh-muvekkil-onayi': 5,
  'yh-dava': 6, 'yh-dilekce': 6,
  'yh-yargilama': 7, 'yh-sureler': 7,
  'yh-sonuc': 8, 'yh-taksit': 8,
}

/** Bu ekranda kendi paneli olmayan çapalar → aynı duraktaki en yakın panel (düğme boşa gitmesin). */
const CAPA_ESI: Record<string, string> = {
  'yh-hazirlik': 'yh-takip', 'yh-onaylar': 'yh-teblig-itiraz', 'yh-yol-secimi': 'yh-arabuluculuk', 'yh-muvekkil-onayi': 'yh-arabuluculuk',
}
/** Yalnız ayrıntılı görünümde yaşayan paneller (idari yol önerisi, taksit planı). */
const ESKI_EKRAN_CAPA: Record<string, string> = { 'yh-idari-yol': '?asama=oncesi', 'yh-taksit': '?belge=taksit' }

/** `?durak` yoksa: görünümdeki SIMDI durağı, yoksa DEVAM eden, yoksa 1. */
function seciliDuraktanCoz(gorunum: YolHaritasiGorunum, durakParam: string | undefined): DurakNo {
  const n = Number(durakParam)
  if (Number.isInteger(n) && n >= 1 && n <= 8) return n as DurakNo
  const simdi = gorunum.duraklar.find((d) => d.durum === 'SIMDI')
  if (simdi) return simdi.no
  const devam = gorunum.duraklar.find((d) => d.durum === 'DEVAM')
  if (devam) return devam.no
  return 1
}

export default async function DosyaYolHaritasiSayfasi({ params, searchParams }: {
  params: { id: string }
  searchParams: { durak?: string; prova?: string; panel?: string; sekme?: string; evrak?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const dbUser = await prisma.kullanici.findUnique({ where: { id: user.id }, include: { musteriler: { include: { musteri: { select: { aktif: true } } } } } })
  if (!dbUser) redirect('/login')
  // pasif (dondurulmuş) şirketin dosyası açılmaz — ctx() ve kabukla aynı kural
  const izinli = dbUser.musteriler.filter((m) => m.musteri.aktif).map((m) => m.musteriId)

  const dosya = await prisma.rucuDosyasi.findFirst({
    where: { musteriId: { in: izinli }, OR: [{ id: params.id }, { hasarDosyaNo: params.id }, { hukukDosyaNo: params.id }, { id: { startsWith: params.id } }] },
    select: { id: true, musteriId: true, icraDosyaNo: true, icraDairesi: true, durum: true },
  })
  if (!dosya) notFound()
  // icra öncesi: takip henüz açılmadı → "Hazırlık" ekranı (5 adım); sonrası "Takip" (yol haritası durakları)
  const icraOncesi = !dosya.icraDosyaNo && ['HAVUZDA', 'INCELENIYOR', 'TAKIBE_HAZIR'].includes(dosya.durum)
  const sekme: SekmeKey = SEKMELER.includes(searchParams.sekme as SekmeKey) ? (searchParams.sekme as SekmeKey) : 'is'

  // yol haritası hesaplanamazsa dosya kaybolmasın: ayrıntılı (eski) görünüme düş
  const gorunum = await yolHaritasiYukle({ dosyaId: dosya.id, musteriId: dosya.musteriId, prova: searchParams.prova ?? null }).catch(() => null)
  if (!gorunum) redirect(`/akilli-giris/${dosya.id}`)
  // Bugün masası bu önbellekten okur: açılan dosya listeye girsin (prova yazılmaz; yalnız değiştiyse yazar)
  await onbellekGuncelle(gorunum, dosya.musteriId).catch(() => false)

  const seciliDurak = seciliDuraktanCoz(gorunum, searchParams.durak)
  const avukatRol = dbUser.rol === 'ADMIN' || dbUser.rol === 'AVUKAT'
  const yazabilirRol = dbUser.rol !== 'GORUNTULEYEN'

  const isSekmesi = sekme === 'is'
  const needsOneri = isSekmesi && (icraOncesi || seciliDurak === 1 || seciliDurak === 2)
  const needsOlay = isSekmesi && !icraOncesi && seciliDurak === 4
  const needsArab = isSekmesi && !icraOncesi && seciliDurak === 5
  const needsDava = isSekmesi && !icraOncesi && (seciliDurak === 6 || seciliDurak === 7 || seciliDurak === 8)
  const needsDilekce = isSekmesi && !icraOncesi && (seciliDurak === 6 || seciliDurak === 7) && dilekceV2Acik(dbUser.rol)
  const belgeSayisi = await prisma.belge.count({ where: { dosyaId: dosya.id } })

  const [oneriPanel, olayPanel, arabPanel, davaPanel, dilekceKartlar] = await Promise.all([
    needsOneri ? oneriPaneliYukle(dosya.id).catch(() => null) : Promise.resolve(null),
    needsOlay ? olayPaneliYukle(dosya.id, dosya.musteriId).catch(() => null) : Promise.resolve(null),
    needsArab ? arabuluculukPaneli(dosya.id, dosya.musteriId, dbUser).catch(() => null) : Promise.resolve(null),
    needsDava ? davaPaneli(dosya.id, dosya.musteriId, dbUser).catch(() => null) : Promise.resolve(null),
    needsDilekce ? dilekceV2Ozeti(prisma, dosya.musteriId, dosya.id).catch(() => null) : Promise.resolve(null),
  ])

  const eskiGorunumHref = `/akilli-giris/${dosya.id}`
  const provaQS = searchParams.prova ? `&prova=${encodeURIComponent(searchParams.prova)}` : ''
  const durakHref = (no: number) => `/dosya/${dosya.id}?sekme=is&durak=${no}${provaQS}`
  const sekmeHref = (s: SekmeKey) => `/dosya/${dosya.id}?sekme=${s}${provaQS}`
  const capaHedef = (capa: string) =>
    capa === 'yh-onarim' ? '/yonetim/veri-onarim'
      : ESKI_EKRAN_CAPA[capa] ? `${eskiGorunumHref}${ESKI_EKRAN_CAPA[capa]}`
        : `/dosya/${dosya.id}?sekme=is&durak=${CAPA_DURAK[capa] ?? seciliDurak}${provaQS}#${CAPA_ESI[capa] ?? capa}`
  const eylemHrefleri = Object.fromEntries(Object.entries(EYLEM_CAPA).map(([hedef, capa]) => [hedef, capaHedef(capa)])) as Partial<Record<EylemHedef, string>>

  return (
    <div className="mx-auto max-w-[1024px] px-6 pb-16 pt-5">
      <SiraGecis dosyaId={dosya.id} />
      <DosyaYolHaritasi
        gorunum={gorunum}
        kullaniciRol={dbUser.rol}
        eylemHrefleri={eylemHrefleri}
        eskiGorunumHref={`${eskiGorunumHref}?asama=oncesi`}
        provaGoster={!!searchParams.prova}
        durakHref={durakHref}
        seciliDurak={seciliDurak}
        duraklarGoster={false}
      />

      <div className="mt-5">
        <SekmeCubugu
          aktif={sekme}
          href={sekmeHref}
          etiketler={{ is: icraOncesi ? 'Hazırlık' : 'Takip', evrak: `Evrak ${belgeSayisi}`, taraflar: 'Taraflar ve bilgiler', gecmis: 'Geçmiş' }}
        />

        {sekme === 'is' && icraOncesi && (
          <>
            <HazirlikAdimlari
              dosyaId={dosya.id}
              musteriId={dosya.musteriId}
              adimHref={(capa) => (capa === 'evrak' ? `${sekmeHref('evrak')}&evrak=bizim` : capa === 'borclular' ? `${sekmeHref('taraflar')}#taraflar-borclular` : `${sekmeHref('is')}#${capa}`)}
            />
            <DurakPaneli durak={1} dosyaId={dosya.id} icraDosyaNo={dosya.icraDosyaNo} icraDairesi={dosya.icraDairesi} yazabilirRol={yazabilirRol} avukatRol={avukatRol} eskiGorunumHref={eskiGorunumHref} oneriPanel={oneriPanel} olayPanel={null} arabPanel={null} davaPanel={null} dilekceKartlar={null} />
            <div id="yh-hazirlik" className="mt-4">
              <DurakPaneli durak={2} dosyaId={dosya.id} icraDosyaNo={dosya.icraDosyaNo} icraDairesi={dosya.icraDairesi} yazabilirRol={yazabilirRol} avukatRol={avukatRol} eskiGorunumHref={eskiGorunumHref} oneriPanel={oneriPanel} olayPanel={null} arabPanel={null} davaPanel={null} dilekceKartlar={null} />
            </div>
          </>
        )}

        {sekme === 'is' && !icraOncesi && (
          <>
            <DurakListesi duraklar={gorunum.duraklar} durakHref={durakHref} secili={seciliDurak} />
            <DurakPaneli
              durak={seciliDurak}
              dosyaId={dosya.id}
              icraDosyaNo={dosya.icraDosyaNo}
              icraDairesi={dosya.icraDairesi}
              yazabilirRol={yazabilirRol}
              avukatRol={avukatRol}
              eskiGorunumHref={eskiGorunumHref}
              oneriPanel={oneriPanel}
              olayPanel={olayPanel}
              arabPanel={arabPanel}
              davaPanel={davaPanel}
              dilekceKartlar={dilekceKartlar}
            />
          </>
        )}

        {sekme === 'evrak' && (
          <EvrakSekmesi dosyaId={dosya.id} alt={searchParams.evrak === 'uyap' ? 'uyap' : 'bizim'} altHref={(a) => `${sekmeHref('evrak')}&evrak=${a}`} />
        )}
        {sekme === 'taraflar' && <TaraflarSekmesi dosyaId={dosya.id} musteriId={dosya.musteriId} />}
        {sekme === 'gecmis' && <GecmisSekmesi dosyaId={dosya.id} kullaniciAd={dbUser.ad} />}
      </div>
    </div>
  )
}
