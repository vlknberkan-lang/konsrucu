# KonsRücü — Büyüme Planı: Hukuki Süreç Haritası + Otomasyon Yol Haritası

*Tarih: 4 Temmuz 2026 · Bağlam: haftalık giriş 20-25 dosyaya çıktı (~1.200/yıl). Amaç: hiçbir dosya ve hiçbir yasal süre kaçmasın.*

---

## 1. Fotoğraf (4 Tem 2026, canlı veriler)

| | Ray Sigorta | Zurich |
|---|---|---|
| Açık dosya | ~315 | 26 |
| HAVUZDA / İNCELENİYOR | 33 / 21 | 1 / 20 |
| TAKİP AÇILDI / TEBLİĞ EDİLDİ / KESİNLEŞTİ | 80 / 134 / 46 | 5 / – / – |
| Hugo'dan çekilmeyi bekleyen | **322** | 26 |
| 30+ gündür tebliğsiz takip | **69** | 0 |
| ZA geçmiş / ZA boş (takip öncesi) | 1 / 4 | 0 / 0 |

Genel: açık görev 1 · açık önemli olay 18 · sonuçlanmamış geçmiş toplantı 13.

**İki alarm:**
1. 134 TEBLİĞ + 46 KESİNLEŞTİ dosya var ama açık görev sadece 1 → süre görevleri yalnız *yeni* olaylarda üretiliyor; mevcut stoka **backfill yapılmadı**.
2. 69 dosyada takip açılalı 30+ gün olmuş, tebliğ olayı yok → **tebligat akıbetini hiçbir radar izlemiyor** (bila tebliğ mi, hiç çıkmadı mı, UYAP'a düşmedi mi belirsiz).

---

## 2. Hukuki süreç haritası — dosyanın hayatı ve YASAL SÜRELER

> ⚠️ Süre kuralları genel kuraldır; dosya özelinde (tebligat şekli, borçlu türü, branş) **avukat teyidi esastır**. Kodlanmış süreler aşağıda "sistemde" sütununda işaretli.

| # | Evre | Yasal süre | Dayanak | Kaçarsa ne olur | Sistemde |
|---|---|---|---|---|---|
| 1 | Hasar ödendi → rücu dosyası | Zamanaşımı: trafik 2 yıl (uzamış ceza z.a. mümkün), genel haksız fiil 2/10 yıl | KTK 109, TBK 72 | **Alacak tamamen düşer** | ✅ radar: pano + günlük mail + `?za=` filtresi |
| 2 | Takip açıldı → ödeme emri tebliği | Yasal sabit süre yok ama tebliğ olmadan HİÇBİR süre işlemez | — | Dosya sonsuz uykuya dalar | ❌ **P0-2** |
| 3 | Tebliğ → borçlunun itirazı | 7 gün | İİK 62 | İtiraz yoksa takip kesinleşir (bizim lehimize) — pencereyi İZLEyip kesinleştirmek gerek | ✅ otomatik görev *(yalnız yeni tebliğler — stok: **P0-1**)* |
| 4 | İtiraz geldi → itirazın iptali davası / arabuluculuk | **1 YIL** (itirazın tebliğinden) | **İİK 67/1** | Dava hakkı düşer, takip ölür | ❌ **P1-4** |
| 5 | Kesinleşme → haciz isteme | **1 YIL** (ödeme emri tebliğinden) | **İİK 78** | Takip düşer (yenileme = yeniden harç) | ✅ otomatik görev *(yalnız yeniler — stok: **P0-1**)* |
| 6 | Haciz → satış isteme | **1 YIL** (haciz tarihinden) | **İİK 106/110** | Haciz kalkar | ❌ **P1-5** |
| 7 | Tahsilat / taksit planı | sözleşmesel | — | temerrüt | ✅ taksit hatırlatma cronu |
| 8 | Arabuluculuk anlaşmazlığı → dava (Tüketici/Asliye) | branşa göre | — | — | ✅ dilekçe üretici; süre takibi elle |

---

## 3. "Dosya nereden kaçar?" — vektör analizi

| Vektör | Durum | Çözüm |
|---|---|---|
| Excel hiç import edilmedi | 🟡 insan ritmi | Pazartesi ritüeli (bkz. §6) |
| Mevcut dosyada Excel'de düzeltme vardı | ✅ fark raporu (onaylı uygula) | — |
| Yanlış şirkete import | ✅ format-tenant kapısı | — |
| HAVUZDA unutuldu | 🟡 şu an 0 ama radar yok | **P2-7** evre SLA |
| Hugo'dan çekilmedi | ❌ **348 dosya birikti**, görünmez | **P0-3** sayaç + seferberlik |
| Zamanaşımı boş/yaklaşan/geçmiş | ✅ üçü de radarda | P1-6 ile öneri kolaylığı |
| Takip açıldı, tebligat akıbeti belirsiz | ❌ **69 dosya** | **P0-2** |
| İtiraz penceresi / kesinleştirme | ✅ (yeni) / ❌ (stok) | **P0-1** backfill |
| İtirazın iptali 1 yıl | ❌ | **P1-4** |
| Haciz isteme 1 yıl | ✅ (yeni) / ❌ (stok) | **P0-1** |
| Satış isteme 1 yıl | ❌ | **P1-5** |
| Uzun süre hiç dokunulmamış açık dosya | 🟡 şu an 0 | **P2-7** |
| Eklenti sustu (UYAP akışı kesildi) | ✅ sağlık bekçisi + Ayarlar kartı | — |
| Görev verildi, unutuldu | ✅ mail + cron + rozet | ritim: görevsiz erteleme YOK |
| Toplantı yapıldı, sonucu işlenmedi | ✅ rozet (13 açık var!) | Cuma ritüeli |

---

## 4. Otomasyon yol haritası

### P0 — Kanamayı durdur (≈1 gün geliştirme)
1. **Süre görevi BACKFILL**: stok 134 TEBLİĞ + 46 KESİNLEŞTİ dosyaya İİK 62/78 görevlerini geriye dönük üret (tebliğ tarihleri TakipOlayi'de mevcut). Tek seferlik, idempotent script; süresi zaten geçmiş olanlar "GECİKMİŞ — kontrol et" etiketiyle açılır.
2. **Tebligat akıbeti radarı**: takip tarihinden itibaren 21+ gün geçmiş ve TEBLIG olayı olmayan dosyalar → Bugün panosuna kart + haftalık rapora kırmızı bölüm.
3. **Çekim kuyruğu sayacı**: "Hugo'dan çekilmeyi bekleyen N dosya · en eskisi X gün" → pano + rapor.

### P1 — Hukuki süreleri tamamla (≈2-3 gün; süre kuralları YELDA TEYİDİNDEN sonra)
4. **İİK 67 görevi**: ITIRAZ olayı → "İtirazın iptali/arabuluculuk son günü: [itiraz+1 yıl]" görevi (10. ayda hatırlatma) + mevcut itirazlı dosyalara backfill.
5. **İİK 106 görevi**: HACIZ olayı → "Satış isteme son günü: [haciz+1 yıl]" görevi.
6. **ZA doldurma yardımcısı**: zamanaşımı boş dosyada "hasar tarihi + branş kuralı → önerilen tarih" tek tık (elle onaylı; otomatik yazmaz).

### P2 — Akış disiplini (≈2 gün)
7. **Evre SLA + yaş rozeti**: her dosyada "bu evrede X gündür"; eşikler: HAVUZDA ≤7g · İNCELENİYOR ≤14g · TAKİBE HAZIR ≤7g · TAKİP AÇILDI (tebliğsiz) ≤21g · açık dosya dokunulmadan ≤30g.
8. **Pazartesi "Riskli Dosyalar" maili**: §3'teki TÜM açık vektörleri tek mailde toplayan haftalık tarama cronu — haftaya tek bakışta başlanır.

### P3 — Sonrası (ayrı karar)
9. Hugo çekiminin yarı-otomasyonu (çekim kuyruğu + toplu işaretleme; Hugo tarafı manuel kalıyor).
10. Kapasite panosu: haftalık giriş/çıkış/evre-geçiş grafiği — darboğaz nerede görünür olur.

---

## 5. Kapasite matematiği (neden şart?)

- 22 dosya/hafta × 48 hafta ≈ **1.050 yeni dosya/yıl**. Portföy 12 ayda ~3 katına çıkar.
- Ekip 3 kişi × 5 gün: dosya başına *ilk işlem* bütçesi ≈ **30-40 dk** (çekme+inceleme+AI teyit+takip hazırlık). Bu ancak: AI çıkarımı + hazırlık paketi + otomatik süre görevleri standart akışsa yetişir.
- 322'lik çekim birikimi: günde 20 çekimle ~3,5 hafta. **Ayrı seferberlik planlanmalı** (kim, günde kaç, hangi öncelik sırası — öneri: zamanaşımı en yakın olandan başla, `?za=yakin` + çekilmemiş filtresi).

## 6. Haftalık operasyon ritmi (insan tarafı — Yelda ile karara bağlanacak)

| Ne zaman | Ne | Neden |
|---|---|---|
| **Pazartesi sabah** | Yeni Excel import → fark raporunu onayla → riskli dosyalar mailini gez (P2-8 sonrası) | Hafta tek fotoğrafla başlar |
| **Her sabah 5 dk** | /bugun panosu: kırmızı şerit + görevler + bugünkü etkinlikler | Günlük radar |
| **Her gün** | Çekim kuyruğundan sabit sayıda dosya (öneri: kişi başı 5) | Birikim erimeden büyümez |
| **Cuma** | Sonuçlanmamış toplantıları kapat, süresi geçen görevleri temizle/yeniden tarihle | Haftayı borçsuz kapat |
| **Her zaman** | Ertelenen her iş = TAKİP GÖREVİ (sorumlu + son tarih ile) | Sistem yalnız kayıtlıyı hatırlatır |

## 7. Yelda'dan teyit bekleyen hukuki varsayımlar

1. İİK 62 itiraz penceresi 7 gün — tüm dosya tiplerinde mi (örn. kambiyo değil, ilamsız genel haciz varsayıldı)?
2. İİK 67 itirazın iptali süresi: itirazın **bize tebliğinden** mi itiraz tarihinden mi hesaplansın? (sistemde itiraz olay tarihi var)
3. İİK 78/106 birer yıl — istisna senaryosu var mı (yenileme yapılan dosyalar)?
4. ZMSS'de dava öncesi zorunlu arabuluculuk akışının süre etkisi.
5. Zamanaşımı boş dosyalarda öneri formülü: hasar tarihi + 2 yıl (trafik) doğru varsayım mı, uzamış ceza zamanaşımı istisnası nasıl işaretlensin?

---

*Bu belge canlıdır — kararlaştırılan maddeler işaretlenip commit'lenir.*
