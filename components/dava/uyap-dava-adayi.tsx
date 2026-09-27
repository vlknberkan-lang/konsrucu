'use client'

/**
 * KonsRücü — BULUNAN DAVA · bağ önerisi (S28, 06 2(g)) · components/dava/uyap-dava-adayi.tsx
 * Eklenti UYAP'ta bu icra dosyasına "ilgili dosyalar" alanıyla bağlı bir dava buldu. Avukat "Bu dava bizim, bağla"
 * derse dava kaydı UYAP değerleriyle açılır; dava no ve arabuluculuk no elle girilmez. İİK 67 kaydı kanıtla
 * "kapanmaya hazır" olur, kapanışı yine avukat onaylar.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { davaAdayiKarar } from '@/app/(app)/dosya-islem/dava-actions'
import { uyaptaDavaAra } from '@/app/(app)/dosya-islem/senkron-actions'
import type { DavaAdayiUI } from '@/lib/konsrucu/dava/veri'
import { BirincilDugme, gunGoster, IkincilDugme, Kart, Mesaj, useAksiyon } from '../arabuluculuk/ortak'

export function UyapDavaAdayiKarti({ aday, yetki }: { aday: DavaAdayiUI; yetki: { yazabilir: boolean; avukat: boolean } }) {
  const { bekliyor, hata, bilgi, calistir } = useAksiyon()
  const satir = (ad: string, deger: React.ReactNode) => (
    <div className="flex gap-3 border-b border-border-subtle py-1.5 last:border-0">
      <span className="w-40 shrink-0 text-[11.5px] font-semibold text-muted-foreground">{ad}</span>
      <span className="text-[12.5px]">{deger ?? '—'}</span>
    </div>
  )
  const tarih = (s: string | null) => (s ? gunGoster(s) : null)
  const rol = aday.rolumuz === 'DAVACI' ? 'davacı müvekkil — uyumlu' : aday.rolumuz === 'DAVALI' ? 'müvekkil DAVALI — karşı taraf davası' : 'taraf listesinde müvekkil unvanı bulunamadı — kontrol edin'
  const karsiTaraf = aday.rolumuz === 'DAVALI'
  return (
    <Kart id={`uyap-dava-${aday.id}`} kicker="UYAP · eklenti buldu" baslik="Bu icra dosyasına bağlı bir dava bulundu" vurgu={karsiTaraf || aday.eslesme.zayif ? 'uyari' : undefined}
      sag={<Search className="h-4 w-4 text-muted-foreground" />}
      alt="Bağlayınca dava kaydı bu değerlerle açılır; esas no ve arabuluculuk no elle girilmez. İİK 67 kapanışını ayrıca siz onaylarsınız.">
      <div>
        {satir('Mahkeme · esas', `${aday.birimAdi ?? '—'} · ${aday.dosyaNo ?? '—'}`)}
        {satir('Açılış', tarih(aday.acilis))}
        {satir('Dava türü', aday.davaTuru)}
        {satir('UYAP durumu', aday.durumMetni)}
        {satir('İlgili dosyalar', aday.ilgiliDosyaHam)}
        {satir('Arabuluculuk no', aday.eslesme.arabuluculukNo ? `${aday.eslesme.arabuluculukNo} (bağlanınca arabuluculuk kaydına yazılır)` : null)}
        {(aday.onIncelemeTarihi || aday.sonrakiDurusma) && satir('Ön inceleme · duruşma', [tarih(aday.onIncelemeTarihi), tarih(aday.sonrakiDurusma)].map((x) => x ?? '—').join(' · '))}
        {satir('Taraf kontrolü', rol)}
      </div>
      {aday.eslesme.zayif && <div className="mt-2"><Mesaj tur="uyari">Programda bu dosyanın icra dairesi boş: eşleşme yalnız esas numarasıyla kuruldu. Daireyi kontrol edin.</Mesaj></div>}
      {aday.eslesme.durum === 'COKLU' && <div className="mt-2"><Mesaj tur="uyari">Aynı icra numarası {aday.eslesme.adet} dosyada var: doğru dosyada bağlayın, diğerinde "Bizim değil" deyin.</Mesaj></div>}
      {aday.birlesenHam && <div className="mt-2"><Mesaj tur="uyari">Birleşen dosya var: {aday.birlesenHam}</Mesaj></div>}
      {aday.iik67.map((k, i) => (
        <div key={i} className="mt-2"><Mesaj tur={k.durum === 'SONRA' ? 'hata' : k.durum === 'KAPANMAYA_HAZIR' ? 'ok' : 'uyari'}>İİK 67: {k.mesaj}</Mesaj></div>
      ))}
      {hata && <div className="mt-2"><Mesaj tur="hata">{hata}</Mesaj></div>}
      {bilgi && <div className="mt-2"><Mesaj tur="ok">{bilgi}</Mesaj></div>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <BirincilDugme bekliyor={bekliyor} disabled={!yetki.yazabilir} onClick={() => calistir(() => davaAdayiKarar({ adayId: aday.id, karar: 'BAGLA' }), (r) => {
          const i = (r as unknown as { iik67?: { hazir: number; sonra: number } }).iik67
          return `Dava bağlandı.${i?.hazir ? ` İİK 67 kaydı kapanmaya hazır (${i.hazir}).` : ''}${i?.sonra ? ' Açılış son günden sonra görünüyor: kontrol edin.' : ''}`
        })}>Bu dava bizim, bağla</BirincilDugme>
        <IkincilDugme disabled={bekliyor || !yetki.yazabilir} onClick={() => calistir(() => davaAdayiKarar({ adayId: aday.id, karar: 'BIZIM_DEGIL' }), () => 'Öneri kapatıldı; bu dava bir daha önerilmeyecek.')}>Bizim değil</IkincilDugme>
      </div>
    </Kart>
  )
}

/**
 * "UYAP'ta davayı ara" (S28): eklentiye DAVA_KESIF işi açar. Sonuç (bulunan dava kartı) bu bölüme düşer; sayfa
 * 3 dakika boyunca 10 sn'de bir tazelenir. Dava no elle girilmez; elle kayıt yalnız eklenti bulamazsa yedektir.
 */
