/**
 * KonsRücü — navigasyon sabitleri · lib/konsrucu/nav.tsx
 * RAIL_NAV + durum renkleri statik. Kullanıcı/tenant/son-dosyalar GERÇEK veriden prop gelir (sahte sabit YOK).
 */
import { Inbox, Archive, MapPinned, FileCog, type LucideIcon } from 'lucide-react'

export type NavItem = { id: string; label: string; icon: LucideIcon; href: string; ready: boolean }

export const RAIL_NAV: NavItem[] = [
  { id: 'inbox', label: 'Akıllı Giriş', icon: Inbox, href: '/akilli-giris', ready: true },
  { id: 'archive', label: 'Arşiv & Arama', icon: Archive, href: '/arsiv', ready: false },
  { id: 'regions', label: 'Bölge Eşleştirme', icon: MapPinned, href: '/bolgeler', ready: false },
  { id: 'templates', label: 'Şablon Yönetimi', icon: FileCog, href: '/sablonlar', ready: false },
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
