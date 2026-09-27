/**
 * KonsRücü — Mevzuat kütüphanesi yükleyicisi · lib/konsrucu/mevzuat/yukle.ts (sunucu; DB istemcisi dışarıdan)
 *
 * S33 / 06 §6.4 (M8, "canlıya yazan işler"): bilgi bankası kataloğu → `MevzuatKaynak` (müvekkil bazında).
 *   - Anahtar `musteriId + kunye` (SQL 013 tekil indeksi); idempotent: aynı katalog ikinci kez "aynı kalacak".
 *   - Kuru kip: eklenecek, değişecek ve aynı kalacak kayıtları döker, HİÇBİR ŞEY yazmaz.
 *   - Gerçek yükleme kuru planın özetiyle çalışır (`beklenenPlanOzeti`): onaylanan liste değiştiyse durur.
 *   - İçeriği değişen kayıtta avukat doğrulaması SIFIRLANIR (yeni metin yeniden doğrulanır).
 *   - Her yükleme bir yükleme kimliği taşır; yanlış yükleme o kimlikle toplu pasife alınır (aktif=false, KULLANMA).
 *   - Pasife alınmış kayıt yeniden yüklemeyle kendiliğinden açılmaz ("pasif kalacak").
 *
 * DB bağımlılığı yapısal arayüzle verilir (Prisma istemcisi ya da test sahtesi); `araclar/mevzuat-yukle.ts`
 * (CLI) ve kütüphane ekranındaki yönetici eylemi aynı fonksiyonu çağırır.
 */
import { createHash } from 'node:crypto'
import { MEVZUAT_KATALOGU, type KatalogKaydi } from './katalog'

export type MevcutMevzuat = {
  id: string
  kunye: string
  icerikOzet: string | null
  aktif: boolean
  durum: string
  yuklemeId: string | null
}

type Veri = Record<string, unknown>

/** Prisma istemcisinin kullanılan yüzeyi (yapısal). */
export type MevzuatDb = {
  mevzuatKaynak: {
    findMany(args: { where: Veri; select?: Veri }): Promise<MevcutMevzuat[]>
    create(args: { data: Veri }): Promise<unknown>
    update(args: { where: { id: string }; data: Veri }): Promise<unknown>
    updateMany(args: { where: Veri; data: Veri }): Promise<{ count: number }>
  }
}

export type YuklemePlani = {
  eklenecek: string[]
  degisecek: string[]
  ayniKalacak: string[]
  pasifKalacak: string[]
  /** Kütüphanede olup katalogda olmayanlar (elle eklenen, başka müvekkilden kopyalanan): dokunulmaz. */
  katalogDisi: string[]
  /** Planın kısa özeti: gerçek yükleme yalnız aynı planla çalışır. */
  ozet: string
}

const tarih = (s?: string) => (s ? new Date(`${s}T00:00:00.000Z`) : null)

/** Katalog kaydının içerik özeti (sha256). Değişecek / aynı kalacak ayrımının tek ölçüsü. */
export function icerikOzeti(k: KatalogKaydi): string {
  const kanonik = JSON.stringify([
    k.tur, k.kunye, k.alinti, k.resmiUrl, k.erisimTarihi, k.yururlukBas ?? null, k.yururlukBit ?? null,
    k.etiket, k.durum, k.kapsamNotu, [...k.rucuSebebiKodlari].sort(), k.bilgiBankasiYolu,
  ])
  return createHash('sha256').update(kanonik, 'utf8').digest('hex')
}

export function yuklemePlani(mevcutlar: readonly MevcutMevzuat[], katalog: readonly KatalogKaydi[] = MEVZUAT_KATALOGU): YuklemePlani {
  const kunyeler = new Set<string>()
  for (const k of katalog) {
    if (kunyeler.has(k.kunye)) throw new Error(`Katalogda aynı künye iki kez var: ${k.kunye}`)
    kunyeler.add(k.kunye)
  }
  const mevcutMap = new Map(mevcutlar.map((m) => [m.kunye, m]))
  const plan: Omit<YuklemePlani, 'ozet'> = { eklenecek: [], degisecek: [], ayniKalacak: [], pasifKalacak: [], katalogDisi: [] }
  for (const k of katalog) {
    const m = mevcutMap.get(k.kunye)
    if (!m) plan.eklenecek.push(k.kunye)
    else if (m.icerikOzet !== icerikOzeti(k)) plan.degisecek.push(k.kunye)
    else if (m.aktif) plan.ayniKalacak.push(k.kunye)
    else plan.pasifKalacak.push(k.kunye)
  }
  for (const m of mevcutlar) if (!kunyeler.has(m.kunye)) plan.katalogDisi.push(m.kunye)
  const ozet = createHash('sha256')
    .update(JSON.stringify([plan.eklenecek, plan.degisecek, katalog.map(icerikOzeti)]), 'utf8')
    .digest('hex')
    .slice(0, 16)
  return { ...plan, ozet }
}

function kayitVerisi(k: KatalogKaydi): Veri {
  return {
    tur: k.tur, kunye: k.kunye, alinti: k.alinti, resmiUrl: k.resmiUrl, erisimTarihi: tarih(k.erisimTarihi),
    yururlukBas: tarih(k.yururlukBas), yururlukBit: tarih(k.yururlukBit), etiket: k.etiket, durum: k.durum,
    kapsamNotu: k.kapsamNotu, rucuSebebiKodlari: [...k.rucuSebebiKodlari], bilgiBankasiYolu: k.bilgiBankasiYolu,
    icerikOzet: icerikOzeti(k),
  }
}