export function UyapDavaAraKarti({ dosyaId }: { dosyaId: string }) {
  const router = useRouter()
  const { bekliyor, hata, bilgi, calistir } = useAksiyon()
  const [izliyor, setIzliyor] = useState(false)
  useEffect(() => {
    if (!izliyor) return
    const t = setInterval(() => router.refresh(), 10_000)
    const son = setTimeout(() => { clearInterval(t); setIzliyor(false) }, 180_000)
    return () => { clearInterval(t); clearTimeout(son) }
  }, [izliyor, router])
  return (
    <Kart id="uyap-dava-ara" kicker="UYAP · dava" baslik="Dava açıldı mı? Program UYAP'ta kendisi bulur"
      alt="Eklenti, UYAP'ta açık davalarınızın 'ilgili dosyalar' alanında bu icra numarasını arar. Bulursa burada onay kartı çıkar; esas no ve arabuluculuk no elle girilmez. Eklenti günde bir kez kendiliğinden de tarar.">
      {hata && <div className="mb-2"><Mesaj tur="hata">{hata}</Mesaj></div>}
      {bilgi && <div className="mb-2"><Mesaj tur="ok">{bilgi}{izliyor ? ' Sonuç birkaç dakika içinde burada görünür.' : ''}</Mesaj></div>}
      <BirincilDugme bekliyor={bekliyor} onClick={() => calistir(() => uyaptaDavaAra({ dosyaId }), (r) => { setIzliyor(true); return (r as unknown as { bilgi?: string }).bilgi ?? 'Arama sıraya alındı.' })}>UYAP'ta davayı ara</BirincilDugme>
    </Kart>
  )
}
