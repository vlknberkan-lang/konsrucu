'use client'

/**
 * KonsRücü — RAY EXCEL DAVA ÖNERİSİ kartı (#19–#30) · components/dava/excel-dava-oneri.tsx
 * Excel'den gelen dava hücreleri ÖNERİDİR: avukat "Onayla" deyince dava kartı, aşama, taraflar, işlemler (#28–#30,
 * iş emri no referansNo'da) ve ihtiyati haciz (#27) birlikte açılır. #19/#24 yazılmaz (yalnız karşılaştırma).
 */
import { FileSpreadsheet } from 'lucide-react'
import { excelDavaOnerisiUygula } from '@/app/(app)/dosya-islem/dava-actions'
import type { ExcelDavaOnerisi } from '@/lib/konsrucu/dava/excel-dava'
import { ISLEM_ETIKET, MAHKEME_TUR_ETIKET, IH_SONUC_ETIKET } from '@/lib/konsrucu/dava/sabitler'
import { BirincilDugme, gunGoster, Kart, MaskeliMetin, Mesaj, useAksiyon } from '../arabuluculuk/ortak'

export function ExcelDavaOnerisiKarti({ dosyaId, oneri, yetki }: { dosyaId: string; oneri: ExcelDavaOnerisi; yetki: { yazabilir: boolean; avukat: boolean } }) {
  const { bekliyor, hata, bilgi, calistir } = useAksiyon()
  const d = oneri.dava
  const satir = (no: number, ad: string, deger: React.ReactNode, hedef: string) => (
    <tr key={no} className="border-b border-border-subtle last:border-0">
      <td className="py-1 pr-2 font-mono text-[11px] text-muted-foreground">#{no}</td>
      <td className="py-1 pr-2 text-[12px] font-semibold">{ad}</td>
      <td className="py-1 pr-2 text-[12.5px]">{deger ?? '—'}</td>
      <td className="py-1 font-mono text-[10.5px] text-muted-foreground">{hedef}</td>
    </tr>
  )
  return (
    <Kart id="excel-dava" kicker="Ray takip Excel'i · öneri" baslik="Excel'de dava bilgisi var" sag={<FileSpreadsheet className="h-4 w-4 text-muted-foreground" />}
      alt="Onaylayınca dava kaydı bu değerlerle açılır. Ayrıştırılamayan hücre ham değerle ve 'elle tamamlayın' etiketiyle girer.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left">
          <tbody>
            {satir(19, 'Son durum', oneri.karsilastirma.sonDurum, 'yazılmaz · karşılaştırma')}
            {satir(20, 'Mahkeme', d.mahkemeHam ? `${d.mahkemeHam}${d.mahkemeTuru ? ` (${MAHKEME_TUR_ETIKET[d.mahkemeTuru]})` : ''}` : null, 'Dava.mahkeme*')}
            {satir(21, 'Esas', d.esasYil ? `${d.esasYil}/${d.esasSira}` : null, 'Dava.esasYil/Sira')}
            {satir(22, 'Davalı', oneri.taraflar.length ? oneri.taraflar.map((t, i) => <span key={i} className="mr-2"><MaskeliMetin deger={t.adHam} />{t.eslesme === 'BORCLU' ? ' ✓ borçlu' : ' · eşleşmedi'}</span>) : null, 'DavaTaraf(DAVALI)')}
            {satir(23, 'Üst dosya no', d.ustDosyaNoHam, 'Dava.ustDosyaNoHam')}
            {satir(24, 'Dava son durum', oneri.karsilastirma.davaSonDurum, 'yazılmaz · karşılaştırma')}
            {satir(25, 'Açılış tarihi', d.acilisTarihi ? gunGoster(d.acilisTarihi) : null, 'Dava.acilisTarihi')}
            {satir(26, 'Duruşma', d.sonrakiDurusma ? `${gunGoster(d.sonrakiDurusma.tarih)}${d.sonrakiDurusma.saat ? ` ${d.sonrakiDurusma.saat}` : ''}` : null, 'Dava.sonrakiDurusma')}
            {satir(27, 'İhtiyati haciz', oneri.ihtiyatiHaciz ? `${oneri.ihtiyatiHaciz.sonuc ? IH_SONUC_ETIKET[oneri.ihtiyatiHaciz.sonuc] : 'ayrıştırılamadı'} · "${oneri.ihtiyatiHaciz.excelHam}"` : null, 'IhtiyatiHaciz')}
            {oneri.islemler.map((i) => satir(i.sutun, ISLEM_ETIKET[i.tur], `${i.referansNo ? `iş emri/ref ${i.referansNo}` : 'ayrıştırılamadı'} · "${i.excelHam}"`, `DavaIslem(${i.tur})`))}
          </tbody>
        </table>
      </div>
      {oneri.uyarilar.map((u) => <div key={u} className="mt-2"><Mesaj tur="uyari">{u}</Mesaj></div>)}
      {hata && <div className="mt-2"><Mesaj tur="hata">{hata}</Mesaj></div>}
      {bilgi && <div className="mt-2"><Mesaj tur="ok">{bilgi}</Mesaj></div>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <BirincilDugme bekliyor={bekliyor} disabled={!yetki.avukat} onClick={() => calistir(() => excelDavaOnerisiUygula({ dosyaId }), (r) => `Dava kaydı açıldı: ${(r as unknown as { eklenen: number }).eklenen} kayıt.`)}>Onayla ve dava kaydını aç</BirincilDugme>
        {!yetki.avukat && <span className="text-[11.5px] text-muted-foreground">Excel önerisini yalnız avukat onaylar.</span>}
      </div>
    </Kart>
  )
}
