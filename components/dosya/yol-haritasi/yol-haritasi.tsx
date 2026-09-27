/**
 * KonsRücü — DOSYA YOL HARİTASI · components/dosya/yol-haritasi/yol-haritasi.tsx
 *
 * Tek ekranda (06 §2 iskelet): künye (üç eksen + UYAP bağlantısı) → prova bandı → ŞİMDİ kartı (tek birincil
 * düğme) → SONRA (≤ 3) → sekiz duraklı yol haritası. Server component'te kullanılabilir; etkileşimli parçalar
 * (Neden?, geri bildirim, prova) kendi client bileşenlerindedir. Bütün prop'lar serileştirilebilir.
 *
 * Bağlama (Bağla aşaması), ör. dosya sayfasında:
 *   const gorunum = await yolHaritasiYukle({ dosyaId, musteriId: aktifMusteriId, prova: searchParams.prova })
 *   <DosyaYolHaritasi gorunum={gorunum} kullaniciRol={dbUser.rol} eskiGorunumHref={`/akilli-giris/${id}`} />
 */
import type { EylemHedef } from '@/lib/konsrucu/yol-haritasi/tipler'
import type { YolHaritasiGorunum } from '@/lib/konsrucu/yol-haritasi/gorunum'
import { YolHaritasiKunye } from './kunye'
import { SimdiKarti } from './simdi-karti'
import { SonraListesi } from './sonra-listesi'
import { DurakListesi } from './durak-listesi'
import { ProvaBandi } from './prova-bandi'

export interface DosyaYolHaritasiProps {
  gorunum: YolHaritasiGorunum
  /** Oturumdaki kullanıcının rolü (Prisma `Rol`): ADMIN | AVUKAT | AVUKAT_YRD | GORUNTULEYEN. */
  kullaniciRol: string
  /** Hedef başına adres; verilmeyen hedef sayfa içi `#yh-…` çapasına gider. */
  eylemHrefleri?: Partial<Record<EylemHedef, string>>
  /** "{belgeId}" yer tutuculu belge adresi (Neden? kanıt bağlantıları). */
  belgeHrefSablonu?: string
  /** "Ayrıntılı görünüm (eski)" bağlantısı. */
  eskiGorunumHref?: string
  /** Prova bandı gösterilsin mi (varsayılan: evet). */
  provaGoster?: boolean
}

export function DosyaYolHaritasi({ gorunum, kullaniciRol, eylemHrefleri, belgeHrefSablonu, eskiGorunumHref, provaGoster = true }: DosyaYolHaritasiProps) {
  const s = gorunum.sonuc
  const prova = gorunum.prova?.tarih ?? null
  return (
    <div className="space-y-3" data-yol-haritasi={gorunum.motorSurumu}>
      <YolHaritasiKunye gorunum={gorunum} eskiGorunumHref={eskiGorunumHref} />
      {provaGoster && (
        <ProvaBandi dosyaId={gorunum.dosyaId} prova={prova} bugun={gorunum.bugun} simdiKural={s.simdi?.kural ?? s.bekleme?.kural ?? null} kullaniciRol={kullaniciRol} />
      )}
      <p className="sr-only" aria-live="polite">{gorunum.tekCumle}</p>
      <SimdiKarti
        dosyaId={gorunum.dosyaId}
        simdi={s.simdi}
        bekleme={s.bekleme}
        kullaniciRol={kullaniciRol}
        prova={prova}
        eylemHrefleri={eylemHrefleri}
        belgeHrefSablonu={belgeHrefSablonu}
      />
      <SonraListesi sonra={s.sonra} sonraKatlanan={s.sonraKatlanan} ertelenenler={s.ertelenenler} bilgi={s.bilgi} />
      <DurakListesi duraklar={gorunum.duraklar} />
    </div>
  )
}
