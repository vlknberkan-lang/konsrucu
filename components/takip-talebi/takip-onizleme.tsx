/**
 * KonsRücü — Takip talebi önizlemesi (S21; 06 §2(c) "TAKİP TALEBİ ÖNİZLEMESİ (tevzide dondurulur)").
 * Kopilot özetiyle KALEM KALEM aynı olmalı (D4 ölçütü): tutarlar ve faiz cümlesi aynı saf hesaptan gelir
 * (lib/konsrucu/senkron/takip-talebi.ts). Kimlik numarası gösterilmez; borçlu yalnız ad ve tür.
 *
 * Props: gorunum (TakipTalebiGorunumu — takipTalebiGetir'den)
 */
import type { TakipTalebiGorunumu } from '@/lib/konsrucu/senkron/takip-talebi-db'
import { FAIZ_BASLANGIC_ETIKET, FAIZ_TURU_ETIKET, type FaizBaslangicTuru, type FaizTuru } from '@/lib/konsrucu/senkron/takip-talebi'
import { gunTR, tl } from './bicim'

function Satir({ etiket, children, mono = false, sag = false }: { etiket: string; children: React.ReactNode; mono?: boolean; sag?: boolean }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 border-b border-border-subtle py-1.5 last:border-0">
      <dt className="text-[12.5px] font-medium text-muted-foreground">{etiket}</dt>
      <dd className={`text-[13.5px] text-foreground ${mono ? 'font-mono' : ''} ${sag ? 'text-right' : ''}`}>{children}</dd>
    </div>
  )
}

export function TakipOnizleme({ gorunum }: { gorunum: TakipTalebiGorunumu }) {
  const g = gorunum
  const f = g.faiz
  const oran = f.faizOraniMetni ? (f.faizOraniMetni.toLocaleLowerCase('tr').includes('değişen') ? 'değişen oranlarda' : `yıllık ${f.faizOraniMetni}`) : null
  return (
    <section aria-label="Takip talebi önizlemesi" className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-[15px] font-bold text-foreground">Takip talebi önizlemesi</h3>
        <span className="text-[12px] text-muted-foreground">
          {g.takipTalebi ? `Sürüm ${g.takipTalebi.surum}${g.takipTalebi.dondurulduAt ? ` · tevzide donduruldu (${gunTR(g.takipTalebi.dondurulduAt)})` : ' · taslak'}` : 'Henüz kayıt yok'}
        </span>
      </div>
      <dl className="mt-2">
        <Satir etiket="Alacaklı">{g.onizleme.alacakli ?? <span className="text-danger">Şirket Bilgileri&apos;nde alacaklı ünvanı yok</span>}</Satir>
        <Satir etiket="Borçlular">
          {g.onizleme.borclular.length ? g.onizleme.borclular.map((b, i) => <span key={i} className="block">{b.ad} <span className="text-muted-foreground">({b.tur})</span></span>) : <span className="text-danger">Borçlu yok</span>}
        </Satir>
        <Satir etiket="Asıl alacak" mono sag>{tl(g.alacak.anapara)}</Satir>
        <Satir etiket="İşlemiş faiz" mono sag>
          {g.alacak.islemisFaiz != null ? `${tl(g.alacak.islemisFaiz)}  ${gunTR(g.alacak.faizBaslangic)} → ${gunTR(g.alacak.faizBitis)}` : <span className="font-sans text-danger">{g.alacak.uyari ?? 'hesaplanamadı'}</span>}
        </Satir>
        <Satir etiket="Toplam" mono sag>{tl(g.alacak.toplam)}</Satir>
        <Satir etiket="Faiz türü">{f.faizTuru ? FAIZ_TURU_ETIKET[f.faizTuru as FaizTuru] ?? f.faizTuru : <span className="text-warning">seçilmedi (varsayılan yok)</span>}{oran ? ` · ${oran}` : ''}</Satir>
        <Satir etiket="Başlangıç">{f.faizBaslangicTuru ? `${FAIZ_BASLANGIC_ETIKET[f.faizBaslangicTuru as FaizBaslangicTuru] ?? f.faizBaslangicTuru}${f.faizBaslangicTuru === 'TEK_TARIH' ? `: ${gunTR(f.faizBaslangic)}` : ''}` : <span className="text-warning">seçilmedi</span>}</Satir>
        <Satir etiket="Talep">{g.talepMetni ?? <span className="text-warning">Faiz seçimi tamamlanınca kurulur</span>}</Satir>
        <Satir etiket="Yol / örnek">{g.onizleme.yolOrnek}</Satir>
        <Satir etiket="Yetkili adliye">{g.onizleme.adliye ?? <span className="text-warning">kaza yerinden çözülemedi</span>} <span className="text-[12px] text-muted-foreground">(teyit gerekli)</span></Satir>
      </dl>
      {g.onizleme.aciklama && (
        <details className="mt-2 text-[12.5px] text-muted-foreground">
          <summary className="cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Takip açıklaması</summary>
          <p className="mt-1 whitespace-pre-line text-foreground">{g.onizleme.aciklama}</p>
        </details>
      )}
    </section>
  )
}