export class PlanDegistiHata extends Error {
  constructor() {
    super('Yükleme planı onaylanan kuru çalıştırmadan sonra değişti. Önce yeniden kuru çalıştırıp listeyi onaylayın.')
    this.name = 'PlanDegistiHata'
  }
}

export type YuklemeSonucu = { plan: YuklemePlani; kuru: boolean; yazilan: number; yuklemeId: string | null }

/**
 * Kataloğu müvekkilin kütüphanesine yükler. `kuru` iken yalnız plan döner. Gerçek yüklemede `yuklemeId` zorunlu;
 * `beklenenPlanOzeti` verilirse plan değişmişse PlanDegistiHata. Yazma sırası: eklemeler, sonra değişenler.
 * Çağıran bunu bir işlem (transaction) istemcisiyle çağırmalıdır (tek işlem, 06 §6.4).
 */
export async function mevzuatYukle(
  db: MevzuatDb,
  g: { musteriId: string; kuru: boolean; yuklemeId?: string; beklenenPlanOzeti?: string; katalog?: readonly KatalogKaydi[] },
): Promise<YuklemeSonucu> {
  const katalog = g.katalog ?? MEVZUAT_KATALOGU
  const mevcutlar = await db.mevzuatKaynak.findMany({
    where: { musteriId: g.musteriId },
    select: { id: true, kunye: true, icerikOzet: true, aktif: true, durum: true, yuklemeId: true },
  })
  const plan = yuklemePlani(mevcutlar, katalog)
  if (g.kuru) return { plan, kuru: true, yazilan: 0, yuklemeId: null }
  if (!g.yuklemeId?.trim()) throw new Error('Gerçek yükleme için yükleme kimliği gerekli.')
  if (g.beklenenPlanOzeti && g.beklenenPlanOzeti !== plan.ozet) throw new PlanDegistiHata()

  const katalogMap = new Map(katalog.map((k) => [k.kunye, k]))
  const mevcutMap = new Map(mevcutlar.map((m) => [m.kunye, m]))
  let yazilan = 0
  for (const kunye of plan.eklenecek) {
    const k = katalogMap.get(kunye)!
    await db.mevzuatKaynak.create({ data: { musteriId: g.musteriId, ...kayitVerisi(k), aktif: true, yuklemeId: g.yuklemeId } })
    yazilan++
  }
  for (const kunye of plan.degisecek) {
    const k = katalogMap.get(kunye)!
    const m = mevcutMap.get(kunye)!
    // İçerik değişti → önceki doğrulama bu metin için geçerli değil
    await db.mevzuatKaynak.update({ where: { id: m.id }, data: { ...kayitVerisi(k), yuklemeId: g.yuklemeId, dogrulayanId: null, dogrulamaAt: null } })
    yazilan++
  }
  return { plan, kuru: false, yazilan, yuklemeId: g.yuklemeId }
}

/** Yanlış yüklemeyi yükleme kimliğiyle toplu pasife alır (06 §6.4: durum = KULLANMA, aktif = false). */
export async function yuklemeyiPasifeAl(
  db: MevzuatDb,
  g: { musteriId: string; yuklemeId: string; kuru: boolean },
): Promise<{ etkilenecek: string[]; yazilan: number }> {
  const hedef = await db.mevzuatKaynak.findMany({
    where: { musteriId: g.musteriId, yuklemeId: g.yuklemeId, aktif: true },
    select: { id: true, kunye: true, icerikOzet: true, aktif: true, durum: true, yuklemeId: true },
  })
  const etkilenecek = hedef.map((h) => h.kunye)
  if (g.kuru || !hedef.length) return { etkilenecek, yazilan: 0 }
  const r = await db.mevzuatKaynak.updateMany({
    where: { musteriId: g.musteriId, yuklemeId: g.yuklemeId, aktif: true },
    data: { aktif: false, durum: 'KULLANMA' },
  })
  return { etkilenecek, yazilan: r.count }
}

/**
 * "Zurich'e kopyala": kaynak kaydın içeriği hedef müvekkile doğrulamasız kopyalanır. Doğrulama müvekkil bazındadır:
 * DOGRULANDI kayıt hedefte TEYIT_GEREKLI başlar. KULLANMA bir doğrulama değil uyarıdır; hedefte de KULLANMA kalır.
 */
export function kopyaVerisi(
  kaynak: {
    id: string; tur: string; kunye: string; alinti: string; resmiUrl: string | null; erisimTarihi: Date | null; durum: string
    yururlukBas: Date | null; yururlukBit: Date | null; etiket: string; kapsamNotu: string | null
    rucuSebebiKodlari: string[]; bilgiBankasiYolu: string | null; icerikOzet: string | null
  },
  hedefMusteriId: string,
): Veri {
  return {
    musteriId: hedefMusteriId,
    tur: kaynak.tur, kunye: kaynak.kunye, alinti: kaynak.alinti, resmiUrl: kaynak.resmiUrl, erisimTarihi: kaynak.erisimTarihi,
    yururlukBas: kaynak.yururlukBas, yururlukBit: kaynak.yururlukBit, etiket: kaynak.etiket,
    kapsamNotu: kaynak.kapsamNotu, rucuSebebiKodlari: [...kaynak.rucuSebebiKodlari], bilgiBankasiYolu: kaynak.bilgiBankasiYolu,
    icerikOzet: kaynak.icerikOzet,
    durum: kaynak.durum === 'KULLANMA' ? 'KULLANMA' : 'TEYIT_GEREKLI', dogrulayanId: null, dogrulamaAt: null, yuklemeId: null, aktif: true, kopyaKaynakId: kaynak.id,
  }
}
