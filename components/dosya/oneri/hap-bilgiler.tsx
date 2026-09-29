'use client'

/**
 * KonsRücü — "Hap bilgiler" kartı · components/dosya/oneri/hap-bilgiler.tsx
 *
 * 2026-09-29 (Berkan): bulgular tek tek onaylanmaz. Kural, Excel ve yapay zekânın bulduğu bilgiler burada özet
 * hâlinde durur; yanlış olan yerinde düzeltilir, iki değerli alanda biri seçilir. Hepsi doğruysa avukat en alttaki
 * TEK düğmeyle ("Hap bilgileri kontrol ettim") çelişkisiz bilgileri onaylar, işaretli borçluları teyit eder ve
 * dosyayı takibe hazır işaretler (app/(app)/dosya-islem/oneri-actions.ts · hapBilgileriOnaylaEylem).
 * Ödeme önerileri işaret kutusuyla gelir; kontrol isteyenler (tarihsiz kopya, KDV hariç tutar …) gerekçesiyle
 * işaretsiz gelir. Kaynak ve alıntı ayrıntısı Bulduklarımız'dadır (altta, kapalı).
 *
 * Veri: oneriPaneliYukle(dosyaId) → { hap, bulduklarimiz } (kişisel veri sunucuda maskelenmiş).
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Check, CheckCheck, Eye, Loader2, Pencil, ShieldCheck, X } from 'lucide-react'
import { Badge } from '@/components/konsrucu/ui'
import {
  alanDegeriniDuzeltEylem, hapBilgileriOnaylaEylem, oneriDegeriniGosterEylem, oneriOnaylaEylem, oneriReddetEylem,
} from '@/app/(app)/dosya-islem/oneri-actions'
import type { AlanSatiri, BulduklarimizVerisi, HapVerisi, OneriGorunum } from '@/lib/konsrucu/oneri/tipler'
import { tarihTR, saatTR } from '@/lib/konsrucu/format'
import { DuzeltFormu, KAYNAK_TON, MONO_TIPLER } from './oneri-satiri'
import { BolumBasligi, DUGME_IKINCIL, DUGME_ONAY, DUGME_RET, HataSatiri, useEylem } from './ortak'

const ROL_ETIKET: Record<string, string> = { RUHSAT_SAHIBI: 'Ruhsat sahibi / işleten', SURUCU: 'Sürücü', ISVEREN: 'İşveren', KAT_MALIKI: 'Kat maliki', YONETIM: 'Yönetim', DIGER: 'Diğer' }
const BIRINCIL =
  'inline-flex items-center gap-1.5 rounded-[10px] border border-kr/[0.25] bg-kr-soft px-3.5 py-2 text-[13px] font-semibold text-kr-ink transition hover:bg-kr-soft/70 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'

type Eylem = ReturnType<typeof useEylem>

/** Aynı değeri taşıyan öneriler tek satır (kaynakları yan yana). */
function degerGruplariGorunum(oneriler: readonly OneriGorunum[]): OneriGorunum[][] {
  const g = new Map<string, OneriGorunum[]>()
  for (const o of oneriler) g.set(o.deger, [...(g.get(o.deger) ?? []), o])
  return [...g.values()]
}

function Kaynaklar({ oneriler }: { oneriler: readonly OneriGorunum[] }) {
  const etiketler = [...new Map(oneriler.map((o) => [o.kaynakEtiketi, o.kaynakTuru])).entries()]
  return <>{etiketler.map(([e, t]) => <Badge key={e} tone={KAYNAK_TON[t] ?? 'steel'}>{e}</Badge>)}</>
}

type Acik = { degerler: Record<string, string>; ac: (id: string, deger: string) => void }

