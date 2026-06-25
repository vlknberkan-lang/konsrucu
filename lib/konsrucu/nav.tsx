/**
 * KonsRücü — navigasyon sabitleri · lib/konsrucu/nav.tsx
 * RAIL_NAV + durum renkleri statik. Kullanıcı/tenant/son-dosyalar GERÇEK veriden prop gelir (sahte sabit YOK).
 */
import { ClipboardList, AlertTriangle, CheckCircle2, CalendarDays, CreditCard, Building2, Puzzle, type LucideIcon } from 'lucide-react'

export type NavItem = { id: string; label: string; icon: LucideIcon; href: string; ready: boolean }

// id → açık-olay sayacı gibi rozet sayıları (gerçek veriden layout'ta hesaplanır, prop geçer).
export type NavCounts = { onemli?: number }

// Aktif destinasyonlar: Atanan Dosyalar (hub) + Önemli/Tamamlanan Olaylar + Takvim + Taksitler + Şirket Bilgileri + Eklenti.
export const RAIL_NAV: NavItem[] = [
  { id: 'atanan', label: 'Atanan Dosyalar', icon: ClipboardList, href: '/atanan-dosyalar', ready: true },
  { id: 'onemli', label: 'Önemli Olaylar', icon: AlertTriangle, href: '/onemli-olaylar', ready: true },
  { id: 'tamamlanan', label: 'Tamamlanan Olaylar', icon: CheckCircle2, href: '/tamamlanan-olaylar', ready: true },
  { id: 'takvim', label: 'Takvim', icon: CalendarDays, href: '/takvim', ready: true },
  { id: 'taksitler', label: 'Taksitler', icon: CreditCard, href: '/taksitler', ready: true },
  { id: 'ayarlar', label: 'Şirket Bilgileri', icon: Building2, href: '/ayarlar', ready: true },
  { id: 'eklenti', label: 'Chrome Eklentisi', icon: Puzzle, href: '/eklenti', ready: true },
]

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
export type ShellTenant = { musteri: string; ofis: string; init: string }
export type RecentCase = { hasarNo: string; durum: Durum; dusuk: number }
