/**
 * KonsLaw — Superadmin paneli · app/(app)/yonetim/page.tsx
 * YALNIZ platform sahibi (superadminMi) görür; diğerleri /bugun'a yönlenir (URL menüde yok).
 * Kartlar: özet (hesap/AI maliyet) · hesap tablosu (plan/kredi yönetimi) · demo kayıtları ·
 * son AI kullanımları. Havale satışında plan burada elle açılır.
 */
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'
import { superadminMi } from '@/lib/konsrucu/yonetici'
import { PlanSecici, KrediEkleForm, DemoDurum } from '@/components/yonetim/yonetim-client'

export const dynamic = 'force-dynamic'

const KART = 'rounded-2xl border border-border bg-card p-5 shadow-card'
const TH = 'px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground'
const TD = 'px-3 py-2.5 text-[13px] align-middle'

function tarihKisa(d: Date) {
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default async function YonetimPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const dbUser = user ? await prisma.kullanici.findUnique({ where: { id: user.id }, select: { eposta: true } }) : null
  if (!dbUser || !superadminMi(dbUser.eposta)) redirect('/bugun')

  const otuzGun = new Date(Date.now() - 30 * 86_400_000)
  const [musteriler, aktifSayilar, aiOzet, aiToplam, demolar, sonKullanim] = await Promise.all([
    prisma.musteri.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, ad: true, plan: true, aiKredi: true, aktif: true, createdAt: true,
        _count: { select: { dosyalar: true, kullanicilar: true } },
      },
    }),
    prisma.rucuDosyasi.groupBy({
      by: ['musteriId'],
      where: { durum: { notIn: ['TAHSIL', 'KAPANDI', 'IDARI_YOL'] } },
      _count: { _all: true },
    }),
    prisma.aiKullanim.groupBy({
      by: ['musteriId'],
      where: { createdAt: { gte: otuzGun } },
      _sum: { maliyetUsd: true, krediBedeli: true },
      _count: { _all: true },
    }),
    prisma.aiKullanim.aggregate({
      where: { createdAt: { gte: otuzGun } },
      _sum: { maliyetUsd: true },
      _count: { _all: true },
    }),
    prisma.demoKaydi.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.aiKullanim.findMany({
      orderBy: { createdAt: 'desc' }, take: 15,
      select: { id: true, yuzey: true, model: true, girisToken: true, cikisToken: true, maliyetUsd: true, krediBedeli: true, hata: true, createdAt: true, musteri: { select: { ad: true } } },
    }),
  ])
  const aktifMap = new Map(aktifSayilar.map((a) => [a.musteriId, a._count._all]))
  const aiMap = new Map(aiOzet.map((a) => [a.musteriId, a]))

  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.16em] text-kr">Platform Yönetimi</div>
      <h1 className="font-display text-[26px] font-extrabold tracking-brand-tight">Superadmin Paneli</h1>
      <p className="mt-1 text-[13.5px] text-muted-foreground">Yalnız sana görünür. Havale satışında planı buradan aç; her işlem denetim izine düşer.</p>

      {/* özet kartları */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className={KART}>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Hesap</div>
          <div className="font-display mt-1 text-[28px] font-extrabold">{musteriler.length}</div>
          <div className="text-[12px] text-muted-foreground">{musteriler.filter((m) => m.plan === 'FREE').length} ücretsiz · {musteriler.filter((m) => m.plan !== 'FREE' && m.plan !== 'KURUMSAL').length} ödemeli · {musteriler.filter((m) => m.plan === 'KURUMSAL').length} kurumsal</div>
        </div>
        <div className={KART}>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">AI maliyeti · 30 gün</div>
          <div className="font-display mt-1 text-[28px] font-extrabold">${Number(aiToplam._sum.maliyetUsd ?? 0).toFixed(2)}</div>
          <div className="text-[12px] text-muted-foreground">{aiToplam._count._all} çağrı</div>
        </div>
        <div className={KART}>
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Demo kaydı</div>
          <div className="font-display mt-1 text-[28px] font-extrabold">{demolar.length}</div>
          <div className="text-[12px] text-muted-foreground">{demolar.filter((d) => d.durum === 'YENI').length} yeni bekliyor</div>
        </div>
      </div>

      {/* hesaplar */}
      <div className={`${KART} mt-6 overflow-x-auto p-0`}>
        <div className="border-b border-border px-5 py-3.5 text-[14px] font-bold">Hesaplar & Planlar</div>
        <table className="w-full min-w-[820px]">
          <thead><tr className="border-b border-border-subtle">
            <th className={TH}>Hesap</th><th className={TH}>Plan</th><th className={TH}>AI kredisi</th>
            <th className={TH}>Aktif dosya</th><th className={TH}>Kullanıcı</th><th className={TH}>AI · 30g</th><th className={TH}>Kredi ekle</th>
          </tr></thead>
          <tbody>
            {musteriler.map((m) => {
              const ai = aiMap.get(m.id)
              return (
                <tr key={m.id} className="border-b border-border-subtle last:border-0">
                  <td className={TD}>
                    <div className="font-semibold">{m.ad}</div>
                    <div className="font-mono text-[10.5px] text-muted-foreground">{m.createdAt.toLocaleDateString('tr-TR')}{!m.aktif && ' · PASİF'}</div>
                  </td>
                  <td className={TD}><PlanSecici musteriId={m.id} plan={m.plan} ad={m.ad} /></td>
                  <td className={`${TD} font-mono font-semibold ${m.plan !== 'KURUMSAL' && m.aiKredi <= 5 ? 'text-danger' : ''}`}>{m.plan === 'KURUMSAL' ? '∞' : m.aiKredi}</td>
                  <td className={`${TD} font-mono`}>{aktifMap.get(m.id) ?? 0}</td>
                  <td className={`${TD} font-mono`}>{m._count.kullanicilar}</td>
                  <td className={`${TD} font-mono text-[12px]`}>{ai ? `${ai._count._all} çağrı · $${Number(ai._sum.maliyetUsd ?? 0).toFixed(2)}` : '—'}</td>
                  <td className={TD}><KrediEkleForm musteriId={m.id} ad={m.ad} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* demo kayıtları */}
      <div className={`${KART} mt-6 overflow-x-auto p-0`}>
        <div className="border-b border-border px-5 py-3.5 text-[14px] font-bold">Demo / Satış Kayıtları</div>
        {demolar.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-muted-foreground">Henüz demo kaydı yok — landing formu doldurulunca burada görünür.</div>
        ) : (
          <table className="w-full min-w-[760px]">
            <thead><tr className="border-b border-border-subtle">
              <th className={TH}>Tarih</th><th className={TH}>Ad</th><th className={TH}>İletişim</th><th className={TH}>Büro</th><th className={TH}>Mesaj</th><th className={TH}>Durum</th>
            </tr></thead>
            <tbody>
              {demolar.map((d) => (
                <tr key={d.id} className="border-b border-border-subtle last:border-0">
                  <td className={`${TD} font-mono text-[11.5px] text-muted-foreground`}>{tarihKisa(d.createdAt)}</td>
                  <td className={`${TD} font-semibold`}>{d.ad}</td>
                  <td className={TD}><div className="text-[12.5px]">{d.eposta}</div>{d.telefon && <div className="font-mono text-[12px] text-muted-foreground">{d.telefon}</div>}</td>
                  <td className={TD}>{d.buroAd ?? '—'}</td>
                  <td className={`${TD} max-w-[220px] truncate text-[12px] text-muted-foreground`} title={d.mesaj ?? ''}>{d.mesaj ?? '—'}</td>
                  <td className={TD}><DemoDurum id={d.id} durum={d.durum} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* son AI kullanımları */}
      <div className={`${KART} mt-6 overflow-x-auto p-0`}>
        <div className="border-b border-border px-5 py-3.5 text-[14px] font-bold">Son AI Çağrıları</div>
        <table className="w-full min-w-[720px]">
          <thead><tr className="border-b border-border-subtle">
            <th className={TH}>Zaman</th><th className={TH}>Hesap</th><th className={TH}>Yüzey</th><th className={TH}>Model</th><th className={TH}>Token (g/ç)</th><th className={TH}>Maliyet</th><th className={TH}>Kredi</th>
          </tr></thead>
          <tbody>
            {sonKullanim.map((k) => (
              <tr key={k.id} className={`border-b border-border-subtle last:border-0 ${k.hata ? 'opacity-60' : ''}`}>
                <td className={`${TD} font-mono text-[11.5px] text-muted-foreground`}>{tarihKisa(k.createdAt)}</td>
                <td className={TD}>{k.musteri?.ad ?? '—'}</td>
                <td className={`${TD} font-mono text-[12px]`}>{k.yuzey}{k.hata && ' · HATA'}</td>
                <td className={`${TD} font-mono text-[11.5px] text-muted-foreground`}>{k.model.includes('haiku') ? 'haiku' : 'sonnet'}</td>
                <td className={`${TD} font-mono text-[12px]`}>{k.girisToken.toLocaleString('tr-TR')} / {k.cikisToken.toLocaleString('tr-TR')}</td>
                <td className={`${TD} font-mono text-[12px]`}>${Number(k.maliyetUsd).toFixed(4)}</td>
                <td className={`${TD} font-mono text-[12px]`}>{k.krediBedeli > 0 ? `−${k.krediBedeli}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