/** Maskeli değer (plaka) "Göster" ile açılır; açılış Aktivite'ye yazılır (oneriDegeriniGosterEylem). */
function Deger({ o, acik, e, dosyaId, mono }: { o: OneriGorunum; acik: Acik; e: Eylem; dosyaId: string; mono: string }) {
  const acilmis = acik.degerler[o.id]
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`text-[13px] font-semibold text-foreground ${mono}`}>{acilmis ?? o.deger}</span>
      {o.maskeli && acilmis === undefined && (
        <button
          type="button" disabled={e.bekliyor} aria-label="Değeri göster"
          onClick={() => e.calistir(`goster:${o.id}`, async () => {
            const r = await oneriDegeriniGosterEylem({ dosyaId, oneriId: o.id })
            if (r.ok) acik.ac(o.id, r.deger)
            return r
          })}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {e.buMu(`goster:${o.id}`) ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      )}
    </span>
  )
}

function AlanSatir({ satir, hap, acik, e }: { satir: AlanSatiri; hap: HapVerisi; acik: Acik; e: Eylem }) {
  const [duzelt, setDuzelt] = useState(false)
  const dosyaId = hap.dosyaId
  const mono = MONO_TIPLER.has(satir.tip) ? 'font-mono' : ''
  const celiski = !satir.onayli && hap.celiskiAlanlar.includes(satir.alan)
  const gruplar = degerGruplariGorunum(satir.oneriler)
  const yazabilir = satir.kritik ? hap.yetki.kararVerebilir : hap.yetki.duzenleyebilir
  const temel = satir.onayli ?? satir.oneriler[0]
  const kilit = satir.onayli?.id ?? null

  let icerik: React.ReactNode
  if (satir.karar) {
    icerik = satir.onayli
      ? <span className="text-[13px] font-semibold text-foreground">{satir.onayli.deger}</span>
      : <span className="text-[12.5px] text-danger">Seçilmedi · <a href="#yh-rucu-sebebi" className="font-semibold underline underline-offset-2">Seç</a></span>
  } else if (satir.onayli) {
    icerik = (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <Deger o={satir.onayli} acik={acik} e={e} dosyaId={dosyaId} mono={mono} />
        <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-success"><Check className="h-3 w-3" aria-hidden /> onaylı</span>
      </span>
    )
  } else if (celiski) {
    icerik = (
      <div className="space-y-1.5">
        <div className={`flex items-center gap-1 text-[11.5px] font-semibold ${satir.kritik ? 'text-danger' : 'text-warning'}`}>
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {satir.kritik ? 'Kaynaklar farklı; takipten önce doğru olanı seçin' : 'Kaynaklar farklı; beklemede, doğru olanı seçebilirsiniz'}
        </div>
        {gruplar.map((g) => (
          <div key={g[0].id} className="flex flex-wrap items-center gap-1.5">
            <Deger o={g[0]} acik={acik} e={e} dosyaId={dosyaId} mono={mono} />
            <Kaynaklar oneriler={g} />
            <button
              type="button" disabled={e.bekliyor || !yazabilir} className={DUGME_ONAY}
              onClick={() => e.calistir(`sec:${g[0].id}`, () => oneriOnaylaEylem({ dosyaId, oneriId: g[0].id, beklenenOnayliId: null }))}
            >
              {e.buMu(`sec:${g[0].id}`) ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />} Bunu seç
            </button>
          </div>
        ))}
      </div>
    )
  } else {
    icerik = (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <Deger o={satir.oneriler[0]} acik={acik} e={e} dosyaId={dosyaId} mono={mono} />
        <Kaynaklar oneriler={satir.oneriler} />
      </span>
    )
  }

  return (
    <li className="grid gap-x-4 gap-y-1 px-5 py-2.5 sm:grid-cols-[170px_1fr_auto] sm:items-start">
      <div className="pt-0.5 text-[12.5px] font-semibold text-muted-foreground">
        {satir.etiket}
        {satir.kritik && !satir.onayli && <span className="ml-1 text-[10.5px] font-normal text-warning">· kritik</span>}
      </div>
      <div className="min-w-0">
        {icerik}
        {duzelt && temel && (
          <DuzeltFormu
            satir={satir} o={temel} bekliyor={e.buMu(`duzelt:${satir.alan}`)}
            onVazgec={() => setDuzelt(false)}
            onKaydet={(deger) => e.calistir(`duzelt:${satir.alan}`, () => alanDegeriniDuzeltEylem({ dosyaId, alan: satir.alan, beklenenOnayliId: kilit, deger }), () => setDuzelt(false))}
          />
        )}
      </div>
      {!satir.karar && yazabilir && !duzelt && (
        <div className="flex gap-1.5 sm:justify-end">
          <button type="button" disabled={e.bekliyor} onClick={() => setDuzelt(true)} className={DUGME_IKINCIL}><Pencil className="h-3 w-3" aria-hidden /> Düzelt</button>
          {!satir.onayli && !celiski && (
            <button
              type="button" disabled={e.bekliyor} className={DUGME_RET} title="Bu bilgi yanlış; boş kalsın"
              onClick={() => e.calistir(`ret:${satir.alan}`, async () => {
                for (const o of satir.oneriler) {
                  const r = await oneriReddetEylem({ dosyaId, oneriId: o.id })
                  if (!r.ok) return r
                }
                return { ok: true }
              })}
            >
              {e.buMu(`ret:${satir.alan}`) ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" aria-hidden /> : <X className="h-3 w-3" aria-hidden />} Yanlış
            </button>
          )}
        </div>
      )}
    </li>
  )
}

export function HapBilgiler({ hap, bulgu, capa = 'yh-hap' }: { hap: HapVerisi; bulgu: BulduklarimizVerisi; capa?: string }) {
  const e = useEylem()
  const [acikDeger, setAcikDeger] = useState<Record<string, string>>({})
  const acik: Acik = { degerler: acikDeger, ac: (id, deger) => setAcikDeger((m) => ({ ...m, [id]: deger })) }
  const [bilgi, setBilgi] = useState<string | null>(null)

  const alanlar = bulgu.satirlar.filter((s) => s.tip !== 'ODEME')
  const odemeler = bulgu.satirlar.filter((s) => s.tip === 'ODEME')
  const onayliOdeme = odemeler.filter((s) => s.onayli)
  const bekleyenOdeme = odemeler.filter((s) => !s.onayli).flatMap((s) => s.oneriler.slice(0, 1))

  const [odemeSecili, setOdemeSecili] = useState<Record<string, boolean>>(() => Object.fromEntries(bekleyenOdeme.map((o) => [o.id, !hap.odemeSuphe[o.id]])))
  // kimlik numarası olmayan borçlu (ör. "… plakalı araç ruhsat sahibi/işleteni") takibe hazır sayılmaz: işaretsiz gelir
  const borcluVarsayilan = (b: HapVerisi['borclular'][number]) => b.teyit !== 'SUPHE' && !!b.kimlik
  const [borcluSecili, setBorcluSecili] = useState<Record<string, boolean>>(() => Object.fromEntries(hap.borclular.map((b) => [b.id, borcluVarsayilan(b)])))
  const secili = (m: Record<string, boolean>, id: string, varsayilan: boolean) => m[id] ?? varsayilan

  const bekleyenAlan = alanlar.filter((s) => !s.onayli && !s.karar && s.oneriler.length).length
  const teyitsiz = hap.borclular.filter((b) => b.teyit !== 'TEYIT_EDILDI').length
  const engeller = useMemo(() => {
    const m: string[] = []
    const kritik = bulgu.satirlar.filter((s) => s.kritik && !s.onayli && hap.celiskiAlanlar.includes(s.alan)).map((s) => s.etiket)
    if (kritik.length) m.push(`Önce doğru değeri seçin: ${kritik.join(', ')}.`)
    if (hap.eksikSecim.length) m.push(`Önce seçin: ${hap.eksikSecim.join(', ')}.`)
    if (!hap.borclular.length) m.push('Borçlu yok; Taraflar sekmesinden ekleyin.')
    return m
  }, [hap, bulgu])
  const beklemede = bulgu.satirlar.filter((s) => !s.kritik && !s.onayli && hap.celiskiAlanlar.includes(s.alan)).length
  const bekleyenToplam = bekleyenAlan + bekleyenOdeme.length + teyitsiz
  const baslik = hap.kontrol && !bekleyenToplam
    ? `Kontrol edildi${hap.kontrol.kim ? ` · ${hap.kontrol.kim}` : ''}${hap.kontrol.tarih ? ` · ${tarihTR(hap.kontrol.tarih)} ${saatTR(hap.kontrol.tarih)}` : ''}`
    : bekleyenToplam ? `${bekleyenToplam} bilgi kontrolünüzü bekliyor` : 'Hap bilgiler'

  function kontrolEt() {
    e.calistir('kontrol', async () => {
      const r = await hapBilgileriOnaylaEylem({
        dosyaId: hap.dosyaId,
        odemeHaric: bekleyenOdeme.filter((o) => !secili(odemeSecili, o.id, !hap.odemeSuphe[o.id])).map((o) => o.id),
        borcluHaric: hap.borclular.filter((b) => b.teyit !== 'TEYIT_EDILDI' && !secili(borcluSecili, b.id, borcluVarsayilan(b))).map((b) => b.id),
      })
      if (r.ok) setBilgi(`${r.onaylanan} bilgi onaylandı${r.reddedilen ? `, ${r.reddedilen} ödeme önerisi çıkarıldı` : ''}${r.teyit ? `, ${r.teyit} borçlu teyit edildi` : ''}. ${r.hesapIzi}. Dosya takibe hazır; takip talebi için faiz seçimini yapın.`)
      return r
    })
  }

  return (
    <section id={capa} aria-labelledby="hap-baslik" className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <BolumBasligi
        id="hap-baslik" kicker="Hap bilgiler" baslik={baslik}
        alt={<>Kural, Excel ve yapay zekânın bulduğu bilgiler. Yanlış olanı yerinde düzeltin; hepsi doğruysa en alttaki düğmeyle tek seferde onaylayın. Kaynak ve alıntılar aşağıda &ldquo;Tüm bulgular ve kaynakları&rdquo; bölümünde.</>}
      />

      <div className="border-b border-border-subtle px-5 py-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[12.5px] font-semibold text-muted-foreground">Borçlular</span>
          <Link href={`/dosya/${hap.dosyaId}?sekme=taraflar#taraflar-borclular`} className="text-[11.5px] font-semibold text-kr hover:underline">Borçluları düzenle</Link>
        </div>
        {hap.borclular.length ? (
          <ul className="space-y-1">
            {hap.borclular.map((b) => {
              const teyitli = b.teyit === 'TEYIT_EDILDI'
              const sec = teyitli || secili(borcluSecili, b.id, borcluVarsayilan(b))
              return (
                <li key={b.id}>
                  <label className="flex flex-wrap items-center gap-2 text-[13px]">
                    <input
                      type="checkbox" className="h-4 w-4 accent-[hsl(var(--kr))]" checked={sec} disabled={teyitli || !hap.yetki.kararVerebilir}
                      onChange={(ev) => setBorcluSecili((m) => ({ ...m, [b.id]: ev.target.checked }))}
                    />
                    <span className="font-semibold text-foreground">{b.adUnvan}</span>
                    {b.kimlik && <span className="font-mono text-[12px] text-muted-foreground">{b.kimlik}</span>}
                    <Badge tone="steel">{ROL_ETIKET[b.rol] ?? b.rol}</Badge>
                    {teyitli ? <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-success"><Check className="h-3 w-3" aria-hidden /> teyitli</span>
                      : b.teyit === 'SUPHE' ? <Badge tone="danger" dot>şüpheli</Badge> : null}
                    {!b.kimlik && !teyitli && <span className="text-[11.5px] text-warning">kimlik no yok; eklenince işaretleyin</span>}
                  </label>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">Borçlu bulunamadı. &ldquo;AI ile Çıkarım Yap&rdquo; ya da Taraflar sekmesinden ekleyin.</p>
        )}
      </div>

      <ul className="divide-y divide-border-subtle">
        {alanlar.map((s) => <AlanSatir key={s.alan} satir={s} hap={hap} acik={acik} e={e} />)}
        <li className="grid gap-x-4 px-5 py-2.5 sm:grid-cols-[170px_1fr_auto]">
          <div className="pt-0.5 text-[12.5px] font-semibold text-muted-foreground">Yetkili icra</div>
          <div>{hap.yetkiliIcra
            ? <span className="text-[13px] font-semibold text-foreground">{hap.yetkiliIcra}</span>
            : <span className="text-[12.5px] text-danger">Seçilmedi · <a href="#yh-yetkili-icra" className="font-semibold underline underline-offset-2">Seç</a></span>}
          </div>
        </li>
      </ul>

      {(onayliOdeme.length > 0 || bekleyenOdeme.length > 0) && (
        <div className="border-t border-border-subtle px-5 py-3">
          <div className="mb-1.5 text-[12.5px] font-semibold text-muted-foreground">Ödemeler</div>
          <ul className="space-y-1">
            {onayliOdeme.map((s) => (
              <li key={s.alan} className="flex items-center gap-2 font-mono text-[12.5px] text-foreground">
                <Check className="h-4 w-4 text-success" aria-hidden /> {s.onayli!.deger}
              </li>
            ))}
            {bekleyenOdeme.map((o) => {
              const neden = hap.odemeSuphe[o.id]
              return (
                <li key={o.id}>
                  <label className="flex flex-wrap items-center gap-2 text-[12.5px]">
                    <input
                      type="checkbox" className="h-4 w-4 accent-[hsl(var(--kr))]" disabled={!hap.yetki.kararVerebilir}
                      checked={secili(odemeSecili, o.id, !neden)} onChange={(ev) => setOdemeSecili((m) => ({ ...m, [o.id]: ev.target.checked }))}
                    />
                    <span className="font-mono font-semibold text-foreground">{o.deger}</span>
                    <Badge tone={KAYNAK_TON[o.kaynakTuru] ?? 'steel'}>{o.kaynakEtiketi}</Badge>
                    {o.belgeAdi && <span className="max-w-[220px] truncate text-[11px] text-muted-foreground">{o.belgeAdi}</span>}
                    {neden && <span className="text-[11.5px] font-semibold text-warning">kontrol edin: {neden}</span>}
                  </label>
                </li>
              )
            })}
          </ul>
          {bekleyenOdeme.length > 0 && <p className="mt-1.5 text-[11.5px] text-muted-foreground">İşaretli ödemeler dosyaya eklenir; işaretsizler öneriden çıkarılır.</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle bg-surface-muted/40 px-5 py-3.5">
        {hap.yetki.kararVerebilir ? (
          <button type="button" disabled={e.bekliyor || engeller.length > 0} onClick={kontrolEt} className={BIRINCIL}>
            {e.buMu('kontrol') ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : hap.kontrol && !bekleyenToplam ? <CheckCheck className="h-4 w-4" aria-hidden /> : <ShieldCheck className="h-4 w-4" aria-hidden />}
            Hap bilgileri kontrol ettim
          </button>
        ) : (
          <span className="text-[12px] text-muted-foreground">Son kontrolü avukat ya da yönetici yapar. Yanlış gördüğünüz bilgiyi düzeltebilirsiniz.</span>
        )}
        {engeller.length > 0
          ? <span className="text-[12px] font-medium text-danger">{engeller.join(' ')}</span>
          : hap.yetki.kararVerebilir && (
            <span className="text-[11.5px] text-muted-foreground">
              Çelişkisiz bilgiler onaylanır, işaretli borçlular teyit edilir, dosya takibe hazır olur.
              {beklemede > 0 && ` Kaynakları farklı ${beklemede} kritik olmayan alan onaylanmadan bekler; sonra seçebilirsiniz.`}
            </span>
          )}
      </div>

      {bilgi && !e.hata && <p role="status" className="border-t border-border-subtle px-5 py-2.5 text-[12.5px] text-foreground">{bilgi}</p>}
      <HataSatiri hata={e.hata} />
    </section>
  )
}
