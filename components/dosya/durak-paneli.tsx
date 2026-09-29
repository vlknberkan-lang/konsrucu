/**
 * KonsRücü — Dosya Yol Haritası · durak paneli · components/dosya/durak-paneli.tsx
 *
 * Seçili durağın başlığı ("3 · Takip") ve o durağa ait paneller (06 §2 iskelet: "yalnız seçili durak açık").
 * Veri sunucu sayfasında (`app/(app)/dosya/[id]/page.tsx`) YALNIZ seçili durak için yüklenir; bu bileşen yalnız
 * çizer. Her panel eylem çapası kimliğiyle sarılır (ör. `yh-uyap`) — "Neden?" ve eylem bağlantıları oraya iner.
 */
import Link from 'next/link'
import { Info } from 'lucide-react'
import type { DurakNo } from '@/lib/konsrucu/yol-haritasi/tipler'
import { DURAK_ADI } from '@/lib/konsrucu/yol-haritasi/duraklar'
import type { OneriPaneli } from '@/lib/konsrucu/oneri/tipler'
import type { OlayPaneliVM } from '@/lib/konsrucu/eksen/gorunum'
import type { ArabuluculukPaneliVeri } from '@/lib/konsrucu/arabuluculuk/veri'
import type { DavaPaneliVeri } from '@/lib/konsrucu/dava/veri'
import type { KartTuru } from '@/lib/konsrucu/dilekce-v2/tipler'
import { AiCikarim } from '@/components/dosya/oneri/ai-cikarim'
import { Bulduklarimiz } from '@/components/dosya/oneri/bulduklarimiz'
import { RucuSebebiSec } from '@/components/dosya/oneri/rucu-sebebi-sec'
import { EksikEvrak } from '@/components/dosya/oneri/eksik-evrak'
import { YetkiliIcraSec } from '@/components/dosya/oneri/yetkili-icra-sec'
import { BelgeEkle } from '@/components/akilli-giris/detay/belge-ekle'
import { ExcelOnerileri } from '@/components/takip-talebi/excel-onerileri'
import { TakipTalebiPaneli } from '@/components/takip-talebi/takip-talebi-paneli'
import { IcraNoSenkron } from '@/components/senkron/icra-no-senkron'
import { TebligItirazPaneli } from '@/components/dosya/olay/teblig-itiraz-paneli'
import { ArabuluculukBolumu } from '@/components/arabuluculuk/arabuluculuk-bolumu'
import { DavaBolumu } from '@/components/dava/dava-bolumu'
import { DilekceV2Giris } from '@/components/dilekce-v2/dilekce-v2-giris'
import { SurelerPaneli } from '@/components/sure/sureler-paneli'

export interface DurakPaneliProps {
  durak: DurakNo
  dosyaId: string
  icraDosyaNo: string | null
  icraDairesi: string | null
  /** Görüntüleyen olmayan (yazabilir) kullanıcı. */
  yazabilirRol: boolean
  /** Avukat ya da yönetici. */
  avukatRol: boolean
  /** Eski görünüme geri dönüş — boş hâlde yedek eylem olarak kullanılır. */
  eskiGorunumHref: string
  oneriPanel?: OneriPaneli | null
  olayPanel?: OlayPaneliVM | null
  arabPanel?: ArabuluculukPaneliVeri | null
  davaPanel?: DavaPaneliVeri | null
  dilekceKartlar?: { tur: KartTuru; surum: number; durum: string }[] | null
}

/** Boş hâl: bir cümle + eylem (06 "Görsel dil"). */
function BosHal({ mesaj, eskiGorunumHref }: { mesaj: string; eskiGorunumHref: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border bg-surface-muted/30 px-5 py-5 text-[13px] text-muted-foreground">
      <span className="inline-flex items-center gap-2"><Info className="h-4 w-4 shrink-0" aria-hidden />{mesaj}</span>
      <Link href={eskiGorunumHref} className="shrink-0 font-semibold text-kr hover:underline">Ayrıntılı görünümde bak</Link>
    </div>
  )
}

