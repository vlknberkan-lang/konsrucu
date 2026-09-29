/**
 * KonsRücü — Dosya Yol Haritası · durak paneli · components/dosya/durak-paneli.tsx
 *
 * Seçili durağın başlığı ("3 · Takip") ve o durağa ait paneller (06 §2 iskelet: "yalnız seçili durak açık").
 * Veri sunucu sayfasında (`app/(app)/dosya/[id]/page.tsx`) YALNIZ seçili durak için yüklenir; bu bileşen yalnız
 * çizer. Her panel eylem çapası kimliğiyle sarılır (ör. `yh-uyap`) — "Neden?" ve eylem bağlantıları oraya iner.
 */
import type { ReactNode } from 'react'
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
import { HapBilgiler } from '@/components/dosya/oneri/hap-bilgiler'
import { RucuSebebiSec } from '@/components/dosya/oneri/rucu-sebebi-sec'
import { EksikEvrak } from '@/components/dosya/oneri/eksik-evrak'
import { BelgeEkle } from '@/components/akilli-giris/detay/belge-ekle'
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
              <HapBilgiler hap={oneriPanel.hap} bulgu={oneriPanel.bulduklarimiz} />
              {oneriPanel.bulduklarimiz.satirlar.length > 0 && (
                <details className="group rounded-2xl border border-border bg-card">
                  <summary className="cursor-pointer list-none px-5 py-3 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    <span className="mr-1 inline-block transition group-open:rotate-90 motion-reduce:transition-none" aria-hidden>›</span>
                    Tüm bulgular ve kaynakları ({oneriPanel.bulduklarimiz.satirlar.length}) · belge, sayfa, alıntı
                  </summary>
                  <div className="p-2 pt-0">
                    <Bulduklarimiz veri={oneriPanel.bulduklarimiz} bulDugmesi={false} />
                  </div>
                </details>
              )}
              <RucuSebebiSec veri={oneriPanel.rucuSebebi} />
              <EksikEvrak veri={oneriPanel.eksikEvrak} />
            </>
          ) : (
            <BosHal mesaj="Bu durakta henüz iş yok." eskiGorunumHref={eskiGorunumHref} />
          )}
          <div id="yh-evrak" className="flex flex-col gap-2">
            <BelgeEkle dosyaId={dosyaId} otomatikBul />
            <Link href={`/dosya/${dosyaId}?sekme=evrak&evrak=bizim`} className="self-start text-[12.5px] font-semibold text-kr hover:underline">
              Tüm evrak
            </Link>
          </div>
        </>
      )}

      {durak === 2 && (
        <>
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

/** Başlıklı adım bölümü (icra öncesi hazırlık). */
function Adim({ no, baslik, alt, id, children }: { no: number; baslik: string; alt: string; id: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-baslik`} className="mt-5 flex scroll-mt-16 flex-col gap-3">
      <div>
        <h2 id={`${id}-baslik`} className="font-display text-[16px] font-bold tracking-[-0.01em]">
          <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-kr text-[12px] text-white">{no}</span>{baslik}
        </h2>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">{alt}</p>
      </div>
      {children}
    </section>
  )
}

/**
 * İcra öncesi hazırlık — üç adım, tek yol: 1 Evrak → 2 Kontrol → 3 Takibi aç. Takip açmayı etkilemeyen seçimler
 * (yetkili icra dairesi: adliye kaza yerinden türetilir) ve boş Excel önerileri bu yolda yok. Tevziden sonra esas no
 * alanı aynı ekranda, 3. adımın altında açılır (eski ekrana dönmek gerekmez).
 */
export function HazirlikPaneli({ dosyaId, icraDosyaNo, icraDairesi, yazabilirRol, oneriPanel, tevziEdildi }: {
  dosyaId: string
  icraDosyaNo: string | null
  icraDairesi: string | null
  yazabilirRol: boolean
  oneriPanel: OneriPaneli | null
  tevziEdildi: boolean
}) {
  return (
    <>
      <Adim no={1} id="yh-evrak" baslik="Evrak" alt="Poliçe, ekspertiz, kaza tutanağı ve ödeme dekontunu yükleyin. Yapay zekâ yüklenen evrakı kendiliğinden okur.">
        <BelgeEkle dosyaId={dosyaId} otomatikBul />
        {oneriPanel && <AiCikarim veri={oneriPanel.aiCikarim} />}
        <Link href={`/dosya/${dosyaId}?sekme=evrak&evrak=bizim`} className="self-start text-[12.5px] font-semibold text-kr hover:underline">Tüm evrak</Link>
      </Adim>

      <Adim no={2} id="yh-hap" baslik="Kontrol" alt="Okunan bilgileri gözden geçirin, yanlışı yerinde düzeltin, sonra tek düğmeyle onaylayın.">
        {oneriPanel ? (
          <>
            <HapBilgiler hap={oneriPanel.hap} bulgu={oneriPanel.bulduklarimiz} />
            <RucuSebebiSec veri={oneriPanel.rucuSebebi} />
            <EksikEvrak veri={oneriPanel.eksikEvrak} />
            {oneriPanel.bulduklarimiz.satirlar.length > 0 && (
              <details className="group rounded-2xl border border-border bg-card">
                <summary className="cursor-pointer list-none px-5 py-3 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  <span className="mr-1 inline-block transition group-open:rotate-90 motion-reduce:transition-none" aria-hidden>›</span>
                  Bilgilerin kaynakları ({oneriPanel.bulduklarimiz.satirlar.length}) · belge, sayfa, alıntı
                </summary>
                <div className="p-2 pt-0">
                  <Bulduklarimiz veri={oneriPanel.bulduklarimiz} bulDugmesi={false} />
                </div>
              </details>
            )}
          </>
        ) : (
          <p className="rounded-2xl border border-dashed border-border bg-surface-muted/30 px-5 py-4 text-[13px] text-muted-foreground">Kontrol edilecek bilgi için önce evrak yükleyin.</p>
        )}
      </Adim>

      <Adim no={3} id="yh-takip" baslik="Takibi aç" alt="Eksik kalan bir şey varsa düğmenin üstünde yazar. Takip UYAP sekmesindeki KonsLaw panelinden gönderilir.">
        <TakipTalebiPaneli dosyaId={dosyaId} />
        {tevziEdildi && (
          <div id="yh-uyap">
            <IcraNoSenkron dosyaId={dosyaId} icraDosyaNo={icraDosyaNo} icraDairesi={icraDairesi} yazabilir={yazabilirRol} />
          </div>
        )}
      </Adim>
    </>
  )
}
