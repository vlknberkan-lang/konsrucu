# 07 — İzleme: UYAP Eşleştirme & Köprü (2 ekran)

> Akıllı Giriş **takip-aç bloğunu** üretir; kullanıcı bu bloğu **UYAP'ta elle** girip icra takibini açar.
> Bu modül iki ekranla programı canlı UYAP dosyasına ve **UYAP Chrome eklentisine** bağlar.
> Zemin: [`00-mimari-ve-yol-haritasi.md`](00-mimari-ve-yol-haritasi.md). (Sıradan önce, eklenti entegrasyonu öncelikli olduğu için yazıldı.)

**Eşleşme anahtarı:** `icraDosyaNo` + `icraDairesi (birim)` — programdaki Dosya ↔ canlı UYAP icra dosyası bu çiftle bağlanır.

---

## Ekran 1 — "Takip Açıldı" (Eşleştirme)

**Amaç:** UYAP'ta açtığın takibin numarasını Dosya'ya yazıp ikisini **eşleştirmek**. Bundan sonra eklenti bu dosyayı tanıyıp izleyebilir.

**Tetik:** Dosya `TAKİBE_HAZIR`. Kullanıcı takip-aç bloğunu kopyalayıp UYAP'ta takibi açtı → UYAP bir **icra dosya no** verdi.

```
┌─ 159013 · TUNAY UYSAL ─────────────────── Durum: TAKİBE HAZIR → TAKİP AÇILDI ─┐
│  UYAP'ta takibi açtınız mı? Aldığınız bilgileri girin, dosyayı eşleştirelim.   │
│                                                                               │
│  İcra Dairesi    🟨  [ Gaziosmanpaşa İcra Dairesi      ]  (yetkili icradan ön-dolu) │
│  İcra Dosya No   🟨  [ 2026 / 32147 ]                                          │
│  Açılış Tarihi   🟨  [ 14.06.2026 ]                                            │
│                                                                               │
│  ⓘ Tebliğ/PTT barkod, tahsilat, bakiye → otomatik (Ekran 2 · eklenti senkronu)│
│                                          [ ✓ Takip Açıldı & Eşleştir ]         │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Yazar:** `RucuDosyasi.icraDosyaNo`, `icraDairesi`, `takipTarihi`; **durum → `TAKIP_ACILDI`**.
- Sadece bu 3 alan elle; gerisi (tebliğ, tahsilat, itiraz) eklentiden gelir — **iki kez veri girme yok**.
- Eşleştirme yapılmadan dosya izlemeye girmez (eklenti neyi sorgulayacağını bilemez).

---

## Ekran 2 — "UYAP Senkron" (Köprü / Eklenti)

**Amaç:** UYAP'a girişli **Chrome eklentisinin** çektiği canlı veriyi programa taşımak ve `icraDosyaNo` ile eşleştirmek. (Eklenti: `Rucu_Takip\uyap-eklenti`, MV3 "Oto Sorgula" — UYAP iç API replay; bkz memory `uyap-dosya-durum-kontrol`.)

**Bağlantı:** Eklenti → program **API** (`POST /api/uyap/sync`, paylaşılan secret ile imzalı). Program açık takip dosyalarının `icraDosyaNo + birim` listesini verir; eklenti UYAP'tan çekip geri yazar.

```
┌─ UYAP Senkron ──────────────────────────── Son senkron: 14.06 10:42 · ⟳ Yenile ┐
│  Eşleşen: 9/9   ·   Eşleşmeyen: 0   ·   Eklenti: ● bağlı (M.Burak K. · UYAP)   │
├──────────────────────────────────────────────────────────────────────────────┤
│  DOSYA       DURUM        TEBLİĞ       İTİRAZ   TAHSİLAT    BAKİYE      ⚑       │
│  2026/32147  🟢 Açık      12.06 ✓      Yok      0,00        30.000,00          │
│  2025/39428  ⚫ Kapalı     —            —        30.000,00   0,00       haricen │
│  2026/19449  🟢 Açık      bekliyor ⏳   —        0,00        14.869,06   ⚠ tebliğ│
├──────────────────────────────────────────────────────────────────────────────┤
│  ⚑ Eşleşmeyen: program'da icra no var, UYAP'ta bulunamadı → kontrol et         │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Eklentinin çektiği** (memory'den): durum (açık/kapalı), asıl alacak, işlemiş faiz, tahsilat/reddiyat, bakiye, vekalet, harç, evrak listesi (tebliğ/son işlem tarihi).
- **Yazar:** her senkronda `TakipOlayi` kaydı (DURUM/TAHSİLAT/TEBLİG/İTİRAZ + ham JSON) + `RucuDosyasi.durum` güncelle (ör. TEBLİĞ_EDİLDİ, KESİNLEŞTİ, TAHSİL, KAPANDI).
- **Eşleşmeyenler işaretli:** program'da icra no var ama UYAP'ta yok (yanlış no / kapanmış) ya da tersi → kullanıcı düzeltir.
- **İzolasyon + güvenlik:** sadece aktif müşterinin dosyaları; API shared-secret/imza (eski eklenti Vercel sync deseni mevcut).

---

## Akış (özet)

```
Akıllı Giriş → takip-aç bloğu → [UYAP'ta ELLE aç] → Ekran 1: icra no gir & eşleştir (TAKIP_ACILDI)
   → Ekran 2: eklenti senkronu (TakipOlayi + durum) → uyarılar (tebliğ/itiraz süresi/zamanaşımı)
```

## Açık Kararlar
- [ ] Eşleştirme yarı-otomatik mi? (Eklenti açık takipleri tarayıp "şu numarayı şu dosyaya bağlayalım mı?" önerebilir.)
- [ ] Senkron tetiği: eklentiden manuel "Oto Sorgula" mı, programdan zamanlı mı (Vercel Cron + eklenti tarayıcıda açıkken)?
- [ ] Eklenti ↔ API kimlik: paylaşılan secret mi, kullanıcı oturum token'ı mı?
- [ ] PTT barkod/tebliğ tarihi mazbatadan (PDF+OCR) mı, evrak listesinden mi (memory: barkod yalnız mazbata içinde)?
