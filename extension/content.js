/**
 * Rücu Takip — UYAP Senkron v1.0.0 · content.js (TAM YENİDEN YAZIM)
 *
 * ESKİDEN FARKI (v0.6.x → v1):
 *  1) KİMLİK = (İCRA DAİRESİ + ESAS NO) ÇİFTİ. Esas no tek başına kimlik DEĞİL — aynı esas no
 *     farklı dairelerde başka dosyadır ve aynı numaradan büroya birden çok dosya gelebilir.
 *     Sorgu birimId İLE yapılır; daire çözülemezse / dosya o dairede yoksa bu bir SONUÇTUR.
 *  2) BULUNAMAYAN DOSYA SESSİZ KALMAZ: her hedef için eşleşme sonucu (OK / DAIRE_EKSIK /
 *     DAIRE_COZULEMEDI / BULUNAMADI / BASKA_DAIRE / COKLU_BELIRSIZ / HATA) programa RAPORLANIR —
 *     programda "senkron dışı" dosya kalmaz, neden'i görünür.
 *  3) ÇOKLU EŞLEŞME: aynı (daire, esas) 1'den çok dosya dönerse taraf sorgusuyla ALACAKLISI
 *     tenant unvanı (Ray/Zurich — programdan gelir, hard-code YOK) olan seçilir; net kazanan
 *     yoksa COKLU_BELIRSIZ raporu düşer (aday listesiyle) → avukat elle karar verir.
 *  4) Program dosya kimliği (dosyaId) her gönderide taşınır → programda kesin eşleşme.
 *  5) Masraf toplayıcı MODÜLER: masrafTopla(dosyaId, rec) iskeleti hazır — kaynak ekran
 *     belirlenince (Berkan gösterecek) tek fonksiyon doldurulacak.
 *
 * UYAP uçları v0.6.7'den taşındı (deneme-yanılmayla kanıtlanmış):
 *   /avukat_mahkemeleri_sorgula.ajx · /search_phrase_detayli.ajx · /dosyaAyrintiBilgileri_brd.ajx
 *   /dosya_hesap_bilgileri.ajx · /dosya_taraf_bilgileri_brd.ajx · evrak/safahat uç aileleri
 *
 * YAZMA İSTİSNASI (v1.5.0, bilinçli karar): senkron/masraf/keşif SALT-OKUMA'dır; tek yazma işlemi
 * TAKİP AÇ KOPİLOTU'nun tevzisidir (/icra_takip_tevzi_islemleri.ajx) — o da yalnız avukatın özet
 * ekranını görüp "Gönder"e basması ve confirm onayıyla tetiklenir. Uçlar keşif kaydıyla kanıtlı
 * (2026-07-06); gövde önce /icra_harc_hesaplama_islemleri.ajx ile KURU PROVA edilir.
 */
