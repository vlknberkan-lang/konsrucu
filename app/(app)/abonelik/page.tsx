/**
 * KonsLaw — Abonelik & AI Kredisi · app/(app)/abonelik/page.tsx
 * Kullanıcının plan durumu, kalan/kullanılan kredi, plan karşılaştırması ve yükseltme yolu.
 * Ödeme: iyzico entegre olana dek "havale + elle aktivasyon" yönergesi (superadmin /yonetim'den
 * planı açar); IYZICO_API_KEY tanımlanınca buton ödeme akışına bağlanacak.
 */
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Check, Zap, Building2, Rocket } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { PLAN_AYLIK_KREDI, PLAN_DOSYA_LIMITI } from '@/lib/konsrucu/ai-kredi'

export const dynamic = 'force-dynamic'

const KART = 'rounded-2xl border border-border bg-card shadow-card'

const PLAN_ETIKET: Record<string, string> = { FREE: 'Ücretsiz', BASLANGIC: 'Başlangıç', BURO: 'Büro', KURUMSAL: 'Kurumsal' }

const PLANLAR = [
  {
    kod: 'FREE', ad: 'Ücretsiz', fiyat: '₺0', donem: 'süresiz', ikon: Zap,
    maddeler: ['20 aktif dosya', '1 kullanıcı', '25 AI kredisi (tek seferlik)', 'UYAP senkron + süre bekçileri', 'Takvim · görevler · taksit · masraf'],
  },
  {
    kod: 'BASLANGIC', ad: 'Başlangıç', fiyat: '₺2.250', donem: '/ay + KDV', ikon: Rocket, one: true,
    maddeler: ['300 aktif dosya', '1 kullanıcı', '150 AI kredisi / ay', 'UYAP senkron + süre bekçileri', 'AI çıkarım · dilekçe · emsal · soru'],
  },
  {
    kod: 'BURO', ad: 'Büro', fiyat: '₺5.500', donem: '/ay + KDV', ikon: Building2,
    maddeler: ['Sınırsız aktif dosya', '5 kullanıcı', '500 AI kredisi / ay', 'Tüm Başlangıç özellikleri', 'Öncelikli destek'],
  },
]

