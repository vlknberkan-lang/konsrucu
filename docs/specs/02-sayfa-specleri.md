# Spec 02 — Sayfa Specleri (Aşama + Takvim)

> Zemin: [01-asama-veri-modeli.md](01-asama-veri-modeli.md). Konvansiyon: Server Components + Server Actions,
> tenant-kapsamlı, Türkçe arayüz, repodaki design system (components/ui, components/konsrucu/ui), tr-TR biçim,
> erişilebilirlik (focus, klavye, reduced-motion), tüm state'ler (yükleniyor/boş/hata).

---

## P0 — Komuta Merkezi ("Yelda'nın Masası")
**Rota:** `/` veya `/dashboard`. **Amaç:** asistanın yüzü — Yelda sabah açar, ne yapacağını görür.
- **Karar bekleyenler:** aksiyonlu bildirimler (itiraz→"Arabuluculuk başlat", tebliğ→"Süreyi onayla") — her kart tek tık aksiyon + dosyaya git.
- **Bugün & bu hafta:** toplantı + duruşma kronolojik; saat · dosya · tür rozeti.
- **Yaklaşan süreler:** itiraz (7g) · zamanaşımı · arabuluculuk son tarih — renk: geçti(danger)/yakın(warning)/ileride(steel).
- **Yeni önemli gelişmeler:** senkrondan düşen (tebliğ ulaştı, haciz, tahsilat) — okundu/okunmadı.
- **Aşama dağılımı:** İcra / Arabuluculuk / Dava / Tahsil sayıları → tıkla → P5 filtreli.
- **Durumlar:** tüm bloklar boş → "Bugün temiz, bekleyen yok"; yükleniyor → iskelet kartlar.
- **Düzen:** sol geniş (karar + gelişmeler), sağ rail (bugün/süreler/dağılım). Design system kartları (shadow-card, kr aksanı).

## P1 — Dosya Detay · "Süreç Şeridi" + Birleşik Zaman Çizelgesi
**Rota:** mevcut `/akilli-giris/[id]` içine yeni bölüm. **Amaç:** dosyanın nerede olduğunu tek bakışta görmek + sıradaki adımı atmak.

- **Süreç şeridi (yatay):** İcra → Arabuluculuk → Dava → Karar/Tahsil. Her adım: ikon + etiket + numara (icra/arabuluculuk/esas no) + tarih + sonuç rozeti. Güncel aşama vurgulu; geçmiş aşamalar soluk; gelecek adımlar kesik çizgi.
- **Aşama kartı (güncel):** numara, birim, başlangıç, (varsa) sonuç; hızlı aksiyonlar:
  - Arabuluculuk aşamasında → **"Toplantı planla"**, **"Sonuç gir"** (anlaşıldı/anlaşılmadı), anlaşılmadıysa **"Dava'ya taşı"**.
  - Dava aşamasında → **"Duruşma ekle"**, **"Karar gir"**.
- **Birleşik zaman çizelgesi (dikey):** Asama + Etkinlik + TakipOlayi + Not, tarihe göre harmanlı; her satır ikon+başlık+tarih; tıklanınca ilgili kayıt.
- **Durumlar:** aşama yok → "Henüz süreç başlamadı" (icra takibi açılınca başlar); yükleniyor → iskelet; hata → satır içi uyarı.

## P2 — Arabuluculuk Takvimi
**Rota:** `/takvim/arabuluculuk`. **Amaç:** tüm dosyalardaki arabuluculuk toplantılarını tek listede planla/izle.

- **Görünüm:** **ajanda listesi** (güne/haftaya gruplu) — birincil. Üstte hafta gezinme (◀ bu hafta ▶) + "Bugün". (Ay-grid görünümü faz-2.)
- **Satır:** tarih-saat · dosya no + borçlu · arabulucu · yer/online · sorumlu avukat · durum rozeti (Planlandı/Yapıldı/Ertelendi/İptal).
- **Filtre:** tarih aralığı · avukat · durum · arama (dosya/borçlu).
- **Aksiyon:** **"Toplantı planla"** (Etkinlik formu modal) · satırda düzenle/sonuç gir/ertele · dosyaya git.
- **Durumlar:** boş → "Bu aralıkta toplantı yok + planla"; geçmiş yapılmamış → "gecikmiş" işareti.

## P3 — Duruşma Takvimi
**Rota:** `/takvim/durusma`. **Amaç:** P2 ile aynı kalıp, `tur=DURUSMA`.
- **Satır:** tarih-saat · dosya/esas no + borçlu · mahkeme · salon/yer · sorumlu · durum.
- **Aksiyon:** "Duruşma ekle" · sonuç/erteleme (yeni duruşma tarihi → otomatik yeni Etkinlik önerisi).

