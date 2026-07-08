/**
 * KonsRücü — Gizlilik Politikası (PUBLIC) · app/gizlilik/page.tsx
 * Chrome Web Store yayını + KVKK için zorunlu, oturumsuz erişilebilir sayfa.
 * (middleware.ts'te /gizlilik public rota olarak işaretli.) Metin sabittir; auth/ctx KULLANMAZ.
 */
export const dynamic = 'force-static'

export const metadata = {
  title: 'Gizlilik Politikası · Rücu Takip UYAP Senkron Eklentisi',
  description: 'Rücu Takip UYAP Senkron Chrome eklentisinin veri işleme ve gizlilik politikası (KVKK).',
}

const GUNCELLEME = '8 Temmuz 2026'

function Madde({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-[17px] font-bold tracking-[-0.01em] text-slate-900">{baslik}</h2>
      <div className="mt-2 space-y-2 text-[14.5px] leading-[1.65] text-slate-600">{children}</div>
    </section>
  )
}

export default function GizlilikPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-800">
      <div className="mx-auto max-w-[760px] rounded-2xl border border-slate-200 bg-white px-7 py-9 shadow-sm sm:px-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">Rücu Takip · UYAP Senkron Eklentisi</div>
        <h1 className="mt-2 text-[28px] font-extrabold tracking-[-0.03em] text-slate-900">Gizlilik Politikası</h1>
        <p className="mt-1.5 text-[13px] text-slate-500">Son güncelleme: {GUNCELLEME}</p>

        <p className="mt-6 text-[14.5px] leading-[1.65] text-slate-600">
          Bu politika, <b>Rücu Takip — UYAP Senkron</b> Chrome eklentisinin hangi verilere eriştiğini, bunları
          nasıl ve nereye işlediğini açıklar. Eklenti, bir hukuk bürosunun <b>yetkili olduğu</b> sigorta rücu / icra
          takip dosyalarını yönetmek için geliştirilmiş <b>iç kullanıma yönelik</b> bir araçtır.
        </p>

        <Madde baslik="1. Veri sorumlusu">
          <p>
            Veri sorumlusu, eklentiyi kullanan yetkili hukuk bürosudur (Küçükislamoğlu Hukuk Bürosu — K/Partners).
            Sorularınız için: <b>vberkanbiyikli@gmail.com</b>.
          </p>
        </Madde>

        <Madde baslik="2. Eklentinin eriştiği veriler">
          <p>
            Eklenti YALNIZCA kullanıcının kendi giriş yaptığı <b>UYAP Avukat Portalı</b> oturumunda görüntülenen icra
            dosyası verilerine erişir: dosya durumu ve safahatı, finansal bilgiler (asıl alacak, faiz, tahsilat, bakiye,
            masraf/harç kalemleri), taraf bilgileri (borçlu/alacaklı ad-unvan ve gerektiğinde TCKN/VKN) ve dosyaya ekli
            evrak. Bu veriler kullanıcının halihazırda yetkili olduğu dosyalara aittir.
          </p>
          <p>
            Eklenti; UYAP giriş bilgilerinizi, şifrenizi veya e-imza/mobil imza kimlik bilgilerinizi <b>görmez, saklamaz
            ve iletmez</b>. Oturum tamamen sizin tarayıcınızdaki UYAP girişinizdir.
          </p>
        </Madde>

        <Madde baslik="3. Verilerin nereye gönderildiği">
          <p>
            Okunan dosya verileri YALNIZCA büronun kendi Rücu Takip programına (<b>https://konsrucu.vercel.app</b>)
            şifreli (HTTPS) bağlantı üzerinden ve büroya özel bir <b>senkron anahtarı</b> (Bearer) ile iletilir. Veriler
            <b> hiçbir üçüncü tarafa satılmaz, kiralanmaz, reklam/analitik amacıyla paylaşılmaz</b> ve bu iki alan adı
            (uyap.gov.tr ve konsrucu.vercel.app) dışında herhangi bir sunucuya gönderilmez.
          </p>
        </Madde>

        <Madde baslik="4. Yerel olarak saklanan bilgi">
          <p>
            Eklenti, tarayıcınızın yerel deposunda (<span className="font-mono text-[13px]">chrome.storage</span>)
            yalnızca program adresini ve senkron anahtar(lar)ını tutar. Dosya içerikleri eklentide kalıcı olarak
            saklanmaz; okunur ve programa iletilir.
          </p>
        </Madde>

        <Madde baslik="5. Salt-okuma ilkesi">
          <p>
            Eklenti UYAP üzerinde varsayılan olarak <b>salt-okuma</b> çalışır; hiçbir işlem oluşturmaz. Tek istisna,
            kullanıcının (avukatın) ekranda <b>açıkça onayladığı</b> icra takibi açma (tevzi) işlemidir. Bu işlem yalnızca
            avukatın bilinçli onayıyla ve tek seferlik olarak gerçekleşir.
          </p>
        </Madde>

        <Madde baslik="6. İzinlerin gerekçesi">
          <ul className="list-disc space-y-1 pl-5">
            <li><b>storage</b> — program adresi ve senkron anahtarını saklamak.</li>
            <li><b>alarms</b> — açık UYAP sekmesi varken periyodik (30 dk) senkronu tetiklemek.</li>
            <li><b>downloads</b> — tevzi sonrası dosyanın dayanak paketini (.zip) programdan indirmek.</li>
            <li><b>uyap.gov.tr / konsrucu.vercel.app erişimi</b> — yalnızca UYAP portalını okumak ve veriyi programa iletmek.</li>
          </ul>
        </Madde>

        <Madde baslik="7. KVKK / veri güvenliği">
          <p>
            Kişisel veriler 6698 sayılı KVKK kapsamında, yalnızca hukuki takip amacıyla ve veri sorumlusu büronun
            yükümlülükleri çerçevesinde işlenir. Erişim yetkilendirilmiş kullanıcılarla sınırlıdır; aktarım şifrelidir.
          </p>
        </Madde>

        <Madde baslik="8. Değişiklikler">
          <p>
            Bu politika güncellenebilir; güncel sürüm bu sayfada yayımlanır ve üstteki tarih güncellenir.
          </p>
        </Madde>

        <p className="mt-9 border-t border-slate-100 pt-5 text-[12.5px] text-slate-400">
          Bu eklenti resmî bir UYAP/T.C. Adalet Bakanlığı ürünü değildir; bağımsız bir büro içi otomasyon aracıdır.
        </p>
      </div>
    </main>
  )
}