export default async function AbonelikPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const dbUser = await prisma.kullanici.findUnique({
    where: { id: user.id },
    include: { musteriler: { select: { musteriId: true } } },
  })
  if (!dbUser) redirect('/login')
  const izinli = dbUser.musteriler.map((m) => m.musteriId)
  const aktifId = cookies().get('aktif_musteri')?.value
  const musteriId = aktifId && izinli.includes(aktifId) ? aktifId : izinli[0]
  if (!musteriId) redirect('/dashboard')

  const otuzGun = new Date(Date.now() - 30 * 86_400_000)
  const [musteri, kullanim] = await Promise.all([
    prisma.musteri.findUnique({ where: { id: musteriId }, select: { ad: true, plan: true, aiKredi: true, donemBasi: true } }),
    prisma.aiKullanim.aggregate({ where: { musteriId, createdAt: { gte: otuzGun } }, _sum: { krediBedeli: true }, _count: { _all: true } }),
  ])
  if (!musteri) redirect('/dashboard')

  const kurumsal = musteri.plan === 'KURUMSAL'
  const kota = PLAN_AYLIK_KREDI[musteri.plan] ?? 0
  const dosyaLimit = PLAN_DOSYA_LIMITI[musteri.plan]
  const donemSonu = musteri.donemBasi ? new Date(musteri.donemBasi.getTime() + 30 * 86_400_000) : null
  const MAIL = `mailto:vberkanbiyikli@gmail.com?subject=${encodeURIComponent(`KonsLaw plan yükseltme — ${musteri.ad}`)}`

  return (
    <div className="mx-auto max-w-[980px] p-6">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Hesap · Plan</div>
      <h1 className="font-display mt-1 text-[26px] font-extrabold tracking-brand-tight">Abonelik & AI Kredisi</h1>

      {/* mevcut durum */}
      <div className={`${KART} mt-5 grid gap-0 sm:grid-cols-3`}>
        <div className="border-b border-border-subtle p-5 sm:border-b-0 sm:border-r">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Mevcut plan</div>
          <div className="font-display mt-1 text-[22px] font-extrabold text-kr">{PLAN_ETIKET[musteri.plan] ?? musteri.plan}</div>
          {donemSonu && <div className="mt-0.5 text-[12px] text-muted-foreground">dönem yenileme: {donemSonu.toLocaleDateString('tr-TR')}</div>}
          {musteri.plan === 'FREE' && <div className="mt-0.5 text-[12px] text-muted-foreground">kredi tek seferlik — yenilenmez</div>}
        </div>
        <div className="border-b border-border-subtle p-5 sm:border-b-0 sm:border-r">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Kalan AI kredisi</div>
          <div className={`font-display mt-1 text-[22px] font-extrabold ${!kurumsal && musteri.aiKredi <= 5 ? 'text-danger' : ''}`}>
            {kurumsal ? '∞' : musteri.aiKredi}
            {!kurumsal && <span className="text-[13px] font-semibold text-muted-foreground"> / {kota}</span>}
          </div>
          <div className="mt-0.5 text-[12px] text-muted-foreground">çıkarım 3 · dilekçe 3 · emsal 2 · soru 1</div>
        </div>
        <div className="p-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Son 30 gün kullanım</div>
          <div className="font-display mt-1 text-[22px] font-extrabold">{Number(kullanim._sum.krediBedeli ?? 0)} <span className="text-[13px] font-semibold text-muted-foreground">kredi</span></div>
          <div className="mt-0.5 text-[12px] text-muted-foreground">{kullanim._count._all} AI işlemi · dosya limiti: {dosyaLimit ?? 'sınırsız'}</div>
        </div>
      </div>

      {kurumsal ? (
        <div className={`${KART} mt-6 p-6 text-center`}>
          <div className="font-display text-[17px] font-bold">Kurumsal plandasınız</div>
          <p className="mx-auto mt-1.5 max-w-[52ch] text-[13.5px] text-muted-foreground">
            Sınırsız dosya ve AI kullanımı sözleşmenize dahildir. Değişiklik talepleri için bize yazın.
          </p>
        </div>
      ) : (
        <>
          {/* plan kartları */}
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {PLANLAR.map((p) => {
              const Ikon = p.ikon
              const mevcut = musteri.plan === p.kod
              return (
                <div key={p.kod} className={`${KART} relative flex flex-col p-5 ${p.one ? 'border-kr ring-1 ring-kr/30' : ''}`}>
                  {p.one && <span className="font-mono absolute -top-2.5 left-5 rounded-full bg-kr px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-kr-foreground">Önerilen</span>}
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-kr/10 text-kr"><Ikon className="h-[18px] w-[18px]" /></span>
                    <div>
                      <div className="font-display text-[15.5px] font-bold">{p.ad}</div>
                      <div className="text-[13px]"><b className="font-display text-[17px]">{p.fiyat}</b> <span className="text-muted-foreground">{p.donem}</span></div>
                    </div>
                  </div>
                  <ul className="mt-4 flex flex-1 flex-col gap-2">
                    {p.maddeler.map((m) => (
                      <li key={m} className="flex items-start gap-2 text-[12.5px] text-foreground">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-kr" /> {m}
                      </li>
                    ))}
                  </ul>
                  {mevcut ? (
                    <div className="mt-4 rounded-[10px] border border-border bg-surface-muted py-2.5 text-center text-[13px] font-semibold text-muted-foreground">Mevcut planınız</div>
                  ) : p.kod === 'FREE' ? (
                    <div className="mt-4 py-2.5 text-center text-[12px] text-muted-foreground">—</div>
                  ) : (
                    <a href={MAIL} className="mt-4 rounded-[10px] bg-kr py-2.5 text-center text-[13.5px] font-bold text-kr-foreground transition hover:brightness-105">
                      Bu plana geç
                    </a>
                  )}
                </div>
              )
            })}
          </div>

          {/* ödeme yönergesi (iyzico gelene dek) */}
          <div className={`${KART} mt-5 flex flex-col gap-2 p-5 text-[13px] text-muted-foreground`}>
            <div className="font-semibold text-foreground">Nasıl geçilir?</div>
            <p>
              &ldquo;Bu plana geç&rdquo; ile bize yazın (büro adınız otomatik eklenir) — aynı gün havale/EFT bilgisi
              gönderir, ödemeniz ulaştığında planınızı dakikalar içinde aktifleştirip e-arşiv faturanızı iletiriz.
              Kredi kartıyla otomatik ödeme çok yakında burada olacak.
            </p>
            <p className="text-[12px]">Ek kredi paketi (100 kredi · ₺500 + KDV) için de aynı adresten yazabilirsiniz.</p>
          </div>
        </>
      )}
    </div>
  )
}
