/**
 * KonsRücü — Chrome Eklentisi · app/(app)/eklenti/page.tsx
 * "Rücu Takip — UYAP Senkron" eklentisini indir + kur (paketlenmemiş yükle) + kullan.
 * Chrome, web sayfasından sessiz kurulum YAPMAZ → indir + 2 adımda yükle akışı.
 */
import Link from 'next/link'
import { Download, Puzzle, ShieldCheck, Info, FolderOpen, Settings2, MousePointerClick, RefreshCw } from 'lucide-react'
import { Kopyala } from '@/components/akilli-giris/kopyala'

const ZIP = '/uyap-eklenti-v0.6.1.zip'
const SURUM = '0.6.1'

function Adim({ n, baslik, children, icon: Icon }: { n: number; baslik: string; children: React.ReactNode; icon: React.ElementType }) {
  return (
    <li className="flex gap-3.5">
      <span className="font-mono grid h-8 w-8 shrink-0 place-items-center rounded-full border border-kr/30 bg-kr-soft text-[13px] font-bold text-kr-ink">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-1.5 text-[13.5px] font-bold text-foreground"><Icon className="h-4 w-4 text-kr" /> {baslik}</div>
        <div className="mt-1 text-[12.5px] leading-[1.55] text-muted-foreground">{children}</div>
      </div>
    </li>
  )
}

