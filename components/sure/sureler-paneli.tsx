/**
 * KonsRücü — Dosya sayfası süreler paneli · components/sure/sureler-paneli.tsx (SUNUCU bileşeni)
 *
 * Kullanım (Bağla aşaması): <SurelerPaneli dosyaId={dosya.id} />
 * Kendi verisini aktif müvekkil kapsamında okur (ctx + sureleriOku); dosya başka müvekkilinse boş döner.
 * İçerik: GN-04/GN-05 kartı (bu dosyanın), e-posta kipi uyarısı, süre defteri (dosya kolonu gizli),
 * "Süre ekle" formu (kapalı başlar) ve sabit uyarılar (sıkıştırılmış).
 */
import { ctx } from '@/lib/konsrucu/db'
import { sureFormSecenekleri, sureleriOku } from '@/lib/konsrucu/sure/sorgu'
import { sureSimdiOnerisi } from '@/lib/konsrucu/sure/gorunum'
import { epostaKipi } from '@/lib/konsrucu/sure/hatirlatma'
import { SureDefteri } from './sure-defteri'
import { SureEkleFormu } from './sure-ekle-formu'
import { SimdiSureKarti } from './simdi-sure-karti'
import { EpostaKipiUyarisi } from './eposta-kipi-uyarisi'
import { SureSabitUyarilar } from './sure-sabit-uyarilar'

export async function SurelerPaneli({ dosyaId }: { dosyaId: string }) {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!aktifMusteriId) return null
  const simdi = new Date()
  const [sureler, secenekler] = await Promise.all([
    sureleriOku({ musteriId: aktifMusteriId, dosyaId, kapsam: 'tum', simdi }),
    sureFormSecenekleri(aktifMusteriId, dosyaId),
  ])
  const oneri = sureSimdiOnerisi(sureler, simdi)
  const avukat = dbUser.rol === 'ADMIN' || dbUser.rol === 'AVUKAT'
  const yazabilir = dbUser.aktif && (avukat || dbUser.rol === 'AVUKAT_YRD')
  const acikSayi = sureler.filter((s) => s.durum !== 'KAPANDI' && s.durum !== 'IPTAL').length

  return (
    <section aria-labelledby={`sureler-${dosyaId}`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Süre defteri</div>
          <h2 id={`sureler-${dosyaId}`} className="font-display text-[18px] font-extrabold tracking-[-0.02em]">Süreler · {acikSayi} açık</h2>
        </div>
      </div>
      <SimdiSureKarti oneri={oneri} sure={oneri ? sureler.find((s) => s.id === oneri.sureId) ?? null : null} onaylayabilir={avukat && dbUser.aktif} />
      <EpostaKipiUyarisi kip={epostaKipi().kip} />
      <SureDefteri
        sureler={sureler}
        rol={dbUser.aktif ? dbUser.rol : 'GORUNTULEYEN'}
        kullaniciId={dbUser.id}
        simdiIso={simdi.toISOString()}
        belgeler={secenekler.belgeler}
        bosMetin="Bu dosyada süre yok. İtiraz, tebliğ ya da ara karar geldiğinde süre önerisini ekleyin."
      />
      {yazabilir && <SureEkleFormu dosyaId={dosyaId} secenekler={secenekler} />}
      <SureSabitUyarilar sikistir />
    </section>
  )
}