export function DurakPaneli({
  durak, dosyaId, icraDosyaNo, icraDairesi, yazabilirRol, avukatRol, eskiGorunumHref,
  oneriPanel, olayPanel, arabPanel, davaPanel, dilekceKartlar,
}: DurakPaneliProps) {
  return (
    <section aria-label={`${durak} · ${DURAK_ADI[durak]}`} className="mt-3 flex flex-col gap-4">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{durak} · {DURAK_ADI[durak]}</div>

      {durak === 1 && (
        <>
          {oneriPanel ? (
            <>
              <AiCikarim veri={oneriPanel.aiCikarim} />
              <Bulduklarimiz veri={oneriPanel.bulduklarimiz} bulDugmesi={false} />
              <RucuSebebiSec veri={oneriPanel.rucuSebebi} />
              <EksikEvrak veri={oneriPanel.eksikEvrak} />
            </>
          ) : (
            <BosHal mesaj="Bu durakta henüz iş yok." eskiGorunumHref={eskiGorunumHref} />
          )}
          <div id="yh-evrak" className="flex flex-col gap-2">
            <BelgeEkle dosyaId={dosyaId} otomatikBul />
            <Link href={`/akilli-giris/${dosyaId}?belge=hasar`} className="self-start text-[12.5px] font-semibold text-kr hover:underline">
              Tüm evrak
            </Link>
          </div>
        </>
      )}

      {durak === 2 && (
        <>
          {oneriPanel ? <YetkiliIcraSec veri={oneriPanel.yetkiliIcra} /> : <BosHal mesaj="Bu durakta henüz iş yok." eskiGorunumHref={eskiGorunumHref} />}
          <ExcelOnerileri dosyaId={dosyaId} />
          <div id="yh-takip"><TakipTalebiPaneli dosyaId={dosyaId} /></div>
        </>
      )}

      {durak === 3 && (
        <div id="yh-uyap">
          <IcraNoSenkron dosyaId={dosyaId} icraDosyaNo={icraDosyaNo} icraDairesi={icraDairesi} yazabilir={yazabilirRol} />
        </div>
      )}

      {durak === 4 && (
        olayPanel ? (
          <div id="yh-teblig-itiraz">
            <TebligItirazPaneli panel={olayPanel} yetkili={avukatRol} tarihGirebilir={yazabilirRol} okuyabilir />
          </div>
        ) : <BosHal mesaj="Bu durakta henüz iş yok." eskiGorunumHref={eskiGorunumHref} />
      )}

      {durak === 5 && (
        arabPanel ? (
          <div id="yh-arabuluculuk"><ArabuluculukBolumu {...arabPanel} /></div>
        ) : <BosHal mesaj="Bu durakta henüz iş yok." eskiGorunumHref={eskiGorunumHref} />
      )}

      {durak === 6 && (
        davaPanel ? (
          <>
            <div id="yh-dava"><DavaBolumu {...davaPanel} /></div>
            {dilekceKartlar && <div id="yh-dilekce"><DilekceV2Giris dosyaId={dosyaId} kartlar={dilekceKartlar} /></div>}
          </>
        ) : <BosHal mesaj="Bu durakta henüz iş yok." eskiGorunumHref={eskiGorunumHref} />
      )}

      {durak === 7 && (
        davaPanel ? (
          <>
            <div id="yh-yargilama"><DavaBolumu {...davaPanel} /></div>
            {dilekceKartlar && <DilekceV2Giris dosyaId={dosyaId} kartlar={dilekceKartlar} />}
            <div id="yh-sureler"><SurelerPaneli dosyaId={dosyaId} /></div>
          </>
        ) : <BosHal mesaj="Bu durakta henüz iş yok." eskiGorunumHref={eskiGorunumHref} />
      )}

      {durak === 8 && (
        davaPanel ? (
          <div id="yh-sonuc"><DavaBolumu {...davaPanel} /></div>
        ) : <BosHal mesaj="Bu durakta henüz iş yok." eskiGorunumHref={eskiGorunumHref} />
      )}
    </section>
  )
}
