/**
 * KonsRücü — Akıllı Giriş (Gelen Kutusu) · app/(app)/akilli-giris/page.tsx
 * Şimdilik kabuğun çalıştığını gösteren ince yer tutucu.
 * Sıradaki adım: ingest dropzone + işleme animasyonu + gruplanmış rücu kayıtları (kart/tablo/timeline).
 */

export default function AkilliGirisPage({ searchParams }: { searchParams: { yukle?: string } }) {
  // searchParams.yukle === '1' → ingest panelini açık başlat ("Yeni dosya yükle"den gelindi)
  return (
    <div className="mx-auto max-w-[1500px] px-7 py-6">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Akıllı Giriş · Oku · Çıkar · Triyaj</div>
      <h1 className="font-display mt-1.5 text-[30px] font-extrabold tracking-[-0.035em]">Gelen Kutusu</h1>
      <p className="mt-1.5 max-w-[60ch] text-sm text-muted-foreground">
        Ham evrak yığınını atın; sistem gruplar, alanları çıkarır ve dosyanın <b>yolunu belirler</b> — klasik icra mı, idari mi.
      </p>

      <div className="mt-6 grid place-items-center rounded-[18px] border-2 border-dashed border-border bg-surface-muted/50 px-7 py-16 text-center">
        <div className="font-display text-lg font-bold">Kabuk hazır — içerik buraya gelecek</div>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {searchParams?.yukle === '1' ? 'Yeni dosya yükle akışı tetiklendi.' : 'Ingest dropzone + kayıt listesi prototipten taşınacak.'}
        </p>
      </div>
    </div>
  )
}