(() => {
  "use strict";
  if (window.__rucuV1) return;
  window.__rucuV1 = true;

  // ═══════════════ yardımcılar ═══════════════
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tr = (s) => String(s == null ? "" : s).trim();
  const norm = (s) => tr(s).toLocaleLowerCase("tr").replace(/\s+/g, " ");
  const esc = (s) => tr(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ESAS_RE = /\b((?:19|20)\d{2})\s*\/\s*(\d{1,7})\b/;
  function extractEsas(text) { const m = tr(text).match(ESAS_RE); return m ? `${m[1]}/${m[2]}` : ""; }
  function fmtTL(n) { try { return Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " TL"; } catch (e) { return String(n); } }

  // UYAP tarih alanları her biçimde gelebilir (obje/epoch/dd.mm.yyyy/ISO) → ISO gün
  function detectDate(val) {
    if (val == null || val === "" || val === 0) return "";
    if (typeof val === "object") {
      if (val.date && typeof val.date === "object" && val.date.year)
        return `${val.date.year}-${String(val.date.month || 1).padStart(2, "0")}-${String(val.date.day || 1).padStart(2, "0")}`;
      if (typeof val.time === "number") { const d = new Date(val.time); if (!isNaN(d.getTime()) && d.getFullYear() > 2000 && d.getFullYear() < 2100) return d.toISOString().slice(0, 10); }
      return "";
    }
    if (typeof val === "number") { if (val > 978307200000 && val < 4102444800000) { const d = new Date(val); if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10); } return ""; }
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return "";
  }

  const RE_KAPALI = /(KAPA|ARŞİV|ARSIV|DÜŞ|DUS|HİTAM|HITAM|ZAMANAŞIM|ZAMANASIM|FERAGAT|İNFAZEN|INFAZEN|İPTAL|IPTAL)/;
  const RE_ACIK = /(DERDEST|AÇIK|ACIK|FAAL|DEVAM|İŞLEMDE|ISLEMDE)/;
  function durumTahmin(kod, raw) {
    const R = tr(raw).toLocaleUpperCase("tr-TR");
    if (RE_KAPALI.test(R)) return "KAPALI";
    if (RE_ACIK.test(R)) return "AÇIK";
    if (kod === 0 || kod === "0") return "AÇIK";
    if (kod === 1 || kod === "1") return "KAPALI";
    return "BELİRSİZ";
  }

  // ═══════════════ storage + program köprüsü ═══════════════
  const st = (keys) => new Promise((r) => chrome.storage.local.get(keys, (o) => r(o || {})));
  const stSet = (obj) => new Promise((r) => chrome.storage.local.set(obj, r));
  const sendBg = (msg) => new Promise((res) => { try { chrome.runtime.sendMessage(msg, (r) => res(r || { ok: false, error: "bg yanıtsız" })); } catch (e) { res({ ok: false, error: e.message }); } });

  // ═══════════════ UYAP API katmanı (salt-okuma) + ADAPTİF GAZ ═══════════════
  // Varsayılan tempo hızlı; UYAP 429/5xx dönerse tur boyunca 3x yavaşlar (nazik geri çekilme).
  let _gaz = 1;
  const uyu = (ms) => sleep(Math.round(ms * _gaz));
  async function apiPost(path, body) {
    const resp = await fetch(path, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json;charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      if (resp.status === 429 || resp.status >= 500) _gaz = 3; // sunucu yoruldu → yavaşla
      throw new Error(path.replace(/^\//, "").replace(".ajx", "") + " HTTP " + resp.status);
    }
    const txt = await resp.text();
    try { return JSON.parse(txt); } catch (e) { throw new Error("yanıt JSON değil (oturum düşmüş olabilir): " + txt.slice(0, 60)); }
  }

  // İcra daireleri listesi (yargiTuru=2 İcra, yargiBirimi=1101 İcra Dairesi; açık+kapalı birleşik) — 10 dk önbellek
  let _birimler = null, _birimlerAt = 0;
  async function birimlerYukle() {
    if (_birimler && Date.now() - _birimlerAt < 10 * 60000) return _birimler;
    const out = [];
    for (const kapali of [false, true]) {
      try {
        const j = await apiPost("/avukat_mahkemeleri_sorgula.ajx", { yargiTuru: "2", yargiBirimi: "1101", dosyaKapaliMi: kapali });
        if (Array.isArray(j)) out.push(...j);
      } catch (e) { /* biri patlarsa diğeri kalsın */ }
      await sleep(150);
    }
    const seen = new Map();
    for (const m of out) {
      const id = m.birimId || m.id || m.birim_id; const ad = m.birimAdi || m.birimAd || m.ad || "";
      if (id && !seen.has(String(id))) seen.set(String(id), { birimId: String(id), birimAdi: String(ad) });
    }
    _birimler = Array.from(seen.values());
    _birimlerAt = Date.now();
    return _birimler;
  }

  // Daire adı → birimId. Sıra: tam eşleşme → "genel" eki toleranslı → içerme → şehir + "N. icra" numarası.
  function birimCoz(daireAdi, birimler) {
    if (!daireAdi || !Array.isArray(birimler)) return null;
    const temiz = (s) => norm(s).replace(/\bgenel\b/g, "").replace(/\s+/g, " ").trim();
    const hedef = temiz(daireAdi);
    if (!hedef) return null;
    for (const b of birimler) if (temiz(b.birimAdi) === hedef) return b;
    for (const b of birimler) { const a = temiz(b.birimAdi); if (a && (a.includes(hedef) || hedef.includes(a))) return b; }
    const num = hedef.match(/(\d+)\.\s*icra/);
    const sehir = hedef.split(" ")[0];
    if (num) for (const b of birimler) { const a = temiz(b.birimAdi); if (a.startsWith(sehir) && a.includes(num[1] + ".") && a.includes("icra")) return b; }
    // numarasız tek daire ("Balıkesir İcra Dairesi"): şehir eşleşen ve numara içermeyen tek aday
    if (!num) { const adaylar = birimler.filter((b) => { const a = temiz(b.birimAdi); return a.startsWith(sehir) && a.includes("icra") && !/\d+\./.test(a); }); if (adaylar.length === 1) return adaylar[0]; }
    return null;
  }

  // (yıl, sıra) → dosya adayları. birimId verilirse O DAİREDE arar (kimlik = daire+esas).
  // HIZ KURALI: önce durumKod=2 ("Tümü") — sonuç geldiyse 0/1 HİÇ sorgulanmaz (eski sürüm hep 3 istek
  // atıyordu). Yalnız 2 boş dönerse 0 ve 1 denenir (açık dosya bazen sadece 0'da görünüyor).
  async function dosyaAra(yil, sira, birimId) {
    const full = `${yil}/${sira}`;
    const seen = new Map();
    const tara = async (durumKod) => {
      const body = { dosyaDurumKod: durumKod, pageSize: 100, pageNumber: 1, dosyaYil: parseInt(yil, 10), dosyaSira: parseInt(sira, 10), birimTuru2: "1101" };
      if (birimId) body.birimId = String(birimId);
      let json;
      try { json = await apiPost("/search_phrase_detayli.ajx", body); } catch (e) { return; }
      const items = Array.isArray(json) ? (Array.isArray(json[0]) ? json[0] : json) : [];
      for (const x of items) {
        if (!x || !x.dosyaId) continue;
        const esas = extractEsas(x.dosyaNo || `${x.dosyaYil}/${x.dosyaSiraNo || x.dosyaSira || ""}`);
        if (esas && esas !== full) continue;
        const durum = x.dosyaDurum || "";
        if (!seen.has(x.dosyaId)) seen.set(x.dosyaId, {
          dosyaId: x.dosyaId, dosyaNo: full, durum, durumKod: x.dosyaDurumKod,
          birimAdi: x.birimAdi || "", birimId: String(x.birimId || ""), acilis: detectDate(x.dosyaAcilisTarihi),
        });
        else if (!seen.get(x.dosyaId).durum && durum) seen.get(x.dosyaId).durum = durum;
      }
    };
    await tara(2);
    if (!seen.size) { await uyu(150); await tara(0); await uyu(150); await tara(1); }
    return Array.from(seen.values());
  }

  async function taraflar(dosyaId) {
    const j = await apiPost("/dosya_taraf_bilgileri_brd.ajx", { dosyaId });
    const arr = Array.isArray(j) ? j : (j.taraflar || j.list || j.data || []);
    return arr.map((t) => ({
      ad: t.adi || t.ad || t.adSoyad || "", rol: t.rol || t.tarafTuru || t.sifat || "",
      tip: t.kisiKurum || "", tckn: t.tcKimlikNo || t.tckn || "", vekil: t.vekil || "",
    }));
  }

  async function ayrinti(dosyaId, rec) {
    try {
      const j = await apiPost("/dosyaAyrintiBilgileri_brd.ajx", { dosyaId });
      if (!rec.durum && (j.dosyaDurumu || j.dosyaDurum)) rec.durum = j.dosyaDurumu || j.dosyaDurum;
      if (!rec.birim && j.birimAdi) rec.birim = j.birimAdi;
      const asamaAday = j.dosyaSafhasi || j.takipDurumu || j.takipDurum || j.dosyaAsamasi || j.asama || j.sonIslem || j.sonIslemTuru || j.dosyaDurumAciklama || "";
      if (asamaAday) rec.asama = String(asamaAday);
      if (j.alacakKalemToplamTutar != null) rec.toplamAlacak = j.alacakKalemToplamTutar;
      if (j.alacakKalemFaizTutar != null) rec.islemisFaiz = j.alacakKalemFaizTutar;
      if (j.tahsilHarci != null) rec.tahsilHarci = j.tahsilHarci;
      if (j.takipSonrasiMasraf != null) rec.masraf = j.takipSonrasiMasraf;
      if (j.vekaletUcreti != null) rec.vekalet = j.vekaletUcreti;
      if (j.yapilmisBorcTahsilati != null) rec.tahsilat = j.yapilmisBorcTahsilati;
      if (rec.toplamAlacak != null && rec.tahsilat != null) rec.bakiye = rec.toplamAlacak - rec.tahsilat;
    } catch (e) { rec._ayrintiHata = e.message; }
  }

  async function hesap(dosyaId, rec) {
    try {
      const j = await apiPost("/dosya_hesap_bilgileri.ajx", { dosyaId });
      const items = Array.isArray(j) ? j : [];
      rec.kalemler = rec.kalemler || [];
      const MAP = {
        "Takipte Kesinlesen Miktar": "asilAlacak", "Toplam Faiz Miktari": "islemisFaiz",
        "Vekalet Ücreti": "vekalet", "Vekalet Ucreti": "vekalet", "Masraf Miktari": "masraf",
        "Tahsil Harcı": "tahsilHarci", "Tahsil Harci": "tahsilHarci", "Toplam Alacak": "toplamAlacak",
        "Yatan Para": "tahsilat", "Bakiye Borç Miktari": "bakiye", "Bakiye Borc Miktari": "bakiye",
      };
      for (const it of items) {
        if (!it || typeof it !== "object") continue;
        const ad = it.textAlan || it.kalemAdi || it.aciklama || it.adi || "";
        const tutar = it.degerAlan != null ? it.degerAlan : (it.tutar != null ? it.tutar : it.miktar);
        if (ad && tutar != null) {
          rec.kalemler.push({ ad: String(ad), tutar: Number(tutar) });
          const f = MAP[ad]; if (f && rec[f] == null) rec[f] = Number(tutar);
        }
      }
      if (rec.bakiye == null && rec.toplamAlacak != null && rec.tahsilat != null) rec.bakiye = rec.toplamAlacak - rec.tahsilat;
    } catch (e) { rec._hesapHata = e.message; }
  }

  // ═══════════════ MASRAF — "Ödeme İşlemlerim" ekranından (ağ yakalayıcıyla) ═══════════════
  // Karar (2026-07-04): masraf kaynağı = https://avukat.uyap.gov.tr/odeme-islemlerim — büronun
  // YAPTIĞI ödemelerin defteri (harç/masraf/barokart, makbuz no'suyla) = faturalanacak "bizim taraf"
  // kalemlerinin ta kendisi; üstelik TEK ekranda tüm dosyalar. Endpoint TAHMİN EDİLMEZ: interceptor.js
  // sayfanın kendi listelediği yanıtı yakalar, buradaki ayrıştırıcı kalemleri çıkarır.
  // Akış: kullanıcı Ödeme İşlemlerim'i açıp listeler → panelde "💰 Masraf Tara" → önizleme → "Programa Gönder".

  // MAIN-world yakalamaları biriktir (ring buffer) + OTOMATİK masraf işleme (debounce):
  // kullanıcı Ödeme İşlemlerim'i listelediği AN eklenti kendiliğinden ayrıştırır, eşleştirir, gönderir.
  const _cap = [];
  let _masrafTimer = null;
  window.addEventListener("message", (e) => {
    if (e.source === window && e.data && e.data.source === "rucu-intercept" && e.data.rec) {
      _cap.push(e.data.rec);
      if (_cap.length > 200) _cap.shift();
      if (_masrafTimer) clearTimeout(_masrafTimer);
      _masrafTimer = setTimeout(() => { masrafOtoIsle().catch(() => {}); }, 3000); // liste yüklemesi bitince tek sefer
    }
  });

  // ═══════════════ KEŞİF KAYDI — bilinmeyen akışların uçlarını öğrenme (Faz 0) ═══════════════
  // Amaç: avukat İCRA TAKİBİ AÇMA sihirbazı gibi henüz otomatikleştirilmemiş bir akışı BİR KEZ
  // elle yürütür; eklenti o sıradaki TÜM ağ trafiğini (tam istek gövdesi + yanıt + ekran rotaları)
  // kaydeder ve durdurunca tek JSON dosyası indirir. Bu kayıt "Takip Aç Kopilotu"nun (Faz 1-2)
  // hangi ekranda hangi ucu dolduracağını KANITLAR — uç tahmini yapılmaz (Ödeme İşlemlerim deseni).
  // Keşif de salt-okumadır: hiçbir istek üretilmez/değiştirilmez, sadece dinlenir.
  let _kesifAcik = false;
  let _kesifBaslangic = 0;
  let _kesifYedekTimer = null;
  const _kesifKayit = [];
  const _kesifTabId = Math.random().toString(36).slice(2, 8); // sekme başına yedek anahtarı (çakışmasın)

  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.source !== "rucu-kesif-rec" || !e.data.rec) return;
    if (!_kesifAcik) return;
    _kesifKayit.push(e.data.rec);
    if (_kesifKayit.length > 1500) _kesifKayit.shift(); // emniyet — bir sihirbaz oturumu bunu aşmaz
    kesifButonTazele();
    // sekme yenilenirse kayıp olmasın: kısaltılmış yedek (storage kotası için yanıtlar 100KB'a kırpılır)
    if (_kesifYedekTimer) clearTimeout(_kesifYedekTimer);
    _kesifYedekTimer = setTimeout(() => {
      const kisa = _kesifKayit.slice(-400).map((r) => (r.resp && r.resp.length > 100000 ? { ...r, resp: r.resp.slice(0, 100000) + "…«kırpıldı»" } : r));
      stSet({ ["kesifYedek_" + _kesifTabId]: { baslangic: _kesifBaslangic, kayitlar: kisa } });
    }, 2000);
  });

  async function kesifToggle() {
    if (!_kesifAcik) {
      const tamam = window.confirm(
        "KEŞİF KAYDI başlasın mı?\n\n" +
        "Açıkken bu sekmedeki TÜM UYAP ağ trafiği (istek + yanıt) kaydedilir.\n" +
        "Şimdi otomatikleştirilecek akışı (örn. İCRA TAKİBİ AÇMA sihirbazı) normal şekilde ELLE yürüt.\n" +
        "Bitince aynı düğmeyle durdur — kayıt tek JSON dosyası olarak inecek."
      );
      if (!tamam) return;
      _kesifAcik = true;
      _kesifBaslangic = Date.now();
      _kesifKayit.length = 0;
      _kesifKayit.push({ rota: location.href, not: "keşif başladı", t: Date.now() });
      await stSet({ kesifAktif: true });
      window.postMessage({ source: "rucu-kesif-toggle", on: true }, "*");
      flash("🎬 Keşif kaydı AÇIK — şimdi akışı elle yürüt; bitince ⏹ ile durdur.");
    } else {
      _kesifAcik = false;
      window.postMessage({ source: "rucu-kesif-toggle", on: false }, "*");
      await stSet({ kesifAktif: false });
      await kesifIndir();
    }
    kesifButonTazele();
  }

  // Kayıtları (bu sekmenin belleği + yenilenen/diğer sekmelerin storage yedekleri) birleştirip indir.
  async function kesifIndir() {
    const hepsi = await new Promise((r) => chrome.storage.local.get(null, (o) => r(o || {})));
    const kayitlar = [..._kesifKayit];
    const silinecek = ["kesifAktif"];
    for (const k of Object.keys(hepsi)) {
      if (!k.startsWith("kesifYedek_")) continue;
      silinecek.push(k);
      if (k === "kesifYedek_" + _kesifTabId) continue; // bu sekmenin TAM hâli zaten bellekte
      const y = hepsi[k];
      if (y && Array.isArray(y.kayitlar)) kayitlar.push(...y.kayitlar);
    }
    kayitlar.sort((a, b) => (a.t || 0) - (b.t || 0));
    const dump = {
      surum: "1.4.0",
      amac: "keşif kaydı (takip açma vb. akış öğrenme)",
      baslangic: _kesifBaslangic ? new Date(_kesifBaslangic).toISOString() : null,
      bitis: new Date().toISOString(),
      sayfa: location.href,
      kayitSayisi: kayitlar.length,
      kayitlar,
    };
    const blob = new Blob([JSON.stringify(dump, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "uyap-kesif-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-") + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    chrome.storage.local.remove(silinecek);
    flash(`⏹ Keşif bitti — ${kayitlar.length} kayıt JSON olarak indirildi. Dosyayı Berkan'a ilet (c:\\tmp'ye koy).`);
  }

  function kesifButonTazele() {
    if (!panel) return;
    const b = panel.querySelector("#rucu-kesif");
    if (!b) return;
    b.textContent = _kesifAcik ? `⏹ Keşfi Durdur (${_kesifKayit.length})` : "🎬 Keşif Kaydı";
    b.style.background = _kesifAcik ? "#b91c1c" : "#6d28d9";
  }

  // "1.234,56" / "1234.56" / 1234.56 → sayı (masraf tutarları için; bozuksa NaN)
  function paraSayi(v) {
    if (typeof v === "number") return v;
    const c = String(v == null ? "" : v).replace(/[^\d.,-]/g, "");
    if (!c) return NaN;
    const cok = c.split(",").length - 1 > 1;
    if (!cok && c.includes(",") && c.lastIndexOf(",") > c.lastIndexOf(".")) return Number(c.replace(/\./g, "").replace(",", "."));
    return Number(c.replace(/,/g, ""));
  }

  // Yakalanan JSON'lardan ödeme satırlarını çıkar. Şema bilinmediği için alan adları desenle bulunur;
  // ham indirme düğmesi her zaman yedek (ayrıştırıcı bir alanı kaçırırsa ham JSON'la sertleştirilir).
  function masrafSatirlariCikar() {
    const satirlar = [];
    const gorulen = new Set();
    for (const c of _cap) {
      let j; try { j = JSON.parse(c.resp); } catch (e) { continue; }
      // aday dizileri topla (kök dizi / bilinen liste alanları / 1 seviye içeride)
      const diziler = [];
      const kokAl = (o) => {
        if (Array.isArray(o)) { diziler.push(o); return; }
        if (o && typeof o === "object") for (const k of Object.keys(o)) { const v = o[k]; if (Array.isArray(v) && v.length && typeof v[0] === "object") diziler.push(v); }
      };
      kokAl(j); if (!Array.isArray(j) && j && typeof j === "object") for (const k of Object.keys(j)) kokAl(j[k]);
      for (const arr of diziler) {
        const ilk = arr[0] || {};
        const anahtarlar = Object.keys(ilk);
        const tutarKey = anahtarlar.find((k) => /tutar|miktar|odenen|toplam/i.test(k) && !/vergi|oran/i.test(k));
        if (!tutarKey) continue;
        const tarihliMi = anahtarlar.some((k) => /tarih/i.test(k));
        const makbuzluMu = anahtarlar.some((k) => /makbuz|dekont|seri|belge|islemno|referans/i.test(k));
        if (!tarihliMi && !makbuzluMu) continue; // tutarlı ama tarihsiz+makbuzsuz dizi → başka bir liste
        for (const it of arr) {
          if (!it || typeof it !== "object") continue;
          const tutar = paraSayi(it[tutarKey]);
          if (!Number.isFinite(tutar) || tutar <= 0) continue;
          let tarih = "";
          for (const k of Object.keys(it)) if (/tarih/i.test(k)) { const d = detectDate(it[k]); if (d) { tarih = d; break; } }
          let makbuz = "";
          for (const k of Object.keys(it)) if (/makbuz|dekont|seri|belgeno|islemno|referans/i.test(k)) { const v = tr(it[k]); if (v && v !== "0") { makbuz = v.slice(0, 60); break; } }
          // TÜR/AD seçimi v2 (saha bulgusu: eski sürüm "odemeTuru"=16 kod numarasını ve
          // "İnternetten yatırıldı." kanal metnini tür sanıyordu): tüm metin alanları PUANLANIR —
          // salt sayı ve ödeme kanalı cümleleri elenir, harç/masraf sözlüğüne benzeyenler öne çıkar.
          let ad = "";
          {
            const KANAL_RE = /internetten|vezne|yat[ıi]r[ıi]ld|barokart|kredi kart|havale|eft|posta [çc]eki/i;
            const MASRAF_SOZ_RE = /har[çc]|tebligat|posta|gider|vekalet|bilirki|ke[şs]if|sat[ıi][şs]|yol tazmin|ilan|m[üu]zekkere|masraf|ba[şs]vuru|pe[şs]in|tahsil|cezaevi|d[ıi][şs] [üu]lke/i;
            let enIyi = null, enIyiPuan = 0, kanalYedek = "", kodYedek = "";
            for (const k of Object.keys(it)) {
              if (/tutar|miktar|tarih|makbuz|dekont|seri|belge|islemno|referans|dosya|birim|daire|mahkeme|esas|vergi|oran|id$/i.test(k)) continue;
              const v = it[k];
              if (typeof v !== "string" && typeof v !== "number") continue;
              const sv = tr(String(v)).slice(0, 200);
              if (!sv || sv === "0") continue;
              if (/^\d+([.,]\d+)?$/.test(sv)) { if (!kodYedek && /tur|tip|kalem|har[cç]/i.test(k)) kodYedek = sv; continue; } // salt sayı = kod
              if (KANAL_RE.test(sv) && sv.length < 40) { if (!kanalYedek) kanalYedek = sv; continue; } // ödeme kanalı ≠ tür
              let puan = Math.min(sv.length, 40) / 10;
              if (/har[cç]|masraf|gider|kalem|cins/i.test(k)) puan += 30;
              if (MASRAF_SOZ_RE.test(sv)) puan += 20;
              if (/aciklama|tur|tip/i.test(k)) puan += 10;
              if (puan > enIyiPuan) { enIyiPuan = puan; enIyi = sv; }
            }
            ad = enIyi || kanalYedek || (kodYedek ? "UYAP ödeme türü " + kodYedek : "");
          }
          // dosya bağlantısı: herhangi bir string alanda esas no + birim/daire alanı
          let esas = "", birim = "";
          for (const k of Object.keys(it)) {
            const v = it[k];
            if (typeof v !== "string") continue;
            if (!esas) { const e2 = extractEsas(v); if (e2) esas = e2; }
            if (!birim && /birim|daire|mahkeme|icra/i.test(k) && v.trim()) birim = v.trim().slice(0, 120);
          }
          const kimlik = [makbuz, tarih, Math.round(tutar * 100), esas].join("|");
          if (gorulen.has(kimlik)) continue;
          gorulen.add(kimlik);
          satirlar.push({ kimlik, tarih, ad: ad || "UYAP ödemesi", tutar: Math.round(tutar * 100) / 100, makbuzNo: makbuz || null, esas, birim, _url: c.url, _req: c.req || "" });
        }
      }
    }
    // ŞABLON ÖĞRENME: satır üreten ilk yakalamanın (url + istek gövdesi) şablonu kaydedilir →
    // "📅 Aralık Çek" bununla sayfayı hiç açmadan istenen tarih aralığını doğrudan sorgular.
    const ilk = satirlar.find((s) => s._req);
    if (ilk) stSet({ masrafSablon: { url: ilk._url, req: ilk._req, t: Date.now() } });
    return satirlar;
  }

  // Satırları program dosyalarıyla eşleştir (esas → adaylar; birden çoksa BİRİM ile ayrıştır — daire+esas kimliği).
  // TÜM anahtarların (Ray + Zurich) TÜM aktif dosyaları taranır (?tazeSaat=0); her dosya kendi token'ını taşır.
  async function masrafEslestir(satirlar) {
    const tokenlar = await anahtarlar();
    const esasMap = new Map(); // esas → [{id, daire, token}]
    for (const token of tokenlar) {
      const hr = await sendBg({ type: "RUCU_HEDEFLER", tumu: true, token });
      const tum = (hr.ok && hr.data && hr.data.ok && Array.isArray(hr.data.hedefler)) ? hr.data.hedefler : [];
      for (const h of tum) { const e2 = extractEsas(h.icraDosyaNo); if (!e2) continue; if (!esasMap.has(e2)) esasMap.set(e2, []); esasMap.get(e2).push({ id: h.id, daire: h.daire || "", token }); }
    }
    const dosyaBazli = new Map(); // programId → { icraDosyaNo, token, kalemler: [] }
    const eslesmeyen = [];
    for (const s of satirlar) {
      const adaylar = s.esas ? (esasMap.get(s.esas) || []) : [];
      let secilen = null;
      if (adaylar.length === 1) secilen = adaylar[0];
      else if (adaylar.length > 1 && s.birim) secilen = adaylar.find((a) => a.daire && (norm(a.daire).includes(norm(s.birim).split(" ")[0]) || norm(s.birim).includes(norm(a.daire).split(" ")[0]))) || null;
      if (!secilen) { eslesmeyen.push(s); continue; }
      if (!dosyaBazli.has(secilen.id)) dosyaBazli.set(secilen.id, { icraDosyaNo: s.esas, token: secilen.token, kalemler: [] });
      dosyaBazli.get(secilen.id).kalemler.push({ tarih: s.tarih || null, ad: s.ad, tutar: s.tutar, makbuzNo: s.makbuzNo });
    }
    return { dosyaBazli, eslesmeyen };
  }

  // ── OTOMATİK gönderim: yakalanan YENİ kalemler (bu oturumda işlenmemiş) eşleştirilip yazılır ──
  const _masrafIslenen = new Set();
  let _masrafOtoCalisiyor = false;
  async function masrafOtoIsle() {
    if (_masrafOtoCalisiyor || _calisiyor) return;
    _masrafOtoCalisiyor = true;
    try {
      const satirlar = masrafSatirlariCikar().filter((s) => !_masrafIslenen.has(s.kimlik));
      if (!satirlar.length) return;
      const { dosyaBazli, eslesmeyen } = await masrafEslestir(satirlar);
      satirlar.forEach((s) => _masrafIslenen.add(s.kimlik)); // aynı oturumda tekrar gönderme (sunucu dedup'u da var)
      if (!dosyaBazli.size) { flash(`💰 ${satirlar.length} ödeme kalemi yakalandı ama hiçbiri program dosyasıyla eşleşmedi (dosya no'suz/aleyhe olabilir).`); return; }
      let ok = 0, yeni = 0;
      for (const [programId, d] of dosyaBazli) {
        const r = await sendBg({ type: "RUCU_SENKRON", token: d.token, body: { dosyaId: programId, icraDosyaNo: d.icraDosyaNo, masraflar: d.kalemler } });
        if (r.ok && r.data && r.data.ok) { ok++; yeni += r.data.yeniMasraf || 0; }
        await sleep(250);
      }
      flash(`💰 Otomatik: ${satirlar.length} kalem yakalandı → ${ok} dosyaya ${yeni} YENİ kalem yazıldı${eslesmeyen.length ? ` · ${eslesmeyen.length} eşleşmedi` : ""}.`);
      seritGuncelle();
    } finally { _masrafOtoCalisiyor = false; }
  }

  // ── 📅 ARALIK ÇEK: öğrenilen şablonla belirli tarih aralığını DOĞRUDAN sorgula (sayfa gezmek yok) ──
  function tarihAlanBul(bodyObj) {
    const anahtarlar = Object.keys(bodyObj);
    const bas = anahtarlar.find((k) => /baslang|basla|ilktarih|tarih1|start/i.test(k));
    const bit = anahtarlar.find((k) => k !== bas && /bitis|sontarih|tarih2|end/i.test(k));
    return { bas, bit };
  }
  function tarihBicimle(ornek, ggaayyyy) {
    // kullanıcı GG.AA.YYYY girer; şablondaki örnek değerin biçimine çevrilir
    const m = ggaayyyy.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
    if (!m) return null;
    const [g, a, y] = [m[1].padStart(2, "0"), m[2].padStart(2, "0"), m[3]];
    const o = String(ornek ?? "");
    if (/^\d{4}-\d{2}-\d{2}/.test(o)) return `${y}-${a}-${g}`;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(o)) return `${g}/${a}/${y}`;
    if (typeof ornek === "number") return new Date(`${y}-${a}-${g}T00:00:00`).getTime();
    return `${g}.${a}.${y}`; // varsayılan TR biçimi
  }
  async function masrafAralikCek() {
    const o = await st(["masrafSablon"]);
    const sab = o.masrafSablon;
    if (!sab || !sab.url || !sab.req) {
      durumYaz(`📅 Şablon henüz öğrenilmedi.<br><span class="rucu-mut">Bir kez UYAP menü → <b>Ödeme İşlemlerim</b> → listele (eklenti isteği öğrenir ve o listeyi zaten otomatik gönderir). Sonrasında bu düğme, sayfayı açmadan istediğin tarih aralığını doğrudan çeker.</span>`);
      return;
    }
    let body; try { body = JSON.parse(sab.req); } catch (e) { durumYaz("📅 Şablon gövdesi JSON değil — ham veriyi Berkan'a gönder (⬇ Ham, 💰 Masraf Tara içinden)."); return; }
    const { bas, bit } = tarihAlanBul(body);
    if (!bas || !bit) { durumYaz(`📅 Şablonda tarih alanları bulunamadı (alanlar: ${esc(Object.keys(body).join(", "))}) — ham örneği Berkan'a gönder, alan adları sabitlenir.`); return; }
    const b1 = window.prompt("Başlangıç tarihi (GG.AA.YYYY):", ""); if (!b1) return;
    const b2 = window.prompt("Bitiş tarihi (GG.AA.YYYY):", ""); if (!b2) return;
    const v1 = tarihBicimle(body[bas], b1), v2 = tarihBicimle(body[bit], b2);
    if (v1 == null || v2 == null) { flash("Tarih biçimi anlaşılamadı — GG.AA.YYYY girin."); return; }
    durumYaz(`📅 ${esc(b1)} – ${esc(b2)} aralığı sorgulanıyor…`);
    const path = sab.url.replace(location.origin, "");
    let sayfa = 1, toplam = 0;
    const sayfaAnahtari = Object.keys(body).find((k) => /page|sayfa/i.test(k) && typeof body[k] === "number");
    for (; sayfa <= 20; sayfa++) {
      const govde = Object.assign({}, body, { [bas]: v1, [bit]: v2 });
      if (sayfaAnahtari) govde[sayfaAnahtari] = sayfa;
      let j; try { j = await apiPost(path, govde); } catch (e) { if (sayfa === 1) durumYaz(`📅 Sorgu hatası: ${esc(e.message)}`); break; }
      // yanıtı sahte-yakalama olarak kuyruğa koy → aynı ayrıştırıcı/eşleştirici işler
      _cap.push({ url: sab.url, req: JSON.stringify(govde), resp: JSON.stringify(j), t: Date.now() });
      const onceki = toplam;
      toplam = masrafSatirlariCikar().length;
      if (!sayfaAnahtari || toplam === onceki) break; // sayfalama yok ya da yeni satır gelmedi
      await sleep(500);
    }
    await masrafOtoIsle();
    durumYaz(`📅 Aralık taraması bitti — sonuç üstteki bildirimde. <span class="rucu-mut">(otomatik gönderildi; mükerrerler sunucuda elenir)</span>`);
  }

  async function masrafTara() {
    const satirlar = masrafSatirlariCikar();
    if (!satirlar.length) {
      durumYaz(`💰 Yakalanan ödeme kalemi yok.<br><span class="rucu-mut">1) UYAP menüsünden <b>Ödeme İşlemlerim</b>'i aç · 2) tarih aralığını seçip <b>listele</b> (sayfa sayfa gez) · 3) bu düğmeye tekrar bas. Liste yüklendiyse ama hâlâ boşsa <b>⬇ Ham</b> ile indirip Berkan'a gönder — ayrıştırıcı sertleştirilir.</span>`);
      return;
    }
    durumYaz(`💰 ${satirlar.length} ödeme kalemi bulundu, dosyalarla eşleştiriliyor…`);
    const { dosyaBazli, eslesmeyen } = await masrafEslestir(satirlar);
    let toplamKalem = 0; dosyaBazli.forEach((d) => { toplamKalem += d.kalemler.length; });
    const ozet = `💰 <b>${satirlar.length}</b> kalem yakalandı → <b>${toplamKalem}</b> kalem <b>${dosyaBazli.size}</b> dosyayla eşleşti · <b>${eslesmeyen.length}</b> eşleşmedi (dosya no'suz/başka dosya).`;
    const liste = Array.from(dosyaBazli.entries()).slice(0, 12).map(([, d]) => `• ${esc(d.icraDosyaNo)}: ${d.kalemler.length} kalem, ${fmtTL(d.kalemler.reduce((s2, k) => s2 + k.tutar, 0))}`).join("<br>");
    durumYaz(`${ozet}<br>${liste}${dosyaBazli.size > 12 ? "<br>…" : ""}<br>
      <button class="rucu-btn" id="rucu-msend">📤 Programa Gönder</button>
      <button class="rucu-btn sec" id="rucu-mraw">⬇ Ham</button>`);
    durumEl.querySelector("#rucu-mraw").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify({ satirlar, yakalanan: _cap.map((c) => ({ url: c.url, resp: c.resp.slice(0, 100000) })) }, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "uyap-odeme-ham.json"; a.click();
    });
    durumEl.querySelector("#rucu-msend").addEventListener("click", async () => {
      let ok = 0, hata = 0, yeni = 0;
      for (const [programId, d] of dosyaBazli) {
        const r = await sendBg({ type: "RUCU_SENKRON", token: d.token, body: { dosyaId: programId, icraDosyaNo: d.icraDosyaNo, masraflar: d.kalemler } });
        if (r.ok && r.data && r.data.ok) { ok++; yeni += r.data.yeniMasraf || 0; } else hata++;
        await sleep(300);
      }
      flash(`Masraf gönderimi: ${ok} dosya · ${yeni} YENİ kalem yazıldı (mükerrerler sunucuda elendi)${hata ? ` · ${hata} hata` : ""}.`);
    });
  }

  // Oto Sorgula sırasında dosya-başına masraf çekimi YOK (kaynak tek ekran: Ödeme İşlemlerim) — iskelet dursun.
  async function masrafTopla(dosyaId, rec) { /* kaynak = Ödeme İşlemlerim akışı (masrafTara) */ }

  // ── evrak listesi + safahat (uç aileleri; çalışan uç öğrenilir) ────────────
  function evrakItems(json) {
    let items = [];
    if (Array.isArray(json)) items = Array.isArray(json[0]) ? json[0] : json;
    else if (json && typeof json === "object") {
      items = json.evraklar || json.list || json.data || json.evrakListesi || json.content || json.rows || [];
      if ((!items || !items.length) && json.tumEvraklar && typeof json.tumEvraklar === "object") items = Object.values(json.tumEvraklar).flat();
    }
    return Array.isArray(items) ? items : [];
  }
  function parseEvrak(json) {
    const items = evrakItems(json);
    if (!items.length) return [];
    const k0 = Object.keys(items[0] || {});
    if (!k0.some((k) => /evrak|tarih|teblig|belge|konu|aciklama/i.test(k))) return [];
    return items.map((it) => {
      if (!it || typeof it !== "object") return null;
      let tarih = "";
      for (const c of [it.evrakTarihi, it.tarih, it.onaylandigiTarih, it.sistemeGonderildigiTarih, it.evrakGeldigiTarih, it.kayitTarihi, it.islemTarihi]) { const d = detectDate(c); if (d) { tarih = d; break; } }
      if (!tarih) for (const kk of Object.keys(it)) { if (/tebli/i.test(kk)) continue; const d = detectDate(it[kk]); if (d) { tarih = d; break; } }
      let teblig = ""; for (const c of [it.tebligTarihi, it.tebligatTarihi]) { const d = detectDate(c); if (d) { teblig = d; break; } }
      const tur = it.evrakTuru || it.evrakTuruAdi || it.tur || it.belgeTuru || "";
      const aciklama = it.aciklama || it.konu || it.evrakAdi || it.adi || it.baslik || "";
      const evrakId = it.evrakId || it.id || it.evrak_id || it.evrakID || it.siraNo || "";
      return { evrakId, tarih, tur: String(tur), aciklama: String(aciklama), tebligTarihi: teblig };
    }).filter(Boolean);
  }
  const EVRAK_ENDPOINTS = [
    (id) => ["/list_dosya_evraklar.ajx", { dosyaId: id, pageNumber: 1 }],
    (id) => ["/listDosyaEvraklarPageTotal.ajx", { dosyaId: id, pageNumber: 1 }],
    (id) => ["/dosya_evrak_listesi_brd.ajx", { dosyaId: id }],
    (id) => ["/dosyaEvrakListesi.ajx", { dosyaId: id }],
    (id) => ["/evrak_listesi_brd.ajx", { dosyaId: id }],
    (id) => ["/evrak_listesi.ajx", { dosyaId: id }],
  ];
  let _evrakEp = null;
  async function evrakListe(dosyaId, rec) {
    const dene = async (f) => { const [url, body] = f(dosyaId); try { const j = await apiPost(url, body); const l = parseEvrak(j); if (l.length) { _evrakEp = f; return l; } } catch (e) {} return null; };
    let list = _evrakEp ? await dene(_evrakEp) : null;
    if (!list) for (const f of EVRAK_ENDPOINTS) { list = await dene(f); if (list) break; await sleep(200); }
    if (list && list.length) {
      rec.evrak = list;
      rec.sonEvrakTarihi = list.map((e) => e.tarih).filter(Boolean).sort().slice(-1)[0] || "";
      const teb = list.map((e) => e.tebligTarihi).filter(Boolean).sort()[0];
      if (teb) rec.tebligTarihi = teb;
    }
  }
  function parseSafahat(json) {
    let items = Array.isArray(json) ? (Array.isArray(json[0]) ? json[0] : json)
      : (json && typeof json === "object" ? (json.safahat || json.safahatlar || json.list || json.data || json.rows || json.content || []) : []);
    if (!Array.isArray(items)) items = [];
    return items.map((it) => {
      if (!it || typeof it !== "object") return null;
      let tarih = "";
      for (const c of [it.islemTarihi, it.safahatTarihi, it.tarih, it.kayitTarihi]) { const d = detectDate(c); if (d) { tarih = d; break; } }
      if (!tarih) for (const kk of Object.keys(it)) { const d = detectDate(it[kk]); if (d) { tarih = d; break; } }
      const islem = it.islem || it.safahat || it.islemTuru || it.aciklama || it.tur || it.durum || it.konu || "";
      return islem ? { tarih, islem: String(islem) } : null;
    }).filter(Boolean);
  }
  const SAFAHAT_ENDPOINTS = [
    (id) => ["/dosya_safahat_bilgileri_brd.ajx", { dosyaId: id }],
    (id) => ["/dosyaSafahatBilgileri.ajx", { dosyaId: id }],
    (id) => ["/dosya_safahat_brd.ajx", { dosyaId: id }],
    (id) => ["/safahat_bilgileri_brd.ajx", { dosyaId: id }],
    (id) => ["/dosyaSafahat.ajx", { dosyaId: id }],
  ];
  let _safahatEp = null, _safahatDene = true, _safahatFail = 0;
  async function safahat(dosyaId, rec) {
    if (!_safahatDene) return;
    const dene = async (f) => { const [url, body] = f(dosyaId); try { const j = await apiPost(url, body); const l = parseSafahat(j); if (l.length) { _safahatEp = f; return l; } } catch (e) {} return null; };
    let list = _safahatEp ? await dene(_safahatEp) : null;
    if (!list) for (const f of SAFAHAT_ENDPOINTS) { list = await dene(f); if (list) break; await sleep(150); }
    if (list && list.length) { rec.safahat = list; rec.safahatSon = list.map((s) => s.tarih).filter(Boolean).sort().slice(-1)[0] || ""; }
    else if (!_safahatEp && ++_safahatFail >= 4) _safahatDene = false;
  }

  // ═══════════════ EŞLEŞTİRME ÇEKİRDEĞİ — (daire + esas) kimliği ═══════════════
  // TÜRKÇE İ TUZAĞI (v1.3.0 saha bulgusu): JS regex /i bayrağı 'İ' (U+0130) harfini 'i' ile
  // EŞLEŞTİRMEZ — "RAY SİGORTA", /ray\s*si?gorta/i desenini ıskalıyordu ve TÜM dosyalar yanlışlıkla
  // TARAF_UYUSMAZ oluyordu. Çözüm: iki taraf da TR→ASCII normalize edilip düz includes ile bakılır.
  const TR_ASCII = { "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ı": "i", "İ": "i", "ö": "o", "Ö": "o", "ş": "s", "Ş": "s", "ü": "u", "Ü": "u" };
  const trAscii = (s) => String(s == null ? "" : s).replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TR_ASCII[c] || c).toLowerCase().replace(/\s+/g, " ").trim();
  const rolIcerir = (rol, kokler) => { const r = trAscii(rol); return kokler.some((k) => r.includes(k)); };

  // "Zurich Sigorta A.Ş." → "zurich sigorta" · "Ray Sigorta A.Ş." → "ray sigorta" (taraf adında aranır)
  function unvanAnahtar(unvan) {
    const k = trAscii(unvan).split(" ").filter(Boolean);
    if (!k.length) return null;
    if (k[1] && /^si?gorta/.test(k[1])) return k[0] + " sigorta";
    return k[0];
  }

  /**
   * TARAF DOĞRULAMASI — büroda ALEYHE dosyalar da var (tenant borçlu/davalı taraf): tek aday bile
   * dönse, ALACAKLISI tenant unvanı değilse yazım YAPILMAZ → TARAF_UYUSMAZ raporu. Yanlış (aleyhe)
   * dosyaya olay/masraf yazmak, hiç yazmamaktan çok daha tehlikeli.
   */
  async function tarafDogrula(h, aday) {
    if (!h.unvanKok) return { ok: true, not: "alacaklı unvanı programda tanımsız — taraf doğrulaması ATLANDI (Şirket Bilgileri'nden girin)" };
    let taraf;
    try { await uyu(200); taraf = await taraflar(aday.dosyaId); } catch (e) { return { ok: true, not: "taraf sorgusu başarısız (" + e.message + ") — doğrulamasız eşleşme, KONTROL ET" }; }
    const alacakliMi = taraf.some((t) => rolIcerir(t.rol, ["alacakl", "davac"]) && trAscii(t.ad).includes(h.unvanKok));
    if (alacakliMi) return { ok: true };
    const bizBorcluMu = taraf.some((t) => rolIcerir(t.rol, ["borclu", "daval"]) && trAscii(t.ad).includes(h.unvanKok));
    const ozet = taraf.slice(0, 6).map((t) => `${t.rol}: ${t.ad}`).join(" | ");
    return { ok: false, not: (bizBorcluMu ? "şirket bu dosyada BORÇLU/DAVALI (aleyhe dosya!) — " : "alacaklı şirket değil — ") + ozet };
  }

  /**
   * Hedefi UYAP'ta çöz. hedef = { id, esasNo, yil, sira, daire, unvanKok }
   * Dönüş: { eslesme, not, secilen?, adaylar? } — eslesme: OK|DAIRE_EKSIK|DAIRE_COZULEMEDI|BULUNAMADI|BASKA_DAIRE|COKLU_BELIRSIZ|TARAF_UYUSMAZ
   */
  async function hedefEslestir(h, birimler) {
    if (!h.daire) {
      // Daire bilinmiyorsa yine de genel arama yap — tek aday çıkarsa TARAF DOĞRULAMASIYLA kullan
      const genel = await dosyaAra(h.yil, h.sira, null);
      if (genel.length === 1) {
        const td = await tarafDogrula(h, genel[0]);
        if (!td.ok) return { eslesme: "TARAF_UYUSMAZ", not: `genel aramada tek aday (${genel[0].birimAdi}) ama ${td.not}` };
        return { eslesme: "OK", not: "daire programda boştu — genel aramada tek aday: " + genel[0].birimAdi + (td.not ? " · " + td.not : ""), secilen: genel[0] };
      }
      if (!genel.length) return { eslesme: "DAIRE_EKSIK", not: "programda icra dairesi boş; genel aramada da dosya yok" };
      return coklustanSec(h, genel, "daire programda boş — " + genel.length + " aday");
    }
    const birim = birimCoz(h.daire, birimler);
    if (!birim) {
      return { eslesme: "DAIRE_COZULEMEDI", not: `"${h.daire}" UYAP daire listesinde eşleşmedi (avukat kartının erişebildiği ${birimler.length} birim tarandı)` };
    }
    // Kimlik sorgusu: BU dairede bu esas no. TEK aday bile olsa taraf doğrulanır (aleyhe dosya kemeri).
    const adaylar = await dosyaAra(h.yil, h.sira, birim.birimId);
    if (adaylar.length === 1) {
      const td = await tarafDogrula(h, adaylar[0]);
      if (!td.ok) return { eslesme: "TARAF_UYUSMAZ", not: `${h.daire} ${h.esasNo}: ${td.not}` };
      return { eslesme: "OK", secilen: adaylar[0], not: td.not || "" };
    }
    if (adaylar.length > 1) return coklustanSec(h, adaylar, `aynı dairede ${adaylar.length} kayıt`);
    // Dairede yok → genel aramayla NEREDE olduğunu bul (altın değerinde teşhis bilgisi)
    await uyu(200);
    const genel = await dosyaAra(h.yil, h.sira, null);
    if (!genel.length) return { eslesme: "BULUNAMADI", not: `${h.esasNo} hiçbir dairede bulunamadı (bu avukat kartıyla görünmüyor olabilir)` };
    const nerede = genel.map((c) => `${c.birimAdi || "?"} (${durumTahmin(c.durumKod, c.durum)})`).join(" | ");
    return { eslesme: "BASKA_DAIRE", not: `"${h.daire}"de yok; şurada var: ${nerede} — programdaki daire kaydını düzeltin`, adaylar: genel };
  }

  // Çoklu adaydan seçim: alacaklısı TENANT olan (100p) > açık (10p) > daire eşleşen (1p).
  // Net kazanan yoksa (unvan hiçbirinde alacaklı değilse) COKLU_BELIRSIZ — YANLIŞ dosyaya yazmaktansa sor.
  async function coklustanSec(h, adaylar, bag) {
    const inceleme = [];
    for (const c of adaylar) {
      await uyu(250);
      let alacakliMi = false, taraf = [];
      try { taraf = await taraflar(c.dosyaId); alacakliMi = !!(h.unvanKok && taraf.some((t) => rolIcerir(t.rol, ["alacakl", "davac"]) && trAscii(t.ad).includes(h.unvanKok))); } catch (e) {}
      inceleme.push(Object.assign({ alacakliMi, durTah: durumTahmin(c.durumKod, c.durum), taraf }, c));
    }
    const puan = (c) => (c.alacakliMi ? 100 : 0) + (c.durTah === "AÇIK" ? 10 : 0) + (h.daire && norm(c.birimAdi).includes(norm(h.daire).split(" ")[0]) ? 1 : 0);
    inceleme.sort((a, b) => puan(b) - puan(a));
    const kazanan = inceleme[0];
    const liste = inceleme.map((c) => `${c.birimAdi || "?"}·${c.durTah}${c.alacakliMi ? "·ALACAKLI✓" : ""}`).join(" | ");
    // Net kazanan: alacaklı-eşleşen TEK dosya → OK. Alacaklı-eşleşen birden çoksa ya da hiç yoksa → BELİRSİZ.
    const alacakliOlanlar = inceleme.filter((c) => c.alacakliMi);
    if (alacakliOlanlar.length === 1) return { eslesme: "OK", secilen: alacakliOlanlar[0], not: `${bag} → alacaklı eşleşmesiyle seçildi [${liste}]` };
    if (alacakliOlanlar.length > 1) {
      const acik = alacakliOlanlar.filter((c) => c.durTah === "AÇIK");
      if (acik.length === 1) return { eslesme: "OK", secilen: acik[0], not: `${bag} → alacaklı+AÇIK seçildi [${liste}]` };
    }
    return { eslesme: "COKLU_BELIRSIZ", not: `${bag}; net alacaklı eşleşmesi yok — elle seçin: [${liste}]`, adaylar: inceleme, secilen: kazanan };
  }

  // ═══════════════ olay türetme + senkron gövdesi ═══════════════
  function tipFromMetin(s) {
    const t = String(s || "").toLowerCase();
    if (/itiraz/.test(t)) return "ITIRAZ";
    if (/haciz/.test(t)) return "HACIZ";
    if (/kesinleş|kesinles/.test(t)) return "KESINLESTI";
    if (/tahsil|reddiyat|makbuz|ödeme|odeme/.test(t)) return "TAHSILAT";
    if (/tebli|mazbata/.test(t)) return "TEBLIG";
    return null;
  }
  function olaylarTuret(rec) {
    const ol = [];
    const ekle = (tip, tarih, aciklama) => { if (tip) ol.push({ tip, tarih: tarih || null, aciklama: String(aciklama || "").slice(0, 200) }); };
    if (rec.tebligTarihi) ekle("TEBLIG", rec.tebligTarihi, "Tebliğ (UYAP)");
    for (const ev of rec.evrak || []) {
      const tip = tipFromMetin(ev.tur || ev.aciklama);
      if (tip && (ev.tarih || ev.tebligTarihi)) ekle(tip, ev.tarih || ev.tebligTarihi, ev.tur || ev.aciklama);
    }
    for (const s of rec.safahat || []) {
      const tip = tipFromMetin(s.islem);
      if (tip && s.tarih) ekle(tip, s.tarih, s.islem);
    }
    // Aşama/durum metni "itiraz" diyorsa ve tarihli itiraz olayı yoksa → STABİL tarihe bağla (flood önlemi)
    if (!ol.some((o) => o.tip === "ITIRAZ") && (/itiraz/i.test(String(rec.asama || "")) || /itiraz/i.test(String(rec.durum || "")))) {
      const t = rec.safahatSon || rec.sonEvrakTarihi || rec.tebligTarihi || "";
      if (t) ekle("ITIRAZ", t, "Takibe itiraz (UYAP aşama)");
    }
    return ol;
  }

  function senkronGovde(h, rec, eslesmeSonuc) {
    const govde = {
      dosyaId: h.id, // program kimliği — kesin eşleşme (v1)
      icraDosyaNo: h.esasNo,
      eslesme: { durum: eslesmeSonuc.eslesme, not: (eslesmeSonuc.not || "").slice(0, 900) || null },
    };
    if (rec) {
      govde.durum = rec.durumTahmin || rec.durum || null;
      govde.olaylar = olaylarTuret(rec);
      govde.hesap = {
        durumMetni: rec.durum || null, birim: rec.birim || null,
        toplamAlacak: rec.toplamAlacak ?? null, asilAlacak: rec.asilAlacak ?? null,
        islemisFaiz: rec.islemisFaiz ?? null, tahsilat: rec.tahsilat ?? null,
        bakiye: rec.bakiye ?? null, vekalet: rec.vekalet ?? null,
        sonEvrakTarihi: rec.sonEvrakTarihi || null, evrakSayisi: (rec.evrak && rec.evrak.length) || 0,
        asama: rec.asama || null, safahatSayisi: (rec.safahat && rec.safahat.length) || 0,
        uyapAcilis: rec.acilis || null,
      };
      if (rec.masrafKalemleri && rec.masrafKalemleri.length) govde.masraflar = rec.masrafKalemleri;
    }
    return govde;
  }

  // ═══════════════ evrak programa yükleme (dedup: evrakId ilk-20 + sunucu manifesti) ═══════════════
  async function fetchB64(url) {
    try {
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) return null;
      let ct = (resp.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();
      const buf = await resp.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > 3200000) return null;
      const bytes = new Uint8Array(buf);
      const sig = String.fromCharCode(bytes[0] || 0, bytes[1] || 0, bytes[2] || 0, bytes[3] || 0);
      if (/html|text\/|application\/json/.test(ct) || sig.slice(0, 2) === "<h" || sig.slice(0, 4).toLowerCase() === "<!do" || sig.slice(0, 2) === "<!") return null;
      if (!ct || ct === "application/octet-stream") {
        ct = sig === "%PDF" ? "application/pdf" : (sig.slice(0, 2) === "II" || sig.slice(0, 2) === "MM") ? "image/tiff"
          : (bytes[0] === 0xFF && bytes[1] === 0xD8) ? "image/jpeg" : sig === "\x89PNG" ? "image/png" : "application/octet-stream";
      }
      let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return { b64: btoa(bin), mime: ct };
    } catch (e) { return null; }
  }
  const mimeExt = (m) => { m = String(m || ""); return m.includes("pdf") ? ".pdf" : m.includes("tiff") ? ".tif" : m.includes("jpeg") ? ".jpg" : m.includes("png") ? ".png" : ".pdf"; };
  const PDF_ENDPOINTS = ["/main/icra/modules/evrak/view_document_brd.uyap", "/main/icra/modules/evrak/download_document_brd.uyap"];
  let _pdfEp = null;

  async function evrakYukle(h, rec) {
    if (!rec.uyapDosyaId || !Array.isArray(rec.evrak) || !rec.evrak.length) return 0;
    const o = await st(["gonderilenEvrak"]);
    const gond = o.gonderilenEvrak || {};
    let sunucuOnek = new Set();
    try {
      const mf = await sendBg({ type: "RUCU_EVRAK_MANIFEST", token: h.token, icraDosyaNo: h.esasNo });
      if (mf && mf.ok && mf.data && mf.data.ok && Array.isArray(mf.data.onekler)) sunucuOnek = new Set(mf.data.onekler);
    } catch (e) {}
    const did = String(rec.uyapDosyaId).replace(/"/g, "").trim();
    let n = 0;
    for (const ev of rec.evrak) {
      if (!ev.evrakId) continue;
      const eid = String(ev.evrakId).replace(/"/g, "").trim();
      const kimlik = eid.slice(0, 20);
      const key = h.esasNo + ":" + kimlik;
      if (gond[key] || sunucuOnek.has(kimlik)) { gond[key] = true; continue; }
      let res = null;
      const eps = _pdfEp ? [_pdfEp].concat(PDF_ENDPOINTS.filter((e) => e !== _pdfEp)) : PDF_ENDPOINTS.slice();
      for (const ep of eps) {
        res = await fetchB64(location.origin + ep + "?dosyaId=" + encodeURIComponent(did) + "&evrakId=" + encodeURIComponent(eid));
        if (res) { _pdfEp = ep; break; }
      }
      if (!res) continue;
      const ad = ((ev.tur || ev.aciklama || "evrak") + " " + (ev.tarih || "")).trim().slice(0, 120) + mimeExt(res.mime);
      const r = await sendBg({ type: "RUCU_EVRAK", token: h.token, body: { icraDosyaNo: h.esasNo, dosyaId: h.id, uyapEvrakId: eid, dosyaAdi: ad, tur: ev.tur || "", contentBase64: res.b64, mime: res.mime } });
      if (r.ok && r.data && r.data.ok) { gond[key] = true; n++; }
      await uyu(250);
    }
    await stSet({ gonderilenEvrak: gond });
    return n;
  }

  // ═══════════════ ANA AKIŞ — ÇOKLU ANAHTAR (Ray + Zurich tek kurulumda) ═══════════════
  // Her tenant'ın kendi senkron anahtarı var; eklenti HEPSİNİ saklar ve her turda sırayla
  // hepsinin hedeflerini çekip kendi anahtarıyla geri yazar. Anahtar değiş-tokuşu bitti.
  async function anahtarlar() {
    const r = await sendBg({ type: "RUCU_TOKENLAR" });
    return (r && r.tokenlar) || [];
  }

  let _calisiyor = false;
  async function senkronCalistir(gorunur) {
    if (_calisiyor) { if (gorunur) flash("Zaten çalışıyor…"); return; }
    _calisiyor = true;
    try {
      const tokenlar = await anahtarlar();
      if (!tokenlar.length) { if (gorunur) flash("Senkron anahtarı yok — ⚙ Ayar'dan gir."); return; }

      // tüm tenant'ların hedeflerini topla (her hedef kendi token'ını taşır)
      const hedefler = [];
      for (const token of tokenlar) {
        const hr = await sendBg({ type: "RUCU_HEDEFLER", token });
        if (!hr.ok || !hr.data || !hr.data.ok) { if (gorunur) ekleSatir(`⚠ bir anahtar hedef veremedi: ${hr.error || hr.status || "?"}`); continue; }
        for (const x of hr.data.hedefler || []) {
          if (!x.icraDosyaNo) continue;
          const esas = extractEsas(x.icraDosyaNo); const m = esas.match(/^(\d{4})\/(\d+)$/);
          if (m) hedefler.push({ id: x.id, esasNo: esas, yil: m[1], sira: m[2], daire: tr(x.daire || ""), unvanKok: unvanAnahtar(x.alacakliUnvan || ""), token });
        }
      }
      if (!hedefler.length) { if (gorunur) flash("Senkron bekleyen dosya yok — her şey taze. 🎉"); _seritIlerleme = null; seritGuncelle(); return; }

      if (gorunur) durumYaz(`▶ ${hedefler.length} hedef (daire+esas) kimliğiyle sorgulanıyor… (${tokenlar.length} şirket)`);
      const birimler = await birimlerYukle();
      if (!birimler.length) { if (gorunur) flash("UYAP daire listesi alınamadı — oturum düşmüş olabilir, sayfayı yenileyin."); return; }

      // HIZ KURALI (en büyük kazanç): (daire+esas) → uyapDosyaId eşleşmesi DEĞİŞMEZ → kalıcı önbellek.
      // Cache'li dosyada arama + taraf doğrulaması ATLANIR (ilk turda yapılmıştı); ayrıntı hata verirse
      // (dosya taşındı/kapandı) cache düşürülüp tam arama yapılır. Ayrıca 'ozet' hash'i: durum/bakiye/
      // evrak değişmediyse SAFAHAT sorgusu atlanır (itiraz yeni evrak/durum değişimiyle gelir).
      const co = await st(["dosyaKimlik"]);
      const kimlikCache = co.dosyaKimlik || {};
      const t0 = Date.now();

      let ok = 0, sorunlu = 0;
      for (let i = 0; i < hedefler.length; i++) {
        const h = hedefler[i];
        const ortMs = i > 0 ? (Date.now() - t0) / i : 0;
        const kalanDk = i > 0 ? Math.max(1, Math.round(((hedefler.length - i) * ortMs) / 60000)) : null;
        _seritIlerleme = `${i + 1}/${hedefler.length} · ${h.esasNo}${kalanDk ? ` · kalan ~${kalanDk} dk` : ""}`; seritGuncelle();
        const satir = ekleSatir(`(${i + 1}/${hedefler.length}) ${h.esasNo} — ${h.daire || "daire?"}…`);
        const cKey = h.esasNo + "|" + norm(h.daire || "");
        try {
          const cHit = kimlikCache[cKey];
          let sonuc = cHit && cHit.dosyaId
            ? { eslesme: "OK", secilen: { dosyaId: cHit.dosyaId, birimAdi: cHit.birimAdi || h.daire, durum: "", durumKod: undefined }, cacheden: true }
            : await hedefEslestir(h, birimler);
          if (sonuc.eslesme !== "OK") {
            sorunlu++;
            // Bulunamayan/belirsiz/TARAF_UYUSMAZ dosya da programa RAPORLANIR — kör nokta kalmaz
            await sendBg({ type: "RUCU_SENKRON", token: h.token, body: senkronGovde(h, null, sonuc) });
            satirYaz(satir, `⚠ <b>${esc(h.esasNo)}</b>: ${esc(sonuc.eslesme)} — ${esc(sonuc.not || "")}`);
            await uyu(500); continue;
          }
          let f = sonuc.secilen;
          let rec = { uyapDosyaId: f.dosyaId, durum: f.durum || "", durumKod: f.durumKod, birim: f.birimAdi || h.daire, acilis: f.acilis || "" };
          satirYaz(satir, `⏳ <b>${esc(h.esasNo)}</b> (${esc(rec.birim)}): detay çekiliyor…${sonuc.cacheden ? " ⚡" : ""}`);
          await uyu(150); await ayrinti(f.dosyaId, rec);
          if (sonuc.cacheden && rec._ayrintiHata) {
            // önbellek bayat (dosya taşınmış/id değişmiş olabilir) → düşür, tam arama ile bir kez daha dene
            delete kimlikCache[cKey];
            sonuc = await hedefEslestir(h, birimler);
            if (sonuc.eslesme !== "OK") {
              sorunlu++;
              await sendBg({ type: "RUCU_SENKRON", token: h.token, body: senkronGovde(h, null, sonuc) });
              satirYaz(satir, `⚠ <b>${esc(h.esasNo)}</b>: ${esc(sonuc.eslesme)} — ${esc(sonuc.not || "")}`);
              await uyu(500); continue;
            }
            f = sonuc.secilen;
            rec = { uyapDosyaId: f.dosyaId, durum: f.durum || "", durumKod: f.durumKod, birim: f.birimAdi || h.daire, acilis: f.acilis || "" };
            await uyu(150); await ayrinti(f.dosyaId, rec);
          }
          // HESAP yalnız ayrıntı finansal veremediyse (çoğu dosyada ayrıntı yeterli → 1 istek tasarrufu)
          if (rec.toplamAlacak == null || rec.tahsilat == null) { await uyu(150); await hesap(f.dosyaId, rec); }
          await uyu(150); await evrakListe(f.dosyaId, rec);
          rec.durumTahmin = durumTahmin(rec.durumKod, rec.durum);
          // SAFAHAT yalnız özet değiştiyse (durum/bakiye/evrak aynıysa itiraz araması gereksiz)
          const ozet = [rec.durum, rec.toplamAlacak, rec.tahsilat, rec.bakiye, rec.evrak ? rec.evrak.length : 0, rec.sonEvrakTarihi].join("|");
          const degisti = !cHit || cHit.ozet !== ozet;
          if (degisti) { await uyu(150); await safahat(f.dosyaId, rec); }
          const sr = await sendBg({ type: "RUCU_SENKRON", token: h.token, body: senkronGovde(h, rec, sonuc) });
          let evN = 0;
          if (degisti && rec.evrak && rec.evrak.length) evN = await evrakYukle(h, rec);
          if (sr.ok && sr.data && sr.data.ok) {
            ok++;
            kimlikCache[cKey] = { dosyaId: f.dosyaId, birimAdi: rec.birim, ozet, t: Date.now() };
            const para = rec.bakiye != null ? ` · bakiye ${fmtTL(rec.bakiye)}` : "";
            satirYaz(satir, `✅ <b>${esc(h.esasNo)}</b> (${esc(rec.birim)}): ${esc(rec.durumTahmin)}${para}${evN ? ` · 📤 ${evN} yeni evrak` : ""}${!degisti ? " · değişiklik yok ⚡" : ""}${sonuc.not ? ` <span class="rucu-mut">${esc(sonuc.not)}</span>` : ""}`);
          } else {
            sorunlu++;
            satirYaz(satir, `❌ <b>${esc(h.esasNo)}</b>: program yazımı reddetti (${esc(String((sr.data && (sr.data.error || sr.data.raw)) || sr.error || sr.status))})`);
          }
        } catch (e) {
          sorunlu++;
          try { await sendBg({ type: "RUCU_SENKRON", token: h.token, body: senkronGovde(h, null, { eslesme: "HATA", not: e.message }) }); } catch (e2) {}
          satirYaz(satir, `❌ <b>${esc(h.esasNo)}</b>: ${esc(e.message || "hata")}`);
        }
        await uyu(500); // UYAP'a nazik (429/5xx görülürse otomatik 3x yavaşlar)
      }
      await stSet({ dosyaKimlik: kimlikCache, sonOtoSync: Date.now(), sonRapor: { t: new Date().toISOString(), ok, sorunlu, toplam: hedefler.length } });
      if (gorunur) flash(`Bitti: ${ok} senkron, ${sorunlu} sorunlu (sorunlular da programa raporlandı).`);
    } finally { _calisiyor = false; _seritIlerleme = null; seritGuncelle(); }
  }

  async function otoSenkron() {
    const tokenlar = await anahtarlar();
    if (!tokenlar.length) return;
    const o = await st(["sonOtoSync"]);
    if (Date.now() - (o.sonOtoSync || 0) < 25 * 60000) return; // throttle
    await senkronCalistir(false);
  }

  // ═══════════════ TAKİP AÇ KOPİLOTU (Faz 2) — payload'ı kur, harçla doğrula, AVUKAT gönderir ═══════════════
  // Keşif kaydı 2026-07-06 (uyap-kesif-*.json) uçları kanıtladı. AKIŞ:
  //   program /takip-hedefler → dosya seç → UYAP sorguları (adliye · kişi+MERNİS · kurum · IBAN)
  //   → payload (tevziyle BİREBİR aynı gövde) → icra_harc_hesaplama = KURU PROVA (hiçbir şey
  //   yaratmaz; sunucu payload'ı kabul ediyorsa harç döker) → ÖZET EKRANI → avukat "Gönder"
  //   → icra_takip_tevzi_islemleri → sonuç programa yazılır (/takip-tevzi).
  // Harç ödemesi + esas no eşleştirmesi MANUEL kalır (karar: kopilot modeli, son söz avukatta).
  // EMNİYET: tek dosya; MERNİS adresi yoksa / ölüm kaydı varsa / kurum unvanı uyuşmazsa DURUR;
  // program tevzi'li dosyayı listeden düşürür (çift açma koruması).
  const rid = () => Math.random().toString(36).slice(2, 10);
  const ggaayyyy = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
  let _takipMesgul = false;
  let _takipHedefler = []; // [{ h, token, si }]

  async function takipAcListe() {
    if (_takipMesgul) return;
    durumYaz("Takip açılabilecek dosyalar programdan çekiliyor…");
    const tokenlar = await anahtarlar();
    if (!tokenlar.length) { durumYaz("Senkron anahtarı yok — ⚙ Ayar."); return; }
    _takipHedefler = [];
    for (let si = 0; si < tokenlar.length; si++) {
      const r = await sendBg({ type: "RUCU_TAKIP_HEDEFLER", token: tokenlar[si] });
      if (r.ok && r.data && r.data.ok && Array.isArray(r.data.hedefler)) {
        for (const h of r.data.hedefler) _takipHedefler.push({ h, token: tokenlar[si], si });
      } else if (r.status === 404) {
        durumYaz("Program /api/uyap/takip-hedefler tanımıyor — program güncellenmemiş olabilir (deploy?).");
        return;
      }
    }
    takipListeCiz();
  }

  function takipListeCiz() {
    if (!_takipHedefler.length) { durumYaz("Takip açılabilecek dosya yok. (Koşul: durum <b>Takibe Hazır</b> + avukat onayı + icra no boş + tevzi edilmemiş.)"); return; }
    const satirlar = _takipHedefler.map(({ h, si }, i) => {
      const borclu = (h.borclular || []).map((b) => b.adUnvan).join(", ") || "—";
      const engel = (h.engeller || []).length;
      const dugme = engel
        ? `<span style="color:#b91c1c;font-size:11px">⛔ ${esc(h.engeller.join(" · "))}</span>`
        : `<button class="rucu-btn" data-takip="${i}" style="background:#166534;padding:4px 10px;font-size:12px">Hazırla</button>`;
      const uyari = (h.uyarilar || []).length ? `<div style="color:#b45309;font-size:11px;margin-top:2px">⚠ ${esc(h.uyarilar.join(" · "))}</div>` : "";
      return `<div style="padding:7px 0;border-bottom:1px solid #f2f4f7">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <b>${esc(h.hukukDosyaNo || h.id.slice(0, 8))}</b>
          <span class="rucu-mut">${esc(borclu)}</span>
          <span style="margin-left:auto">${dugme}</span>
        </div>
        <div class="rucu-mut" style="margin-top:2px">${esc(h.adliye ? h.adliye.ad + " Adliyesi" : "adliye ?")} · anapara ${fmtTL(h.alacak && h.alacak.anapara)} + faiz ${fmtTL(h.alacak && h.alacak.islemisFaiz)}${_takipHedefler.some((x) => x.si !== si) ? ` · şirket ${si + 1}` : ""}</div>
        ${uyari}
      </div>`;
    });
    durumYaz(`<b>⚖ Takip Aç — hazır dosyalar (${_takipHedefler.length})</b><div>${satirlar.join("")}</div>
      <div class="rucu-mut" style="margin-top:6px">"Hazırla": UYAP sorgularıyla payload kurulur ve <b>harç hesabıyla doğrulanır</b> — bu adım hiçbir şey oluşturmaz. Gönderim ayrı düğmeyle, onayınla olur.</div>`);
    durumEl.querySelectorAll("[data-takip]").forEach((b) => b.addEventListener("click", () => takipHazirla(Number(b.dataset.takip))));
  }

  async function takipHazirla(i) {
    if (_takipMesgul) return;
    const kayit = _takipHedefler[i];
    if (!kayit) return;
    const { h, token } = kayit;
    if ((h.engeller || []).length) { flash("Bu dosyada engel var: " + h.engeller.join(" · ")); return; }
    _takipMesgul = true;
    const log = (m) => durumYaz(`<b>⚖ ${esc(h.hukukDosyaNo || "")}</b> hazırlanıyor…<br>${m}`);
    try {
      // 1 · adliye çöz (il plaka kodu → adliye listesi → ada göre eşle)
      log("1/6 · adliye çözülüyor…");
      const adliyeler = await apiPost("/icraTakipAdliyeler.ajx", { ilKodu: h.adliye.ilKodu });
      if (!Array.isArray(adliyeler)) throw new Error("adliye listesi alınamadı");
      const hedefAd = trAscii(h.adliye.ad);
      let adliye = adliyeler.find((a) => trAscii(a.adliyeIsmi) === hedefAd + " adliye" || trAscii(a.adliyeIsmi) === hedefAd + " adliyesi" || trAscii(a.adliyeIsmi) === hedefAd);
      if (!adliye) adliye = adliyeler.find((a) => trAscii(a.adliyeIsmi).startsWith(hedefAd));
      if (!adliye) throw new Error(`"${h.adliye.ad}" adliyesi UYAP listesinde bulunamadı (${adliyeler.length} aday)`);
      await uyu(200);
      const acilabilir = await apiPost("/icraTakipDosyaAcilabilirMi.ajx", { birimId: adliye.adliyeBirimID });
      if (!acilabilir || String(acilabilir.message) !== "true") throw new Error(`${adliye.adliyeIsmi}: dosya açılamaz (${(acilabilir && acilabilir.message) || "?"})`);

      // 2 · roller + takip şekli/mahiyet adları (canlı — metin değişirse eskimesin)
      log("2/6 · takip türü/şekli doğrulanıyor…");
      const roller = await apiPost("/icraTarafRolTurleri.ajx", {});
      const rolBorclu = (Array.isArray(roller) && roller.find((r) => r.rolID === 22)) || { rolID: 22, rolAdi: "BORÇLU VE MÜFLİS", sanikStatusu: "E", davaliDavaciGrubu: "L" };
      const rolAlacakli = (Array.isArray(roller) && roller.find((r) => r.rolID === 21)) || { rolID: 21, rolAdi: "ALACAKLI", sanikStatusu: "H", davaliDavaciGrubu: "N" };
      await uyu(150);
      const yollar = await apiPost("/icra_takip_yolu.ajx", { takipTuru: 1 });
      const yolAd = (Array.isArray(yollar) && (yollar.find((y) => y.value === 0) || {}).name) || "Genel Haciz Yoluyla Takip";
      const sekiller = await apiPost("/icra_takip_sekli.ajx", { takipTuru: 1, takipYolu: 0 });
      const sekilAd = (Array.isArray(sekiller) && (sekiller.find((s) => s.value === 0) || {}).name) || " ÖRNEK: 7 İlamsız Takiplerde Ödeme Emri - Eski No: 49 ";
      const mahiyetler = await apiPost("/icra_takip_mahiyetleri.ajx", { takipTuru: 1, takipYolu: 0, takipSekli: 0 });
      const mahiyet = (Array.isArray(mahiyetler) && (mahiyetler.find((m) => trAscii(m.name) === "diger") || mahiyetler.find((m) => m.value === 1407))) || { name: "Diğer", value: 1407 };

      // 3 · borçlular: MERNİS kişi sorgusu + adres kontrolü (adres yoksa/ölüm kaydı varsa DUR)
      const uyarilar = [...(h.uyarilar || [])]; // program uyarıları (örn. eksik evrak) özete taşınır
      const borcluTaraflar = [];
      for (let bi = 0; bi < h.borclular.length; bi++) {
        const b = h.borclular[bi];
        log(`3/6 · borçlu ${bi + 1}/${h.borclular.length} MERNİS sorgusu…`);
        await uyu(250);
        const kisi = await apiPost("/kisiSorgula.ajx", { tcKimlikNo: b.tc, tarafSifati: 22 });
        if (!kisi || !kisi.kisiKurumID) throw new Error(`borçlu ${b.adUnvan}: MERNİS kişi sorgusu boş döndü (TC ${b.tc})`);
        if (kisi.olumKaydi) throw new Error(`borçlu ${b.adUnvan}: ÖLÜM KAYDI var — mirasçılara takip gerekir, manuel değerlendir`);
        // maskeli ad ön-teyidi ("ZE****" → programdaki adla ilk harfler uyuşmalı; uymazsa uyarı — sert durdurma değil)
        const maskesiz = trAscii(String(kisi.adi || "").replace(/\*/g, ""));
        if (maskesiz && !trAscii(b.adUnvan).startsWith(maskesiz.slice(0, 2))) uyarilar.push(`borçlu adı uyuşmuyor olabilir: UYAP "${kisi.adi} ${kisi.soyadi}" ↔ program "${b.adUnvan}"`);
        await uyu(200);
        // MERNİS adres kontrolü — UYAP entegrasyonu nazlı olabiliyor (keşifte e-Tebligat aynı turda
        // "entegrasyon hatası" vermişti). true değilse BİR KEZ daha dene; yine olmazsa false (gerçekten
        // kayıt yok) ile hata yanıtını (geçici entegrasyon sorunu) AYIRT ederek raporla.
        const mernisSor = () => apiPost("/mtsMernisAdresiKontrol_brd.ajx", { tcKimlikNo: b.tc });
        let mernis = null;
        try { mernis = await mernisSor(); } catch (e) { mernis = { hata: e.message }; }
        if (mernis !== true && String(mernis) !== "true") {
          log(`3/6 · borçlu ${bi + 1} MERNİS kontrolü ilk denemede doğrulanamadı — tekrar deneniyor…`);
          await uyu(1500);
          try { mernis = await mernisSor(); } catch (e) { mernis = { hata: e.message }; }
        }
        if (mernis !== true && String(mernis) !== "true") {
          const ham = typeof mernis === "object" ? JSON.stringify(mernis).slice(0, 160) : String(mernis);
          const neden = mernis === false || String(mernis) === "false"
            ? "MERNİS'te kayıtlı yerleşim yeri görünmüyor (adres beyanı olmayabilir) — UYAP taraf ekleme ekranından elle teyit et"
            : `MERNİS kontrolü doğrulanamadı — entegrasyon hatası olabilir, birazdan tekrar dene (ham yanıt: ${ham})`;
          throw new Error(`borçlu ${b.adUnvan}: ${neden}`);
        }
        borcluTaraflar.push({
          id: rid(), tarafSifati: rolBorclu, sorguTuru: 0, tarafTuru: "KISI", isVekil: false,
          tarafAdi: `${kisi.adi || ""} ${kisi.soyadi || ""}`.trim(),
          temelBilgileri: { ...kisi, yabanciUyruklumu: false, uyruk: 1, cepTelefonu: "" },
          sucBilgisi: [], tazminatBilgisi: [],
          mernisAdresiKullan: true, eTebligatAdresiKullan: false,
        });
      }

      // 4 · alacaklı kurum (MERSİS) + adres + büro IBAN'ı — unvan uyuşmazsa DUR (yanlış şirkete takip açılmaz)
      log("4/6 · alacaklı kurum + IBAN…");
      await uyu(250);
      const kurumlar = await apiPost("/kurumSorgula.ajx", { mersisNo: h.alacakli.mersis });
      const kurum = Array.isArray(kurumlar) ? (kurumlar.find((x) => x.faaliyetDurumu === 1) || kurumlar[0]) : null;
      if (!kurum || !kurum.kisiKurumID) throw new Error("alacaklı kurum MERSİS ile bulunamadı: " + h.alacakli.mersis);
      const kok = unvanAnahtar(h.alacakli.unvan);
      if (kok && !trAscii(kurum.kurumAdi).includes(kok)) throw new Error(`kurum unvanı uyuşmuyor: UYAP "${kurum.kurumAdi}" ↔ program "${h.alacakli.unvan}"`);
      await uyu(200);
      const madres = await apiPost("/get_kurum_mersis_adresi.ajx", { mersisNo: h.alacakli.mersis, vergiNo: kurum.vergiNo || h.alacakli.vergiNo || "" });
      if (!madres || madres.resultCode !== 0 || !madres.adres) throw new Error("alacaklının MERSİS adresi alınamadı");
      const adresEntry = { ilKodu: madres.ilKodu, ilAdi: madres.ilAdi, ilceKodu: madres.ilceKodu, ilceAdi: madres.ilceAdi, adres: madres.adres, adresTuru: "ADRTR00011", adresTuruAciklama: "Mersis Adresi", id: 0, isSelected: true };
      await uyu(200);
      const ibanY = await apiPost("/kayitliIbanListesi.ajx", {});
      const ibanlar = ibanY && Array.isArray(ibanY.value) ? ibanY.value.filter((x) => x.hesapAktifmi === "E") : [];
      const iban = ibanlar.find((x) => x.hesapGenel) || ibanlar[0];
      if (!iban) throw new Error("UYAP'ta kayıtlı büro IBAN'ı yok — portalda bir kez tanımlayın (Kayıtlı IBAN)");
      const alacakliTaraf = {
        id: rid(), tarafSifati: rolAlacakli, sorguTuru: 0, tarafTuru: "KURUM", isVekil: true,
        temelBilgileri: { ...kurum, cepTelefonu: "" },
        tarafAdi: kurum.kurumAdi,
        sucBilgisi: [], tazminatBilgisi: [],
        adresList: [adresEntry], adresBilgisi: adresEntry,
        iban: { ...iban, isVekilIban: true },
        mernisAdresiKullan: false, eTebligatAdresiKullan: false,
        hesapBilgisi: { ...iban, isVekilIban: true },
        isVekilIban: true,
      };

      // 5 · payload — keşif kaydındaki tevzi gövdesiyle birebir aynı yapı
      log("5/6 · payload kuruluyor…");
      const tarafList = [...borcluTaraflar, alacakliTaraf];
      const tumTarafIdx = tarafList.map((_, ix) => ix);
      const kalemler = [{
        selectedTarafHashKeyList: tumTarafIdx, selectedTarafList: tumTarafIdx.join(","),
        temelBilgileri: {
          alacakTutariTL: h.alacak.anapara, alacakTutari: h.alacak.anapara,
          selectedParaBirimi: "PRBRMTL", selectedParaBirimiAciklama: "TL-Türk Lirası", selectedParaBirimiKod: "TL-Türk Lirası",
          KDV: false, aciklama: "Asıl Alacak",
          selectedAlacakKalemKodu: { alacakKalemKodAciklama: "Diğer Asıl Alacağı", alacakKalemKod: 3 },
        },
        faizBilgileri: {
          selectedFaizTuru: { tktId: "FAIZT00002", kod: "00002", aciklama: "Adi Kanuni Faiz", kodTuru: "FAIZT" },
          faizOraniKurus: 0, selectedFaizSureTipi: "2", selectedFaizSureTipiAdi: "Yıllık",
        },
        id: 0,
      }];
      if (h.alacak.islemisFaiz > 0) kalemler.push({
        selectedTarafHashKeyList: tumTarafIdx, selectedTarafList: tumTarafIdx.join(","),
        temelBilgileri: {
          alacakTutariTL: h.alacak.islemisFaiz, alacakTutari: h.alacak.islemisFaiz,
          selectedParaBirimi: "PRBRMTL", selectedParaBirimiAciklama: "TL-Türk Lirası", selectedParaBirimiKod: "TL-Türk Lirası",
          KDV: false, aciklama: "İşlemiş Faiz",
          selectedAlacakKalemKodu: { alacakKalemKodAciklama: "Diğer Faiz Alacağı", alacakKalemKod: 6 },
        },
        faizBilgileri: {},
        id: 1,
      });
      const idb = {
        selectedIl: { il: h.adliye.ilKodu, ad: h.adliye.il, ilceler: [], kodAciklamaCiksin: false, bolgeId: 0, buyuksehir: false, takbisIlKodu: 0 },
        kotaKullanimSekliText: "Avukat", kotaKullanimSekli: 0,
        selectedAdliye: adliye, adliyeBirimId: adliye.adliyeBirimID, adliyeIsmi: adliye.adliyeIsmi,
        selectedTakipTuru: { name: "İlamsız Takip", value: 1 }, takipTuru: 1, takipTuruText: "İlamsız Takip",
        selectedTakipSekli: { name: sekilAd, value: 0 }, takipSekli: 0, takipSekliText: sekilAd,
        selectedTakipYolu: { name: yolAd, value: 0 }, takipYolu: 0, takipYoluText: yolAd,
        dosyaTevziTipiBanka: false, dosyaTevziTipiGayrimenkul: false,
        dosyaAciklama_48_4: "Alacağın tahsili tarihine kadar %...... faizi masraf ve vekalet ücreti ile tahsili,kısmi ödemelerde BK.100 e göre yapılmasını talep ederim.",
        dosyaAciklama_48_9: "Haciz Yolu",
        ipotekRehinAciklama: "",
        selectedTakipMahiyeti: mahiyet.value, mahiyetId: mahiyet.value, mahiyetText: mahiyet.name,
        selectedDosyaKriterleri: [{ kod: "bk", mahiyetAdi: "B.K. 100.Madde", zorunlu: true, degistirilemez: true }],
        dosyaKriterList: "bk", dosyaKriterTextList: "B.K. 100.Madde",
        showHacizTahliyeValue: false, hacizOnayValue: false, tahliyeOnayValue: false,
      };
      const ilamsiz = [{
        ilamsizTipi: "diger", alacakNo: "", alacakTarihi: ggaayyyy(h.alacak.faizBaslangic),
        meblagi: h.alacak.anapara, meblagTuruAciklama: "TL-Türk Lirası", meblagTuru: "PRBRMTL",
        aciklama: h.aciklama, id: rid(), alacakKalemleri: kalemler,
      }];
      const govde = {
        IcraDosyaBilgileri: JSON.stringify(idb),
        TarafList: JSON.stringify(tarafList),
        IlamsizList: JSON.stringify(ilamsiz),
        IlamliList: "[]",
        TahsilatList: "[]",
      };

      // 6 · KURU PROVA: harç hesabı — sunucu payload'ı sindiremezse burada patlar, hiçbir şey oluşmaz
      log("6/6 · harç hesabı (kuru prova)…");
      await uyu(300);
      const harc = await apiPost("/icra_harc_hesaplama_islemleri.ajx", govde);
      if (!Array.isArray(harc) || !Array.isArray(harc[0])) throw new Error("harç hesabı beklenmedik yanıt verdi — payload reddedilmiş olabilir, GÖNDERME iptal");
      const harcKalemleri = harc[0];
      const harcToplam = Number(harc[1]) || harcKalemleri.reduce((t, x) => t + (Number(x.hesapMiktar) || 0), 0);

      takipOzetCiz({ h, token, govde, adliye, tarafList, harcKalemleri, harcToplam, uyarilar });
    } catch (e) {
      durumYaz(`❌ <b>${esc(h.hukukDosyaNo || "")}</b> hazırlanamadı: ${esc(e.message)}<br><button class="rucu-btn sec" id="rucu-takip-geri" style="margin-top:6px">← Listeye dön</button>`);
      const g = durumEl.querySelector("#rucu-takip-geri");
      if (g) g.addEventListener("click", takipListeCiz);
    } finally {
      _takipMesgul = false;
    }
  }

  function takipOzetCiz(ctx2) {
    const { h, adliye, tarafList, harcKalemleri, harcToplam, uyarilar } = ctx2;
    const taraflar2 = tarafList.map((t) => `<div>• ${esc(t.tarafSifati.rolAdi)}: <b>${esc(t.tarafAdi)}</b>${t.tarafTuru === "KISI" ? " (MERNİS adresi kullanılacak)" : ""}</div>`).join("");
    const harcSatir = harcKalemleri.map((x) => `<div class="rucu-mut">• ${esc(x.harcMasrafAdi || "?")}: ${fmtTL(x.hesapMiktar)}</div>`).join("");
    const uyariHtml = uyarilar.length ? `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:6px 9px;margin:6px 0;font-size:12px">⚠ ${uyarilar.map(esc).join("<br>⚠ ")}</div>` : "";
    durumYaz(`
      <b>⚖ ÖZET — ${esc(h.hukukDosyaNo || "")} · son kontrol sende</b>
      <div style="margin-top:6px">${taraflar2}</div>
      <div style="margin-top:4px">Adliye: <b>${esc(adliye.adliyeIsmi)}</b> (daireyi tevzi atar) · Takip: Örnek 7 İlamsız / Genel Haciz</div>
      <div>Anapara <b>${fmtTL(h.alacak.anapara)}</b> + İşlemiş Faiz <b>${fmtTL(h.alacak.islemisFaiz)}</b> = <b>${fmtTL(h.alacak.toplam)}</b> · alacak tarihi ${esc(ggaayyyy(h.alacak.faizBaslangic))} · Adi Kanuni Faiz</div>
      <div class="rucu-mut" style="margin-top:4px;max-height:70px;overflow:auto;border:1px solid #eef1f4;border-radius:6px;padding:4px 7px">${esc(h.aciklama).replace(/\n/g, "<br>")}</div>
      ${uyariHtml}
      <div style="margin-top:6px"><b>Harç dökümü (ödeme MANUEL — tevziden sonra UYAP'tan öde):</b>${harcSatir}<div>Toplam: <b>${fmtTL(harcToplam)}</b></div></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="rucu-btn" id="rucu-tevzi-gonder" style="background:#b91c1c;font-size:13px">⚖ UYAP'a Gönder (TEVZİ)</button>
        <button class="rucu-btn sec" id="rucu-tevzi-iptal">Vazgeç</button>
      </div>`);
    durumEl.querySelector("#rucu-tevzi-iptal").addEventListener("click", takipListeCiz);
    durumEl.querySelector("#rucu-tevzi-gonder").addEventListener("click", () => takipGonder(ctx2));
  }

  async function takipGonder(ctx2) {
    if (_takipMesgul) return;
    const { h, token, govde } = ctx2;
    const tamam = window.confirm(
      `GERÇEK İCRA TAKİBİ TEVZİSİ oluşturulacak:\n\n${h.hukukDosyaNo || h.id}\nToplam: ${h.alacak.toplam} TL\n\n` +
      "Bu işlem geri alınamaz (tevzi kaydı doğar; harç ödemesi sana kalır). Devam?"
    );
    if (!tamam) return;
    _takipMesgul = true;
    durumYaz("⚖ Tevzi gönderiliyor…");
    try {
      const r = await apiPost("/icra_takip_tevzi_islemleri.ajx", govde);
      if (!r || !r.birimAdi) throw new Error("tevzi yanıtı beklenmedik: " + JSON.stringify(r).slice(0, 200));
      const tevzi = {
        birimAdi: r.birimAdi, birimID: r.birimID || null, dosyaAcilisTarihi: r.dosyaAcilisTarihi || null,
        takibeEsasTutar: r.takibeEsasTutar != null ? Number(r.takibeEsasTutar) : null,
        uyapDosyaId: r.dosyaId ? String(r.dosyaId).replace(/"/g, "") : null,
        harcToplam: ctx2.harcToplam,
      };
      const pr = await sendBg({ type: "RUCU_TAKIP_TEVZI", token, body: { dosyaId: h.id, tevzi } });
      const programNot = pr.ok && pr.data && pr.data.ok ? "programa yazıldı ✓" : `programa YAZILAMADI (${esc(String((pr.data && pr.data.error) || pr.error || pr.status))}) — dosya notuna elle işle!`;
      // Dayanak klasörü OTOMATİK iner (vekaletname + poliçe + tutanaklar + beyan + şartlı ekspertiz + dekont + foto + özet)
      const pk = await sendBg({ type: "RUCU_TAKIP_PAKET", token, dosyaId: h.id, ad: h.hukukDosyaNo || h.id });
      const paketNot = pk && pk.ok
        ? `📁 Dayanak klasörü iniyor: <b>İndirilenler\\Rucu-Takip-Paketleri\\</b>${esc(h.hukukDosyaNo || h.id)} - icra paketi.zip`
        : `📁 Dayanak klasörü İNDİRİLEMEDİ (${esc(String((pk && pk.error) || "?"))}) — programda dosyanın İcra sekmesinden elle indir.`;
      durumYaz(`✅ <b>TEVZİ TAMAM — ${esc(r.birimAdi)}</b><br>
        Takibe esas: <b>${fmtTL(r.takibeEsasTutar)}</b> · ${esc(programNot)}<br>
        ${paketNot}<br><br>
        <b>Sıradaki (manuel):</b><br>
        1. UYAP → dosya ödeme işlemleri → <b>harç/masraf avansını öde</b> (~${fmtTL(ctx2.harcToplam)}).<br>
        2. Esas no oluşunca programda <b>"Takip Açıldı"</b> formuna daire+esas no'yu gir → senkron izlemeye alır.<br><br>
        <button class="rucu-btn sec" id="rucu-takip-geri2">← Listeye dön</button>`);
      flash(`Tevzi: ${r.birimAdi} — harç ödemesini unutma!`);
      const g = durumEl.querySelector("#rucu-takip-geri2");
      if (g) g.addEventListener("click", takipAcListe);
    } catch (e) {
      durumYaz(`❌ Tevzi başarısız: ${esc(e.message)}<br>Hiçbir kayıt oluşmamış olabilir — UYAP "İcra Tevzi İşlemlerim" ekranından kontrol et.<br><button class="rucu-btn sec" id="rucu-takip-geri3" style="margin-top:6px">← Listeye dön</button>`);
      const g = durumEl.querySelector("#rucu-takip-geri3");
      if (g) g.addEventListener("click", takipListeCiz);
    } finally {
      _takipMesgul = false;
    }
  }

  // ═══════════════ mini panel (durum + tetik + ayar) + CANLILIK ŞERİDİ ═══════════════
  const CSS = `
  #rucu-serit{position:fixed;left:0;right:0;bottom:0;z-index:2147482999;height:26px;display:flex;align-items:center;gap:8px;padding:0 12px;font:12px system-ui;color:#fff;cursor:pointer;user-select:none;box-shadow:0 -2px 8px rgba(0,0,0,.15)}
  #rucu-serit.s-ok{background:#0f766e}
  #rucu-serit.s-run{background:#b45309}
  #rucu-serit.s-err{background:#b91c1c}
  #rucu-serit.s-idle{background:#475569}
  #rucu-serit .rs-dot{width:8px;height:8px;border-radius:50%;background:#fff;flex:none}
  #rucu-serit.s-run .rs-dot{animation:rucupulse 1s infinite}
  @keyframes rucupulse{0%,100%{opacity:1}50%{opacity:.3}}
  #rucu-serit .rs-txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #rucu-fab{position:fixed;right:14px;bottom:38px;z-index:2147483000;width:46px;height:46px;border-radius:50%;background:#0f766e;color:#fff;font:700 17px/46px system-ui;text-align:center;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);user-select:none}
  #rucu-panel{position:fixed;right:14px;bottom:92px;z-index:2147483000;width:460px;max-height:70vh;overflow:auto;background:#fff;border:1px solid #d5dbe3;border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,.22);font:13px system-ui;display:none;color:#111}
  #rucu-panel.open{display:block}
  .rucu-hd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #eef1f4;font-weight:700}
  .rucu-hd .v{font-weight:400;color:#889;font-size:11px}
  .rucu-bd{padding:10px 12px}
  .rucu-row{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
  .rucu-btn{border:0;border-radius:8px;background:#0f766e;color:#fff;font:600 12.5px system-ui;padding:7px 12px;cursor:pointer}
  .rucu-btn.sec{background:#eef1f4;color:#111}
  .rucu-mut{color:#66707c;font-size:11.5px}
  .rucu-log{border-top:1px dashed #e3e7ec;margin-top:6px;padding-top:6px}
  .rucu-log>div{padding:3px 0;border-bottom:1px solid #f2f4f7;font-size:12px}
  .rucu-flash{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:7px 10px;margin-bottom:8px;font-size:12.5px}`;
  let panel = null, logEl = null, durumEl = null, serit = null, seritTxt = null;
  let _seritIlerleme = null; // çalışırken "3/12 · 2026/4186" gibi canlı metin

  // ── canlılık şeridi: "program bağlı mı, en son ne zaman çalıştı, sıradaki oto ne zaman" tek bakışta ──
  async function seritGuncelle() {
    if (!serit) return;
    if (_seritIlerleme) { serit.className = "s-run"; seritTxt.innerHTML = `KonsLaw · senkron çalışıyor — ${esc(_seritIlerleme)}`; return; }
    const o = await st(["senkronToken", "senkronTokenlar", "sonOtoSync", "sonRapor"]);
    const anahtarSayisi = (Array.isArray(o.senkronTokenlar) && o.senkronTokenlar.length) ? o.senkronTokenlar.length : (o.senkronToken ? 1 : 0);
    if (!anahtarSayisi) { serit.className = "s-err"; seritTxt.innerHTML = `KonsLaw <b>bağlı değil</b> — senkron anahtarı girilmedi · tıkla → ⚙ Ayar`; return; }
    const son = o.sonOtoSync || 0;
    const r = o.sonRapor;
    const dkOnce = son ? Math.round((Date.now() - son) / 60000) : null;
    const siradaki = son ? Math.max(0, 30 - (dkOnce ?? 0)) : 0;
    const rapor = r ? ` · ${r.ok} dosya ✓${r.sorunlu ? ` · <b>${r.sorunlu} sorunlu</b>` : ""}` : "";
    const sirket = anahtarSayisi > 1 ? ` · ${anahtarSayisi} şirket` : "";
    if (dkOnce == null) { serit.className = "s-idle"; seritTxt.innerHTML = `KonsLaw hazır${sirket} — henüz senkron koşmadı · birazdan otomatik başlar (ya da tıkla → ▶)`; return; }
    serit.className = dkOnce > 45 ? "s-idle" : "s-ok";
    seritTxt.innerHTML = `KonsLaw aktif${sirket} · son senkron <b>${dkOnce} dk önce</b>${rapor} · sıradaki oto ~${siradaki} dk`;
  }

  function buildUi() {
    if (panel || !document.body) return;
    const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
    // alt şerit — otomasyonun YAŞADIĞINI gösterir; tıklayınca panel açılır
    serit = document.createElement("div"); serit.id = "rucu-serit"; serit.className = "s-idle";
    serit.innerHTML = `<span class="rs-dot"></span><span class="rs-txt">Rücu Takip yükleniyor…</span>`;
    seritTxt = serit.querySelector(".rs-txt");
    serit.addEventListener("click", togglePanel);
    document.body.appendChild(serit);
    seritGuncelle();
    setInterval(seritGuncelle, 30000); // 30 sn'de bir tazele ("X dk önce" güncel kalsın)
    const fab = document.createElement("div"); fab.id = "rucu-fab"; fab.textContent = "R"; fab.title = "Rücu Takip";
    fab.addEventListener("click", togglePanel);
    document.body.appendChild(fab);
    panel = document.createElement("div"); panel.id = "rucu-panel";
    panel.innerHTML = `
      <div class="rucu-hd">Rücu Takip · UYAP Senkron <span class="v">v1.6.0 · (daire+esas) kimlikli · ⚖kopilot</span></div>
      <div class="rucu-bd">
        <div class="rucu-row">
          <button class="rucu-btn" id="rucu-run">▶ Şimdi Senkronla</button>
          <button class="rucu-btn" id="rucu-takipac" style="background:#166534">⚖ Takip Aç</button>
          <button class="rucu-btn" id="rucu-masraf" style="background:#b45309">💰 Masraf Tara</button>
          <button class="rucu-btn" id="rucu-aralik" style="background:#b45309">📅 Aralık Çek</button>
          <button class="rucu-btn" id="rucu-kesif" style="background:#6d28d9">🎬 Keşif Kaydı</button>
          <button class="rucu-btn sec" id="rucu-cfg">⚙ Ayar</button>
          <button class="rucu-btn sec" id="rucu-diag">🧪 Tanı</button>
        </div>
        <div id="rucu-durum" class="rucu-mut">▶ hedefleri (icra dairesi + esas no) kimliğiyle sorgular; bulamadığını da programa <b>raporlar</b>. 30 dk'da bir otomatik.<br>⚖ <b>Takip Aç</b>: Takibe Hazır + avukat onaylı dosyanın UYAP tevzi payload'ını kurar, harç hesabıyla doğrular, ÖZETİ gösterir — <b>gönderim senin onayınla</b>; harç ödemesi manuel.<br>💰 <b>Ödeme İşlemlerim</b>'i listelediğin an kalemler OTOMATİK programa yazılır (💰 = önizlemeli manuel); 📅 = öğrenilen şablonla tarih aralığı.<br>🎬 <b>Keşif Kaydı</b>: yeni bir akışı bir kez elle yürüt, tüm trafik JSON olarak insin.</div>
        <div class="rucu-log" id="rucu-log"></div>
      </div>`;
    document.body.appendChild(panel);
    logEl = panel.querySelector("#rucu-log");
    durumEl = panel.querySelector("#rucu-durum");
    panel.querySelector("#rucu-run").addEventListener("click", () => senkronCalistir(true));
    panel.querySelector("#rucu-takipac").addEventListener("click", takipAcListe);
    panel.querySelector("#rucu-masraf").addEventListener("click", masrafTara);
    panel.querySelector("#rucu-aralik").addEventListener("click", masrafAralikCek);
    panel.querySelector("#rucu-kesif").addEventListener("click", kesifToggle);
    panel.querySelector("#rucu-cfg").addEventListener("click", ayarSor);
    panel.querySelector("#rucu-diag").addEventListener("click", tani);
    kesifButonTazele();
  }
  function togglePanel() { buildUi(); panel.classList.toggle("open"); }
  function flash(msg) { buildUi(); const d = document.createElement("div"); d.className = "rucu-flash"; d.textContent = msg; panel.querySelector(".rucu-bd").prepend(d); setTimeout(() => d.remove(), 8000); }
  function durumYaz(html) { buildUi(); durumEl.innerHTML = html; }
  function ekleSatir(text) { buildUi(); const d = document.createElement("div"); d.textContent = text; logEl.prepend(d); return d; }
  function satirYaz(el, html) { el.innerHTML = html; }

  async function ayarSor() {
    const cur = await st(["programBase", "senkronTokenlar", "senkronToken"]);
    const base = window.prompt("Program adresi:", cur.programBase || "https://konslaw.app");
    if (base == null) return;
    const eskiListe = Array.isArray(cur.senkronTokenlar) && cur.senkronTokenlar.length ? cur.senkronTokenlar : (cur.senkronToken ? [cur.senkronToken] : []);
    const girdi = window.prompt(
      "Senkron anahtarları — HER ŞİRKET İÇİN BİR TANE, virgülle ayır (Ray'inki + Zurich'inki).\nHer şirketin anahtarı kendi Şirket Bilgileri ekranından üretilir:",
      eskiListe.join(", ")
    );
    if (girdi == null) return;
    const liste = girdi.split(",").map((x) => x.trim()).filter(Boolean);
    await stSet({ programBase: base.trim().replace(/\/+$/, ""), senkronTokenlar: liste, senkronToken: liste[0] || "" });
    flash(`Ayar kaydedildi — ${liste.length} şirket anahtarı tanımlı.`);
    seritGuncelle();
  }

  async function tani() {
    durumYaz("Tanı çalışıyor…");
    const parca = [];
    try { const b = await birimlerYukle(); parca.push(`UYAP daire listesi: <b>${b.length}</b> birim (oturum ✓)`); }
    catch (e) { parca.push(`UYAP daire listesi: ❌ ${esc(e.message)} — oturum düşmüş olabilir`); }
    const tokenlar = await anahtarlar();
    if (!tokenlar.length) parca.push("Program anahtarı: ❌ tanımsız — ⚙ Ayar");
    for (let i = 0; i < tokenlar.length; i++) {
      const hr = await sendBg({ type: "RUCU_HEDEFLER", token: tokenlar[i] });
      if (hr.ok && hr.data && hr.data.ok) parca.push(`Şirket ${i + 1} ✓ — senkron bekleyen: <b>${(hr.data.hedefler || []).length}</b> / aktif ${hr.data.aktifToplam ?? "?"}`);
      else parca.push(`Şirket ${i + 1}: ❌ ${esc(String(hr.error || (hr.data && hr.data.error) || hr.status))} (anahtar geçersiz olabilir)`);
    }
    const o = await st(["sonRapor"]);
    if (o.sonRapor) parca.push(`Son koşu: ${esc(o.sonRapor.t)} → ${o.sonRapor.ok} senkron, ${o.sonRapor.sorunlu} sorunlu / ${o.sonRapor.toplam}`);
    durumYaz(parca.join("<br>"));
  }

  // mesajlar: ikon tıklaması + background poll
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === "RUCU_TOGGLE") togglePanel();
    else if (msg.type === "RUCU_AUTO_SYNC") otoSenkron();
  });
  // sayfa yüklenince (yapılandırılmışsa, 25 dk throttle) otomatik senkron
  st(["senkronToken", "senkronTokenlar", "sonOtoSync"]).then((o) => {
    const var_ = (Array.isArray(o.senkronTokenlar) && o.senkronTokenlar.length) || o.senkronToken;
    if (var_ && Date.now() - (o.sonOtoSync || 0) > 25 * 60000) setTimeout(otoSenkron, 20000);
  });
  // keşif sürerken sayfa yenilendiyse / sihirbaz yeni sekme açtıysa: kayda kaldığı yerden devam
  // (önceki sekmenin kayıtları storage yedeğinde — durdurunca hepsi birleşip iner)
  st(["kesifAktif"]).then((o) => {
    if (!o.kesifAktif) return;
    _kesifAcik = true;
    _kesifBaslangic = Date.now();
    _kesifKayit.push({ rota: location.href, not: "keşif devam (sayfa yenilendi/yeni sekme)", t: Date.now() });
    window.postMessage({ source: "rucu-kesif-toggle", on: true }, "*");
    kesifButonTazele();
  });

  if (document.body) buildUi();
  else document.addEventListener("DOMContentLoaded", buildUi);
})();
