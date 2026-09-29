/**
 * KonsRücü — /dosya/[id] · tek dosya ekranı `/akilli-giris/[id]`'dir (1 Borçlular · 2 Dosya bilgileri · 3 Faiz ·
 * 4 Geçmiş · 5 Kaynak + sağda hazırlık ve "Takip Aç"). Listeler ve Bugün bu adrese bağlandığı için yönlendirir.
 * Eski sekme parametreleri karşılığına çevrilir (?sekme=evrak → evrak kovası).
 */
import { redirect } from 'next/navigation'

export default function DosyaSayfasi({ params, searchParams }: { params: { id: string }; searchParams: { sekme?: string; evrak?: string } }) {
  const hedef = `/akilli-giris/${encodeURIComponent(params.id)}`
  if (searchParams.sekme === 'evrak') redirect(`${hedef}?belge=${searchParams.evrak === 'uyap' ? 'uyap' : 'hasar'}`)
  redirect(hedef)
}
