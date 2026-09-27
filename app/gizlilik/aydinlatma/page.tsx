/**
 * KonsRücü — Uygulama aydınlatma metni (PUBLIC, TASLAK) · app/gizlilik/aydinlatma/page.tsx
 *
 * S02 (F19; B14; açık karar 1d): kayıt formundaki "Aydınlatma metni" bağlantısı buraya gelir (eskiden
 * Chrome eklentisinin gizlilik politikasına gidiyordu). HUKUKİ METİN BURADA UYDURULMAZ: KVKK m.10
 * kapsamındaki aydınlatma metnini Yelda (avukat) yazar/onaylar. Sayfa yalnız yer tutucu ve koddan
 * doğrulanabilen teknik olguları taşır; her olgu "teyit gerekli" notuyla.
 * /gizlilik öneki middleware'de oturumsuz erişilebilir olduğu için sayfa bu yolun altındadır.
 */
export const dynamic = 'force-static'

export const metadata = {
  title: 'Aydınlatma Metni (taslak) · KonsLaw',
  description: 'KonsLaw uygulamasının kişisel verilerin işlenmesine ilişkin aydınlatma metni — taslak, avukat onayı bekleniyor.',
}

function Madde({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-[17px] font-bold tracking-[-0.01em] text-slate-900">{baslik}</h2>
      <div className="mt-2 space-y-2 text-[14.5px] leading-[1.65] text-slate-600">{children}</div>
    </section>
  )
}

function YerTutucu({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-[13.5px] text-amber-900">
      {children}
    </p>
  )
}

export default function AydinlatmaPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-800">
      <div className="mx-auto max-w-[760px] rounded-2xl border border-slate-200 bg-white px-7 py-9 shadow-sm sm:px-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">KonsLaw · Uygulama</div>
        <h1 className="mt-2 text-[28px] font-extrabold tracking-[-0.03em] text-slate-900">Kişisel Verilerin İşlenmesine İlişkin Aydınlatma Metni</h1>
        <p className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-[12.5px] font-bold text-amber-900">
          TASLAK — metin Yelda tarafından yazılacak ve onaylanacak
        </p>

        <p className="mt-6 text-[14.5px] leading-[1.65] text-slate-600">
          Bu sayfa, 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamındaki aydınlatma metninin yeridir. Hukuki
          metin henüz yazılmadı; aşağıdaki başlıklar yer tutucudur. Teknik olgular programın bugünkü yapılandırmasından
          alınmıştır ve avukat teyidi gerektirir.
        </p>

        <Madde baslik="1. Veri sorumlusu">
          <YerTutucu>Yelda tarafından yazılacak: veri sorumlusunun kimliği ve iletişim bilgileri.</YerTutucu>
        </Madde>

        <Madde baslik="2. İşlenen kişisel veriler ve işleme amaçları">
          <YerTutucu>Yelda tarafından yazılacak: veri kategorileri, işleme amaçları ve hukuki sebepler.</YerTutucu>
        </Madde>

        <Madde baslik="3. Aktarım ve alıcılar">
          <YerTutucu>Yelda tarafından yazılacak: alıcı grupları, yurt dışına aktarım ve dayanağı.</YerTutucu>
          <p className="text-[13px] text-slate-500">
            Teknik olgu (teyit gerekli): veritabanı ve evrak deposu Supabase üzerindedir (bölge: Frankfurt, eu-central-1);
            uygulama Vercel üzerinde çalışır (fonksiyon bölgesi teyit edilecek). Yapay zekâ özellikleri (Anthropic) KVKK
            düzenlemesi tamamlanana kadar canlıda kapalıdır.
          </p>
        </Madde>

        <Madde baslik="4. Saklama süresi">
          <YerTutucu>Yelda tarafından yazılacak: saklama ve imha süreleri.</YerTutucu>
        </Madde>

        <Madde baslik="5. İlgili kişinin hakları">
          <YerTutucu>Yelda tarafından yazılacak: KVKK m.11 kapsamındaki haklar ve başvuru yolu.</YerTutucu>
        </Madde>

        <p className="mt-9 border-t border-slate-100 pt-5 text-[12.5px] text-slate-400">
          Chrome eklentisinin gizlilik politikası ayrı bir belgedir:{' '}
          <a href="/gizlilik" className="underline underline-offset-2 hover:text-slate-600">KonsLaw Chrome eklentisi gizlilik politikası</a>.
        </p>
      </div>
    </main>
  )
}
