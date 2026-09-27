/**
 * KonsLaw — UYAP Senkron v2.0 · background.js
 * (1) Eklenti ikonu → paneli aç/kapat.  (2) Program API köprüsü (Bearer = eklenti anahtarı) —
 * content script cross-origin fetch yapamaz, buradan geçer.  (3) 30 dk'lık poll alarmı: açık bir
 * UYAP sekmesi varsa otomatik senkron tetikler (oturum content tarafında zorunlu).
 *
 * v2.0 (S14, S22):
 *  - Anahtar: kişiye bağlı yeni anahtar ("kr2_…", programda Ayarlar > Eklenti anahtarları). Eski kiracı anahtarı
 *    ("kr_…") eski uçlarda çalışmaya devam eder; AYNI müvekkil için yeni anahtar girilince eskisi kullanılmaz.
 *  - Her istek `X-Eklenti-Surum` ve `X-Eklenti-Cihaz` başlığı taşır (sunucu faiz kopilotunu sürüme göre açar).
 *  - İş kuyruğu mesajları: RUCU_IS_SIRA (nabız), RUCU_IS_AL, RUCU_IS_ADIM, RUCU_IS_BITIR; RUCU_KIMLIK.
 */
const PROGRAM_BASE_DEFAULT = "https://konslaw.app";
// saf.js: anahtar tekilleştirme ve cihaz kimliği gibi saf yardımcılar (content script ile ortak; testli).
try { importScripts("saf.js"); } catch (e) { /* saf.js yoksa aşağıdaki yedek davranış */ }
const SAF = self.KonsSaf || null;

chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "RUCU_TOGGLE" }).catch(() => {});
});

function surum() { try { return chrome.runtime.getManifest().version || ""; } catch (e) { return ""; } }

/** Kurulum başına rastgele cihaz kimliği (kişisel veri değil). Nabız ve iş üstlenme bununla yapılır. */
function cihazKimligi() {
  return new Promise((res) =>
    chrome.storage.local.get(["cihazId"], (o) => {
      if (o && o.cihazId) return res(o.cihazId);
      const rastgele = () => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] / 4294967296; };
      const id = SAF ? SAF.cihazKimligiUret(rastgele) : "ck_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
      chrome.storage.local.set({ cihazId: id }, () => res(id));
    })
  );
}

// ÇOKLU ANAHTAR: her müvekkilin (Ray, Zurich…) kendi anahtarı var; eklenti hepsini saklar ve her istekte
// msg.token ile HANGİ müvekkile konuşulacağı content tarafından seçilir.
// Tekilleştirme: anahtarBilgi[token] = { musteriId, tur } (RUCU_KIMLIK ile öğrenilir). Aynı müvekkil için
// yeni anahtar varsa eski kiracı anahtarı listeden düşer ("yeni anahtar ayarlanınca ona geçilsin").
function programCfg() {
  return new Promise((res) =>
    chrome.storage.local.get(["programBase", "senkronToken", "senkronTokenlar", "anahtarBilgi"], (o) => {
      const ham = Array.isArray(o && o.senkronTokenlar) ? o.senkronTokenlar.filter(Boolean) : [];
      if (!ham.length && o && o.senkronToken) ham.push(o.senkronToken); // eski tek-anahtar migrasyonu
      const bilgi = (o && o.anahtarBilgi) || {};
      const tokenlar = SAF ? SAF.anahtarlariTekillestir(ham, bilgi) : ham;
      res({ base: String((o && o.programBase) || PROGRAM_BASE_DEFAULT).replace(/\/+$/, ""), tokenlar, bilgi });
    })
  );
}