## P4 — Ajanda / "Bu Hafta" (özet)
**Rota:** `/ajanda` (ya da `/dashboard`). **Amaç:** bugün+bu hafta yapılacaklar tek ekranda.
- **Bloklar:** Bugün · Bu hafta · Yaklaşan **süreler** (itiraz süresi, zamanaşımı yakın, arabuluculuk son tarih) — renk kodlu (geçti/yakın/ileride).
- **Sayımlar:** açık aşama dağılımı (kaç icra / arabuluculuk / dava) → tıklanınca ilgili listeye filtreli gider.
- **Aksiyon:** her satırdan dosyaya/etkinliğe.

## P5 — Dosyalar Listesi · Aşama sütunu + filtre
**Rota:** mevcut `/atanan-dosyalar` güncellenir (ya da yeni `/dosyalar`). **Amaç:** dosyaları **aşamaya göre** süzmek + listeden hızlı takvim/aksiyon.
- **Yeni sütun:** "Aşama" (İcra / Arabuluculuk / Dava …) + güncel numara.
- **Yeni filtre çipi:** Aşama (çoklu). Mevcut canlı arama korunur.
- **Satır hızlı aksiyon:** "Toplantı/duruşma planla" (uygun türde Etkinlik formu) → listeden çıkmadan takvime ekler.

## P6 — Arabuluculuk & Dava panelleri (Dosya Detay içinde)
**Yer:** `/akilli-giris/[id]` içinde, süreç şeridinden açılan bölüm/sekme (ayrı sayfa değil).
- **Arabuluculuk paneli:** başvuru no · arabulucu (ad/iletişim) · taraflar · toplantılar (mini liste + "planla") · sonuç (anlaşıldı/anlaşılmadı + tutar) · son tutanak.
- **Dava paneli:** mahkeme · esas no · dava türü · açılış · duruşmalar (mini liste + "ekle") · bilirkişi · karar · kesinleşme.

## P7 — Bildirim Merkezi
**Rota:** header'da çan ikonu → açılır panel + `/bildirimler` tam sayfa. **Amaç:** önemli her şey tek akışta.
- **Gruplar:** Karar bekleyen (aksiyonlu) · Bugün · Daha eski. Öncelik renk noktası (kritik/uyarı/bilgi).
- **Satır:** ikon (türe göre) · başlık · dosya · zaman · aksiyon butonu (varsa) · okundu işaretle.
- **Aksiyon:** "Arabuluculuk başlat" / "Toplantı planla" / "Süreyi onayla" → ilgili server action; çözülünce karttan düşer.
- **Durumlar:** boş → "Bekleyen bildirim yok"; okunmamış sayısı çan rozetinde.

## P8 — Tebligat & İtiraz Takibi (Dosya Detay içinde)
**Yer:** Dosya Detay · İcra aşaması kartı altında. **Amaç:** PTT tebliğ + 7 gün itiraz görünür.
- **Satır:** ödeme emri/tebligat · PTT barkod · muhatap · durum (Yolda/Teslim/İade) · teslim tarihi · **itiraz son tarihi (geri sayım)**.
- **Geri sayım rozeti:** "5 gün kaldı" (warning) / "bugün son" (danger) / "süre doldu → kesinleşme" (steel).
- **Aksiyon:** "PTT'den sorgula" (mock/gerçek) · teslim girince itiraz son tarihi otomatik.

## Arama Kartı (telefon hazır özeti)
**Yer:** Dosya Detay üstünde katlanır şerit / hızlı erişim. **Amaç:** arabulucu/karşı taraf arayınca 2 saniyede özet.
- Taraflar (alacaklı/borçlu) · tutar (asıl + işlemiş faiz + toplam) · kusur · güncel aşama + numara · son 3 olay · **sıradaki adım**.

---

## Ortak bileşen — Etkinlik Formu (modal)
Tek modal; P2/P3/P5/P6 hepsinde kullanılır. Alanlar: tür (bağlamdan ön-seçili) · başlık · tarih-saat (+ tüm gün) · yer/online · sorumlu avukat · hatırlatma · not. Kaydet → `etkinlikKaydet`. Klavye ile kapanır, focus-trap, reduced-motion.

## Navigasyon
- Rail/Sidebar'a: **Takvim** (alt: Arabuluculuk · Duruşma) ve **Ajanda**. Dosya bağlamlı aksiyonlar dosya detay + listede.

## Yapım sırası (öneri)
1. **Veri modeli** (Asama+Etkinlik, migration) → 2. **P1 Süreç şeridi** → 3. **Etkinlik formu** → 4. **P2 Arabuluculuk takvimi** → 5. **P3 Duruşma** → 6. **P5 liste aşama** → 7. **P4 ajanda** → 8. **P6 paneller**.
