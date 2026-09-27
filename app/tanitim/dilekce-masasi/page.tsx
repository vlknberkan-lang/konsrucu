import Link from 'next/link'
import { DilekceMasasi } from '@/components/dilekceler/dilekce-masasi'
import { dilekceSureleriniHazirla } from '@/lib/konsrucu/dilekce-sureler'
import type { MasaDetay } from '@/lib/konsrucu/dilekce-masa-types'

export const metadata = { title: 'Dilekçe masası · Etkileşimli prototip', robots: { index: false, follow: false } }

// Yalnız kurgusal veriler. Bu rota hiçbir müşteri kaydını veya dosyasını okumaz.
const dosya: MasaDetay = {
  id: 'ornek-dosya', no: '2026/248 E.', taraf: 'Örnek Sigorta A.Ş. / Örnek Davalı', mahkeme: 'Örnek Asliye Hukuk Mahkemesi',
  ozet: 'Kurgusal örnek: dosyada dava dilekçesi, cevap dilekçesi ve bilirkişi raporu bulunuyor. Son rapordaki değerlendirmeler, önceki beyan ve belgelerle karşılaştırılacak. Avukat, hangi tespitlere hangi evrakla itiraz edeceğini belirleyip taslağı düzenleyecek.',
  yazabilir: true, taslakSayisi: 1, kullanicilar: [],
  belgeler: [
    { id: 'ornek-rapor', ad: 'Bilirkişi raporu — örnek.pdf', tarih: '2026-09-18T09:00:00+03:00', metinVar: true, acilabilir: true, uyap: true },
    { id: 'ornek-cevap', ad: 'Cevap dilekçesi — örnek.pdf', tarih: '2026-08-14T10:00:00+03:00', metinVar: true, acilabilir: true, uyap: true },
    { id: 'ornek-dava', ad: 'Dava dilekçesi — örnek.pdf', tarih: '2026-07-06T10:00:00+03:00', metinVar: true, acilabilir: true, uyap: true },
    { id: 'ornek-teblig', ad: 'Tebliğ mazbatası — örnek.pdf', tarih: '2026-09-19T10:00:00+03:00', metinVar: false, acilabilir: true, uyap: true },
  ],
  gecmis: [
    { id: 'g1', tarih: '2026-09-20T09:30:00+03:00', baslik: 'Avukat notu', metin: 'Bilirkişi raporunu önceki beyanlarla karşılaştır. İtiraz edilecek tespitleri dayanak evraklarıyla birlikte göster.', tarihEtiketi: 'Not tarihi' },
    { id: 'g2', tarih: '2026-09-18T09:00:00+03:00', baslik: 'Bilirkişi raporu dosyaya eklendi', metin: 'Rapor metni taslak hazırlığında kullanılabilir. Tebliğ tarihi ayrıca kontrol edilmeli.', tarihEtiketi: 'Evrak tarihi' },
    { id: 'g3', tarih: '2026-08-14T10:00:00+03:00', baslik: 'Cevap dilekçesi', metin: 'Karşı tarafın cevap dilekçesi dosya geçmişine eklendi.', tarihEtiketi: 'Evrak tarihi' },
    { id: 'g4', tarih: '2026-07-06T10:00:00+03:00', baslik: 'Dava dilekçesi', metin: 'Dava dilekçesi ve delil listesi dosya geçmişine eklendi.', tarihEtiketi: 'Evrak tarihi' },
  ],
  ciktilar: [{ id: 'ornek-taslak', durum: 'TASLAK', createdAt: '2026-09-21T09:00:00+03:00', icerik: 'ÖRNEK ASLİYE HUKUK MAHKEMESİNE\n\nDOSYA NO: 2026/248 E.\n\nKONU: Bilirkişi raporuna ilişkin beyan ve itirazlarımızdır.\n\nAÇIKLAMALAR\n\n1. Dosyaya sunulan bilirkişi raporuna ilişkin değerlendirmelerimiz aşağıda sunulmaktadır.\n\n2. Rapordaki ⟨itiraz edilen tespit⟩ ile dosyada bulunan ⟨dayanak evrak ve ilgili bölüm⟩ birlikte incelenmelidir. Bu bölüm, gerçek dosya verileriyle avukat tarafından tamamlanacaktır.\n\n3. ⟨Önceki dilekçede yer alan ilgili beyan ve bu rapora etkisi⟩.\n\nSONUÇ VE TALEP\n\n⟨Dosyaya uygun talep⟩ hakkında karar verilmesini saygıyla arz ve talep ederiz.\n\n⟨Tarih⟩\nDavacı vekili\n⟨Ad soyad⟩\n\nEKLER\n⟨Dayanak evrak listesi⟩\n\nBu metin, arayüzü denemek için hazırlanmış kurgusal bir örnektir.' }],
  sureler: dilekceSureleriniHazirla({
    uyapSenkronAt: '2026-09-21T08:45:00+03:00', uyapEslesme: 'OK',
    gorevler: [{ id: 'gorev1', baslik: 'Rapor itirazını gözden geçir', sonTarih: '2026-09-23T15:00:00+03:00', durum: 'ACIK', aciklama: 'Avukatın belirlediği çalışma tarihi. Hukuki son gün değildir.' }],
    etkinlikler: [{ id: 'etkinlik1', tur: 'DURUSMA', baslik: 'Duruşma hazırlığı', baslar: '2026-09-29T10:30:00+03:00', durum: 'PLANLANDI' }],
    onemliOlaylar: [{ id: 'olay1', baslik: 'Tebliğ tarihini ve uygulanacak süreyi doğrula', sonTarih: null, durum: 'ACIK', kaynakBelgeId: 'ornek-teblig' }],
  }, new Date('2026-09-21T10:00:00+03:00')),
}

export default function DilekceOnizlemePage() {
  return <main className="min-h-screen bg-background text-foreground">
    <header className="flex items-center justify-between border-b border-border bg-card px-5 py-4 lg:px-10"><span className="font-display text-xl font-extrabold tracking-brand-tight">KonsLaw <span className="ml-2 text-sm font-medium text-muted-foreground">/ Dilekçe odaklı çalışma</span></span><Link href="/dilekceler" className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Uygulamaya geç</Link></header>
    <DilekceMasasi dosyalar={[dosya]} secili={dosya} toplam={1} arama="" demo />
  </main>
}