async function programFetch(path, opts, tokenIstenen) {
  const { base, tokenlar } = await programCfg();
  const token = tokenIstenen || tokenlar[0] || "";
  if (!token) return { ok: false, error: "Eklenti anahtarı yok — panelden ⚙ Ayar ile gir." };
  const cihaz = await cihazKimligi();
  try {
    const resp = await fetch(base + path, {
      method: (opts && opts.method) || "GET",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "X-Eklenti-Surum": surum(), "X-Eklenti-Cihaz": cihaz },
      body: opts && opts.body ? opts.body : undefined,
    });
    const txt = await resp.text();
    let data; try { data = JSON.parse(txt); } catch (e) { data = { raw: txt }; }
    return { ok: resp.ok, status: resp.status, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const post = (path, body, token) => programFetch(path, { method: "POST", body: JSON.stringify(body || {}) }, token);

async function isSira(msg) {
  const cihaz = await cihazKimligi();
  const q = "?cihaz=" + encodeURIComponent(cihaz) + "&surum=" + encodeURIComponent(surum()) + "&oturum=" + (msg.uyapOturum ? "1" : "0");
  return programFetch("/api/uyap/is/sira" + q, { method: "GET" }, msg.token);
}
async function isPost(msg, uc, body) {
  const cihaz = await cihazKimligi();
  return post("/api/uyap/is/" + encodeURIComponent(msg.id || "") + "/" + uc, Object.assign({ cihaz, surum: surum() }, body || {}), msg.token);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === "RUCU_TOKENLAR") { programCfg().then((c) => sendResponse({ ok: true, tokenlar: c.tokenlar, bilgi: c.bilgi })); return true; }
  if (msg.type === "RUCU_KIMLIK") { programFetch("/api/uyap/kimlik", { method: "GET" }, msg.token).then(sendResponse); return true; }
  if (msg.type === "RUCU_HEDEFLER") { programFetch("/api/uyap/hedefler" + (msg.tumu ? "?tazeSaat=0" : ""), { method: "GET" }, msg.token).then(sendResponse); return true; }
  if (msg.type === "RUCU_SENKRON") { post("/api/uyap/senkron", msg.body, msg.token).then(sendResponse); return true; }
  if (msg.type === "RUCU_DAVA") { post("/api/uyap/dava", msg.body, msg.token).then(sendResponse); return true; }
  if (msg.type === "RUCU_EVRAK") { post("/api/uyap/evrak", msg.body, msg.token).then(sendResponse); return true; }
  if (msg.type === "RUCU_EVRAK_MANIFEST") { programFetch("/api/uyap/evrak-manifest?icraDosyaNo=" + encodeURIComponent(msg.icraDosyaNo || ""), { method: "GET" }, msg.token).then(sendResponse); return true; }
  // Takip Aç Kopilotu: açılabilir dosya yükleri + tevzi sonucu geri yazımı
  if (msg.type === "RUCU_TAKIP_HEDEFLER") { programFetch("/api/uyap/takip-hedefler", { method: "GET" }, msg.token).then(sendResponse); return true; }
  if (msg.type === "RUCU_TAKIP_TEVZI") { post("/api/uyap/takip-tevzi", msg.body, msg.token).then(sendResponse); return true; }
  // Tevzi tamam → dayanak klasörü (.zip) otomatik iner: İndirilenler\Rucu-Takip-Paketleri\<hukuk no>.zip
  if (msg.type === "RUCU_TAKIP_PAKET") { paketIndir(msg).then(sendResponse); return true; }
  // İş kuyruğu (v2.0 · yalnız yeni anahtarla): nabız + atomik üstlenme + adım + bitir
  if (msg.type === "RUCU_IS_SIRA") { isSira(msg).then(sendResponse); return true; }
  if (msg.type === "RUCU_IS_AL") { isPost(msg, "al").then(sendResponse); return true; }
  if (msg.type === "RUCU_IS_ADIM") { isPost(msg, "adim", { adim: msg.adim }).then(sendResponse); return true; }
  if (msg.type === "RUCU_IS_BITIR") { isPost(msg, "bitir", { durum: msg.durum, ozet: msg.ozet, hata: msg.hata }).then(sendResponse); return true; }
});

async function paketIndir(msg) {
  const { base, tokenlar } = await programCfg();
  const token = msg.token || tokenlar[0] || "";
  if (!token) return { ok: false, error: "Eklenti anahtarı yok" };
  const ad = String(msg.ad || msg.dosyaId || "paket").replace(/[^\w\-. ]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
  const url = base + "/api/uyap/takip-paket?dosyaId=" + encodeURIComponent(msg.dosyaId || "");
  return new Promise((res) => {
    chrome.downloads.download(
      { url, headers: [{ name: "Authorization", value: "Bearer " + token }], filename: "Rucu-Takip-Paketleri/" + ad + " - icra paketi.zip", conflictAction: "uniquify" },
      (id) => {
        if (chrome.runtime.lastError || id == null) res({ ok: false, error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || "indirme başlamadı" });
        else res({ ok: true, downloadId: id });
      }
    );
  });
}

// Periyodik poll (30 dk) — tarayıcı açıkken; bir UYAP sekmesi varsa otomatik senkron tetikler.
// Öncelikli işler (iş kuyruğu) content tarafında 10 sn'lik yoklamayla alınır. UYAP sekmesi arka planda
// kalınca Chrome sekme zamanlayıcılarını seyreltir; bu yüzden 30 sn'lik "rucuIs" alarmı da sekmeyi dürter
// (mesaj işleme seyreltilmez): iş, UYAP sekmesi arka plandayken de en geç ~30 sn'de alınır.
function kurAlarm() {
  chrome.alarms.create("rucuPoll", { periodInMinutes: 30, delayInMinutes: 1 });
  chrome.alarms.create("rucuIs", { periodInMinutes: 0.5, delayInMinutes: 0.5 });
}
chrome.runtime.onInstalled.addListener(kurAlarm);
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(kurAlarm);
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== "rucuPoll" && a.name !== "rucuIs") return;
  chrome.tabs.query({ url: "*://avukat.uyap.gov.tr/*" }, (tabs) => {
    const t = tabs && tabs[0];
    if (!t || !t.id) return;
    chrome.tabs.sendMessage(t.id, { type: a.name === "rucuPoll" ? "RUCU_AUTO_SYNC" : "RUCU_IS_YOKLA" }).catch(() => {});
  });
});
