/**
 * KonsRücü — navigasyon sabitleri · lib/konsrucu/nav.tsx
 * RAIL_NAV + durum renkleri statik. Kullanıcı/tenant/son-dosyalar GERÇEK veriden prop gelir (sahte sabit YOK).
 * S30: Davalar (Dava Panosu), Süreler (süre defteri) ve Veri Onarımı (yalnız avukat ve yönetici) menüde.
 */
import { FilePenLine, Sunrise, Gauge, ClipboardList, AlertTriangle, CheckCircle2, CalendarDays, ListTodo, CreditCard, Receipt, Building2, Puzzle, Scale, Timer, Wrench, type LucideIcon } from 'lucide-react'

/** Rol kodu (prisma `Rol`). */
export type RolKodu = 'ADMIN' | 'AVUKAT' | 'AVUKAT_YRD' | 'GORUNTULEYEN'

/**
 * `roller` doluysa öğe yalnız bu rollere görünür (sayfa yine kendi yetki denetimini yapar; menü yalnız gizler).
 */
export type NavItem = { id: string; label: string; icon: LucideIcon; href: string; ready: boolean; roller?: RolKodu[] }

// id → açık-olay sayacı gibi rozet sayıları (gerçek veriden layout'ta hesaplanır, prop geçer).
export type NavCounts = { onemli?: number; gorevler?: number }

// Aktif destinasyonlar: Bugün masası + Pano + Davalar + Süreler + Atanan Dosyalar (hub) + olaylar + takvim … + Veri Onarımı.
export const RAIL_NAV: NavItem[] = [
  { id: 'dilekceler', label: 'Dilekçe masası', icon: FilePenLine, href: '/dilekceler', ready: true },
  { id: 'bugun', label: 'Bugün', icon: Sunrise, href: '/bugun', ready: true },
  { id: 'panel', label: 'Pano', icon: Gauge, href: '/panel', ready: true },
  { id: 'davalar', label: 'Davalar', icon: Scale, href: '/davalar', ready: true },
  { id: 'sureler', label: 'Süreler', icon: Timer, href: '/sureler', ready: true },
  { id: 'atanan', label: 'Atanan Dosyalar', icon: ClipboardList, href: '/atanan-dosyalar', ready: true },
  { id: 'onemli', label: 'Önemli Olaylar', icon: AlertTriangle, href: '/onemli-olaylar', ready: true },
  { id: 'tamamlanan', label: 'Tamamlanan Olaylar', icon: CheckCircle2, href: '/tamamlanan-olaylar', ready: true },
  { id: 'takvim', label: 'Takvim', icon: CalendarDays, href: '/takvim', ready: true },
  { id: 'gorevler', label: 'Görevler', icon: ListTodo, href: '/gorevler', ready: true },
  { id: 'taksitler', label: 'Taksitler', icon: CreditCard, href: '/taksitler', ready: true },
  { id: 'masraf', label: 'Masraflar', icon: Receipt, href: '/masraf', ready: true },
  { id: 'veri-onarim', label: 'Veri Onarımı', icon: Wrench, href: '/yonetim/veri-onarim', ready: true, roller: ['AVUKAT', 'ADMIN'] },
  { id: 'ayarlar', label: 'Şirket Bilgileri', icon: Building2, href: '/ayarlar', ready: true },
  { id: 'eklenti', label: 'Chrome Eklentisi', icon: Puzzle, href: '/eklenti', ready: true },
]

// Kabuk kullanıcının rolünü görünen etiketle alır (app/(app)/layout.tsx ROL_ETIKET); kod da kabul edilir.
const ROL_ETIKET_KOD: Record<string, RolKodu> = {
  ADMIN: 'ADMIN', AVUKAT: 'AVUKAT', AVUKAT_YRD: 'AVUKAT_YRD', GORUNTULEYEN: 'GORUNTULEYEN',
  'Yönetici': 'ADMIN', 'Avukat': 'AVUKAT', 'Avukat Yrd.': 'AVUKAT_YRD', 'Görüntüleyen': 'GORUNTULEYEN',
}

/** Rol kodu ya da görünen etiket → kod (tanınmazsa null). */
export function rolKodu(rol: string | null | undefined): RolKodu | null {
  return rol ? ROL_ETIKET_KOD[rol.trim()] ?? null : null
}

/**
 * Menü öğesi bu role görünür mü? Rolü tanınmayan kullanıcıda kısıtlı öğe gizlenir (sayfa ayrıca denetler);
 * rol bilgisi hiç gelmediyse (eski çağrı) öğe gösterilir, yetkiyi sayfa verir.
 */
export function navGorunur(item: NavItem, rol: string | null | undefined): boolean {
  if (!item.roller?.length) return true
  if (rol == null) return true
  const kod = rolKodu(rol)
  return !!kod && item.roller.includes(kod)
}

/** Bu adres hangi menü öğesine ait? En uzun eşleşen href kazanır ("/yonetim/veri-onarim" ≠ "/yonetim"). */
export function aktifNav(pathname: string, items: NavItem[] = RAIL_NAV): NavItem | null {
  let en: NavItem | null = null
  for (const n of items) {
    const eslesir = pathname === n.href || pathname.startsWith(n.href + '/')
    if (eslesir && (!en || n.href.length > en.href.length)) en = n
  }
  return en
}

/** Dosya ekranının adresi — tek yer. Yol Haritası (/dosya/[id]) bağlandığında yalnız burası değişir. */
export function dosyaHref(id: string): string {
  return `/akilli-giris/${id}`
}

export type Durum = 'isleniyor' | 'gozden' | 'idariBekl' | 'takibeHazir' | 'gonderildi'

export const DURUM: Record<Durum, { label: string; dot: string }> = {
  isleniyor: { label: 'İşleniyor', dot: 'bg-kr' },
  gozden: { label: 'Gözden geçir', dot: 'bg-warning' },
  idariBekl: { label: 'Dilekçe bekliyor', dot: 'bg-info' },
  takibeHazir: { label: 'Takibe hazır', dot: 'bg-success' },
  gonderildi: { label: 'İmzaya gönderildi', dot: 'bg-muted-foreground' },
}

// Gerçek veriden prop olarak geçer:
export type ShellUser = { ad: string; rol: string; init: string }
export type ShellTenant = {
  musteri: string
  ofis: string
  init: string
  /** FREE/paralı planlarda kalan AI kredisi rozeti; KURUMSAL'da null (rozet çizilmez). */
  kredi?: { plan: string; aiKredi: number } | null
}
export type RecentCase = { hasarNo: string; durum: Durum; dusuk: number }
