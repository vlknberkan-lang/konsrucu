/**
 * KonsRücü — Dilekçe iskeleti ve üslup kartı (Ayarlar) · app/(app)/ayarlar/dilekce-sablon/page.tsx
 *
 * S36 (06 §7.1): iskelet ve üslup kartı MÜVEKKİL bazındadır ve avukat onaylıdır. Bu sayfa yalnız aktif
 * müşterinin kayıtlarını gösterir/değiştirir (M7); başka müvekkilin iskeleti hiç görünmez, hiç yüklenmez.
 */
import { redirect } from 'next/navigation'
import { ctx } from '@/lib/konsrucu/db'
import { prisma } from '@/lib/prisma'
import { avukatRoluMu, dilekceV2Acik } from '@/lib/konsrucu/dilekce-v2/bayrak'
import { SablonAyarlari } from '@/components/dilekce-v2/sablon-ayarlari'

export const metadata = { title: 'Dilekçe iskeleti ve üslup · KonsLaw' }
export const dynamic = 'force-dynamic'

export default async function DilekceSablonAyarlariSayfasi() {
  const { dbUser, aktifMusteriId } = await ctx()
  if (!dbUser.aktif || !aktifMusteriId) redirect('/dashboard')
  if (!dilekceV2Acik(dbUser.rol)) redirect('/ayarlar')
  const musteri = await prisma.musteri.findFirst({ where: { id: aktifMusteriId, aktif: true }, select: { id: true, ad: true } })
  if (!musteri) redirect('/ayarlar')

  const [sablonlar, kurallar] = await Promise.all([
    prisma.dilekceSablon.findMany({
      where: { musteriId: musteri.id },
      orderBy: [{ kod: 'asc' }, { surum: 'desc' }],
      select: { id: true, kod: true, tur: true, surum: true, varyantJson: true, aktif: true, onayAt: true },
    }),
    prisma.uslupKurali.findMany({
      where: { musteriId: musteri.id, durum: { not: 'PASIF' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, kapsam: true, metin: true, ornek: true, durum: true },
    }),
  ])

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 lg:px-7">
      <div className="mb-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Dilekçe v2 · ayarlar</div>
        <h1 className="font-display mt-1.5 text-[26px] font-extrabold tracking-[-0.03em]">İskelet ve üslup kartı · {musteri.ad}</h1>
        <p className="mt-1.5 max-w-[70ch] text-sm text-muted-foreground">
          Bu iskelet ve üslup kuralları yalnız <strong>{musteri.ad}</strong> için geçerlidir; başka müvekkilde görünmez ve kullanılmaz.
          Onaylı bir iskelet yoksa dilekçe taslağı yine de kod içindeki varsayılan iskeletle üretilir.
        </p>
      </div>
      <SablonAyarlari
        sablonlar={sablonlar.map((s) => ({ ...s, onayAt: s.onayAt?.toISOString() ?? null }))}
        kurallar={kurallar}
        yazabilir={avukatRoluMu(dbUser.rol)}
      />
    </div>
  )
}
