/**
 * KonsRücü — DAVA PANOSU · app/(app)/davalar/page.tsx
 * Aktif müvekkilin bütün davaları tek tabloda (06 2(j)): mahkeme, esas, evre, sonraki duruşma, açık süre, son gelişme,
 * durum güveni. Süzgeçler: teyitsiz, 30 gün içinde süre, 60 gündür sessiz, karşı taraf davası. Sıra: en yakın süre
 * (onaysız önde). Ray raporu (30 sütun) S30'da eklenir. Tenant kapsamlı, auth zorunlu.
 */
import Link from 'next/link'
import { Scale } from 'lucide-react'
import { ctx } from '@/lib/konsrucu/db'
import { davaPanosu } from '@/lib/konsrucu/dava/veri'
import { panoSirala, panoSuz, type PanoSuzgec } from '@/lib/konsrucu/dava/pano'
import { DavaPanosuTablo } from '@/components/dava/dava-panosu'

type SP = { s?: string }
const SUZGECLER: { anahtar: PanoSuzgec; etiket: string }[] = [
  { anahtar: 'teyitsiz', etiket: 'Teyitsiz' },
  { anahtar: 'sure30', etiket: '30 gün içinde süre' },
  { anahtar: 'sessiz60', etiket: '60 gündür sessiz' },
  { anahtar: 'karsi', etiket: 'Karşı taraf' },
]

export default async function DavalarPage({ searchParams }: { searchParams: SP }) {
  const { aktifMusteriId } = await ctx()
  if (!aktifMusteriId) {
    return (
      <div className="mx-auto max-w-[1500px] px-7 py-6">
        <h1 className="font-display text-[30px] font-extrabold tracking-[-0.035em]">Dava Panosu</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">Üst menüden bir müvekkil seçin.</p>
      </div>
    )
  }
  const suzgec = SUZGECLER.some((x) => x.anahtar === searchParams.s) ? (searchParams.s as PanoSuzgec) : null
  const hepsi = await davaPanosu(aktifMusteriId)
  // pano.ts Date bekler; UI satırı ISO taşır → süzgeç/sıralama için geri çevir
  const tarihli = hepsi.map((s) => ({ ...s, sonraki: s.sonraki ? new Date(s.sonraki) : null, sonGelisme: s.sonGelisme ? new Date(s.sonGelisme) : null }))
  const gorunen = panoSirala(panoSuz(tarihli, suzgec)).map((s) => ({ ...s, sonraki: s.sonraki?.toISOString() ?? null, sonGelisme: s.sonGelisme?.toISOString() ?? null }))
  const acikDava = hepsi.filter((s) => !s.davaAcilmadi).length
  const say = (k: PanoSuzgec) => panoSuz(tarihli, k).length

  return (
    <div className="mx-auto max-w-[1500px] px-7 py-6">
      <div className="mb-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Dava sonrası · bütün davalar</div>
        <h1 className="font-display mt-1.5 text-[30px] font-extrabold tracking-[-0.035em]">Dava Panosu</h1>
        <p className="mt-1.5 max-w-[64ch] text-sm text-muted-foreground">{acikDava} dava · davası açılmamış {hepsi.length - acikDava} İİK 67 kaydı. "Teyitsiz" satırlar geri doldurma ya da Excel önerisidir: UYAP'la karşılaştırıp dosyada teyit edin.</p>
      </div>
      <nav aria-label="Süzgeçler" className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/davalar" className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${!suzgec ? 'border-kr bg-kr-soft text-kr-ink' : 'border-border bg-surface hover:border-kr/40'}`}>Hepsi · {hepsi.length}</Link>
        {SUZGECLER.map((x) => (
          <Link key={x.anahtar} href={`/davalar?s=${x.anahtar}`} className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${suzgec === x.anahtar ? 'border-kr bg-kr-soft text-kr-ink' : 'border-border bg-surface hover:border-kr/40'}`}>{x.etiket} · {say(x.anahtar)}</Link>
        ))}
      </nav>
      {gorunen.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-surface-muted/40 px-7 py-14 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-surface-muted text-muted-foreground"><Scale className="h-7 w-7" /></div>
          <div className="font-display text-lg font-bold">{suzgec ? 'Süzgece uyan dava yok' : 'Henüz dava kaydı yok'}</div>
          <p className="mx-auto mt-1.5 max-w-[54ch] text-[13px] text-muted-foreground">Dava açılınca dosya ekranından (Excel önerisi, eklenti ya da elle kayıt) girilir ve burada görünür.</p>
        </div>
      ) : (
        <DavaPanosuTablo satirlar={gorunen} />
      )}
    </div>
  )
}