export default function EklentiPage() {
  return (
    <div className="mx-auto max-w-[880px] px-7 py-6">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Araçlar · UYAP Senkron</div>
      <h1 className="font-display mt-1.5 flex items-center gap-2.5 text-[30px] font-extrabold tracking-[-0.035em]">
        <Puzzle className="h-7 w-7 text-kr" /> Chrome Eklentisi
        <span className="font-mono rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">v{SURUM}</span>
      </h1>
      <p className="mt-2 max-w-[64ch] text-sm text-muted-foreground">
        <b>Rücu Takip — UYAP Senkron</b>, UYAP Avukat Portalında <b>açık oturumda</b> rücu icra ve dava (Tüketici Mahkemesi)
        dosyalarını sorgular; durum, finansal (alacak/faiz/bakiye), taraf ve evrak listesini okur, evrak PDF'lerini indirir.
        <b className="text-foreground"> Sadece okur — işlem göndermez, dosya detayına/safahatına girmez → harç çıkmaz.</b>
      </p>

      {/* indir + Chrome uyarısı */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <a href={ZIP} download className="inline-flex items-center gap-2.5 rounded-[12px] bg-kr px-5 py-3 text-[14.5px] font-semibold text-kr-foreground shadow-[0_2px_10px_hsl(var(--kr)/0.35)] transition hover:bg-kr/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kr/50">
            <Download className="h-[18px] w-[18px]" /> Eklentiyi indir (.zip)
          </a>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-foreground">uyap-eklenti-v{SURUM}.zip · ~30 KB</div>
            <div className="text-[12px] text-muted-foreground">İndirdikten sonra aşağıdaki 4 adımı bir kez uygula.</div>
          </div>
        </div>
        <div className="flex items-start gap-2.5 border-t border-border-subtle bg-warning-soft/40 p-[12px_18px] text-[12.5px] text-[hsl(var(--warning-fg))]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Chrome, güvenlik gereği eklentileri bir web sayfasından <b>tek tıkla otomatik kuramaz</b>. Bu yüzden eklenti <b>indirilir</b> ve aşağıdaki gibi <b>“Paketlenmemiş yükle”</b> ile eklenir (tek seferlik, ~1 dakika).</span>
        </div>
      </div>

      {/* kurulum adımları */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-4">
          <Settings2 className="h-4 w-4 text-kr" /><h2 className="font-display text-[15px] font-bold">Kurulum (tek seferlik)</h2>
        </div>
        <ol className="flex flex-col gap-5 p-5">
          <Adim n={1} baslik="Zip'i çıkar" icon={FolderOpen}>
            İndirdiğin <span className="font-mono">uyap-eklenti-v{SURUM}.zip</span>'e sağ tık → <b>Tümünü ayıkla</b>. İçinden bir <span className="font-mono">uyap-eklenti</span> klasörü çıkar.
            <b className="text-foreground"> Bu klasörü silme/taşıma</b> — Chrome eklentiyi buradan çalıştırır.
          </Adim>
          <Adim n={2} baslik="Eklentiler sayfasını aç" icon={Puzzle}>
            Chrome'da yeni sekmede şu adresi aç:
            <span className="mt-1.5 flex items-center gap-2">
              <code className="rounded-[7px] border border-border bg-surface-muted px-2 py-1 font-mono text-[12px] text-foreground">chrome://extensions</code>
              <Kopyala metin="chrome://extensions" etiket="Adresi kopyala" />
            </span>
            <span className="mt-1 block text-[11.5px]">(Adres çubuğuna yapıştırıp Enter — güvenlik gereği bu bağlantı tıklanabilir değil.)</span>
          </Adim>
          <Adim n={3} baslik="Geliştirici modunu aç" icon={Settings2}>
            Sağ üstteki <b>Geliştirici modu</b> anahtarını <b>Aç</b>.
          </Adim>
          <Adim n={4} baslik="Paketlenmemiş yükle" icon={MousePointerClick}>
            <b>Paketlenmemiş öğe yükle</b> → 1. adımda çıkardığın <span className="font-mono">uyap-eklenti</span> klasörünü seç.
            Araç çubuğunda <b>⚖ Rücu Tara</b> görünür; UYAP'a e-imzayla girince sağ altta panel açılır.
          </Adim>
        </ol>
        <div className="flex items-start gap-2.5 border-t border-border-subtle bg-surface-muted/40 p-[12px_18px] text-[12px] text-muted-foreground">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
          <span><b>Güncelleme:</b> yeni sürüm çıkınca bu sayfadan tekrar indir, klasörün üzerine çıkar ve <span className="font-mono">chrome://extensions</span>'ta eklentideki <b>↻ yenile</b>'ye bas.</span>
        </div>
      </div>

      {/* kullanım */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-4">
          <MousePointerClick className="h-4 w-4 text-kr" /><h2 className="font-display text-[15px] font-bold">Nasıl kullanılır</h2>
        </div>
        <ol className="flex flex-col gap-3 p-5 text-[13px] text-foreground">
          <li className="flex gap-2.5"><span className="font-mono text-kr-ink">1.</span> <span><b>UYAP Avukat Portalı</b>na e-imza ile gir (herhangi bir sayfa açık olabilir).</span></li>
          <li className="flex gap-2.5"><span className="font-mono text-kr-ink">2.</span> <span>Sağ alttaki <b>⚖ Rücu Tara</b> panelini aç → <b>▶ Oto Sorgula</b> (dosyaları sırayla, insan hızında sorgular).</span></li>
          <li className="flex gap-2.5"><span className="font-mono text-kr-ink">3.</span> <span>Her dosya için durum (🟢 açık / 🔴 kapalı), alacak/faiz/bakiye ve evrak listesi derlenir; PDF'ler <span className="font-mono">İndirilenler\rucu-evrak\</span> altına iner.</span></li>
          <li className="flex gap-2.5"><span className="font-mono text-kr-ink">4.</span> <span><b>⬇ JSON</b> ya da <b>📋 Kopyala</b> ile sonucu Rücu Takip'e taşı. Yedek yöntem: dosyayı elle <b>Sorgula</b> → <b>➕ Tara &amp; Biriktir</b>.</span></li>
        </ol>
        <div className="flex items-start gap-2.5 border-t border-border-subtle bg-success-soft/40 p-[12px_18px] text-[12px] text-success">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span><b>Güvenli:</b> eklenti yalnızca UYAP (uyap.gov.tr) sayfalarında, senin oturumunla <b>okuma</b> yapar; hiçbir işlem göndermez, dosya detayına girmez (harç çıkmaz) ve veriyi tarayıcının dışına aktarmaz.</span>
        </div>
      </div>

      {/* program senkronu */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center gap-2 border-b border-border-subtle px-5 py-4">
          <RefreshCw className="h-4 w-4 text-kr" /><h2 className="font-display text-[15px] font-bold">Programla senkron (v0.6.0 · otomatik)</h2>
        </div>
        <ol className="flex flex-col gap-3 p-5 text-[13px] text-foreground">
          <li className="flex gap-2.5"><span className="font-mono text-kr-ink">1.</span> <span><Link href="/ayarlar" className="font-semibold text-kr-ink hover:underline">Şirket Bilgileri → UYAP Eklenti Senkron Anahtarı</Link>'ndan <b>anahtar üret</b> ve kopyala.</span></li>
          <li className="flex gap-2.5"><span className="font-mono text-kr-ink">2.</span> <span>Eklenti panelinde <b>⚙ Program Ayarı</b> → program adresini ve anahtarı yapıştır (bir kez).</span></li>
          <li className="flex gap-2.5"><span className="font-mono text-kr-ink">3.</span> <span><b>🎯 Programdan Hedef</b> → takibi açık (icra no'lu) dosyalar hedef listene gelir. <b>▶ İcra Sorgula</b> ile tara.</span></li>
          <li className="flex gap-2.5"><span className="font-mono text-kr-ink">4.</span> <span><b>⇅ Program'a Senkronla</b> → durum (açık/kapalı), finansal bilgi, <b>olaylar</b> (tebliğ/itiraz/haciz/tahsilat) ve <b>evrak PDF'leri</b> icra no ile eşleşen dosyaya yazılır.</span></li>
        </ol>
        <div className="flex items-start gap-2.5 border-t border-border-subtle bg-success-soft/40 p-[12px_18px] text-[12px] text-success">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" />
          <span><b>Tam otomatik:</b> <b>⚙ Program Ayarı</b>'nı bir kez yaptıktan sonra, tarayıcı açık + UYAP girişliyken eklenti <b>~30 dk'da bir ve her UYAP açılışında</b> kendi tarar ve durumu/olayları/evrakı programa yazar — başka tıklama gerekmez.</span>
        </div>
        <div className="flex items-start gap-2.5 border-t border-border-subtle bg-surface-muted/40 p-[12px_18px] text-[12px] text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Eşleştirme <b>icra dosya no</b> ile yapılır — programda “Takip Açıldı” ile girdiğin numara, UYAP'taki esas no ile aynı olmalı. Evrak ve olaylar çift-dedup'lıdır (aynısı iki kez yazılmaz).</span>
        </div>
      </div>
    </div>
  )
}
