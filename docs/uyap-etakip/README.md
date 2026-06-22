# UYAP e-Takip XML — rücu icra takibi açma

Rücu dosyalarından **UYAP-uyumlu toplu takip XML**'i üretip Avukat Portalına aktararak icra takibi açma modülü.
Resmî, belgelenmiş yol (DTD'li); 7 Haziran 2021'den beri ülke geneli. Üretici: [`lib/konsrucu/uyap-etakip/`](../../lib/konsrucu/uyap-etakip/).

## Kaynak dosyalar (bu klasör)
UYAP'ın public paketinden alındı: uyap.gov.tr/e-takip-tanitimi-ve-programlari → `rayp.adalet.gov.tr/.../etakip-0603202627-...rar` (06.03.2026).
- **`exchange.dtd`** — resmî şema (sürüm 1.2). Üreticinin uyduğu yapı.
- **`KodluBilgilerData.xml`** — kod tabloları (mahiyet, faiz tipi, rol, alacak kalem, adres türü, faiz oran takvimi).
- **`28_48_takip_talebi.sablon.xml`** — basılan takip talebi dilekçesinin form şablonu (veri değil).

## Akış
1. Program dosya(lar)dan XML üretir (daire başına bir XML — import İl/Adliye sorduğu için).
2. UYAP Avukat Portal → **İcra Takibi → "Takip Açılış-XML"** → XML yükle → İl/Adliye seç → **"İcra Takibi Başlat"**.
3. **Tamamlanmayan Dosyalarım** → **e-imza (toplu mümkün) + harç** → takip açılır, esas no verilir.
   - e-imza ve harç **her zaman kullanıcıda/manuel** — XML imzalamaz/ödemez. (= "harçta dur" güvenlik duruşu.)

## konsrucu → XML eşlemesi (exchange.dtd)
- Ray Sigorta → `taraf > kurum` (`mersisNo`, `vergiNo`, `harcDurumu`) + `rolTur` rolID=21 (ALACAKLI) + `iban`
- Borçlu → `taraf > kisiTumBilgileri` (`tcKimlikNo`, `adi`, `soyadi`) + `rolTur` rolID=22 (BORÇLU) — **adres yok → MERNİS**
- Vekil → `VekilKisi > vekil` (`baroNo`, `tbbNo`)
- Asıl alacak (rucuTutari) → `digerAlacak > alacakKalemi` kod=3 (Diğer Asıl Alacağı)
- Faiz → `alacakKalemi > faiz` (`baslangicTarihi`, `faizTipKod`; yasal → FAIZT00002 "Adi Kanuni Faiz")
- Açıklama → `dosya@aciklama48e9`; hukukDosyaNo → `dosya@dosyaBelirleyicisi` (geri eşleştirme)

## Adres = MERNİS
Borçlu için yalnız **TC** verilir; adres boş bırakılır. UYAP/icra dairesi tebligatı ADNKS/MERNİS (yerleşim yeri)
adresine yapar. Elimizde güvenilir açık adres varsa `adresTuru=ADRTR00001` ile eklenebilir.

## ⚠ Pilotta doğrulanacak (kodlar.ts · TAKIP_PRESET)
exchange.dtd bu enum'ları etiketsiz tanımlıyor; ilk gerçek yüklemede UYAP doğrulamasıyla kesinleşecek:
- `dosyaTipi` (tek #REQUIRED alan) — şu an `"0"`
- `takipYolu` (0..5), `takipSekli` (0..6) — şu an `"0"`
- `mahiyetKodu` — rücu için `1407` "Diğer - Örnek 7" (alternatif `1307` "Belgesiz - Örnek 7")
- Alacak kaleminde borçluya `ref` gerekip gerekmediği (müteselsil) — pilotta görülecek
