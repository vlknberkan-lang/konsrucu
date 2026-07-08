/**
 * Rücu Takip — UYAP Senkron v1 · background.js
 * (1) Eklenti ikonu → paneli aç/kapat.  (2) Program API köprüsü (Bearer = senkron anahtarı) —
 * content script cross-origin fetch yapamaz, buradan geçer.  (3) 30 dk'lık poll alarmı: açık bir
 * UYAP sekmesi varsa otomatik senkron tetikler (oturum content tarafında zorunlu).
 */
const PROGRAM_BASE_DEFAULT = "https://konsrucu.vercel.app";

chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "RUCU_TOGGLE" }).catch(() => {});
});

// ÇOKLU ANAHTAR: her tenant'ın (Ray, Zurich…) kendi senkron anahtarı var; eklenti hepsini saklar
// ve her istekte msg.token ile HANGİ tenant'a konuşulacağı content tarafından seçilir.
function programCfg() {
  return new Promise((res) =>
    chrome.storage.local.get(["programBase", "senkronToken", "senkronTokenlar"], (o) => {
      const liste = Array.isArray(o && o.senkronTokenlar) ? o.senkronTokenlar.filter(Boolean) : [];
      if (!liste.length && o && o.senkronToken) liste.push(o.senkronToken); // eski tek-anahtar migrasyonu
      res({ base: String((o && o.programBase) || PROGRAM_BASE_DEFAULT).replace(/\/+$/, ""), tokenlar: liste });
    })
  );
}

async function programFetch(path, opts, tokenIstenen) {
  const { base, tokenlar } = await programCfg();
  const token = tokenIstenen || tokenlar[0] || "";
  if (!token) return { ok: false, error: "Senkron anahtarı yok — panelden ⚙ Ayar ile gir." };
  try {
    const resp = await fetch(base + path, {
      method: (opts && opts.method) || "GET",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: opts && opts.body ? opts.body : undefined,
    });
    const txt = await resp.text();
    let data; try { data = JSON.parse(txt); } catch (e) { data = { raw: txt }; }
    return { ok: resp.ok, status: resp.status, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === "RUCU_TOKENLAR") { programCfg().then((c) => sendResponse({ ok: true, tokenlar: c.tokenlar })); return true; }
  if (msg.type === "RUCU_HEDEFLER") { programFetch("/api/uyap/hedefler" + (msg.tumu ? "?tazeSaat=0" : ""), { method: "GET" }, msg.token).then(sendResponse); return true; }
  if (msg.type === "RUCU_SENKRON") { programFetch("/api/uyap/senkron", { method: "POST", body: JSON.stringify(msg.body || {}) }, msg.token).then(sendResponse); return true; }
  if (msg.type === "RUCU_EVRAK") { programFetch("/api/uyap/evrak", { method: "POST", body: JSON.stringify(msg.body || {}) }, msg.token).then(sendResponse); return true; }
  if (msg.type === "RUCU_EVRAK_MANIFEST") { programFetch("/api/uyap/evrak-manifest?icraDosyaNo=" + encodeURIComponent(msg.icraDosyaNo || ""), { method: "GET" }, msg.token).then(sendResponse); return true; }
  // Takip Aç Kopilotu (Faz 1 uçları): açılabilir dosya yükleri + tevzi sonucu geri yazımı
  if (msg.type === "RUCU_TAKIP_HEDEFLER") { programFetch("/api/uyap/takip-hedefler", { method: "GET" }, msg.token).then(sendResponse); return true; }
  if (msg.type === "RUCU_TAKIP_TEVZI") { programFetch("/api/uyap/takip-tevzi", { method: "POST", body: JSON.stringify(msg.body || {}) }, msg.token).then(sendResponse); return true; }
  // Tevzi tamam → dayanak klasörü (.zip) otomatik iner: İndirilenler\Rucu-Takip-Paketleri\<hukuk no>.zip
  // chrome.downloads Bearer başlığını kendi taşır (CORS'a takılmaz); ağır zip'i base64'e çevirmeye gerek yok.
  if (msg.type === "RUCU_TAKIP_PAKET") { paketIndir(msg).then(sendResponse); return true; }
});

async function paketIndir(msg) {
  const { base, tokenlar } = await programCfg();
  const token = msg.token || tokenlar[0] || "";
  if (!token) return { ok: false, error: "Senkron anahtarı yok" };
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
function kurAlarm() { chrome.alarms.create("rucuPoll", { periodInMinutes: 30, delayInMinutes: 1 }); }
chrome.runtime.onInstalled.addListener(kurAlarm);
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(kurAlarm);
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== "rucuPoll") return;
  chrome.tabs.query({ url: "*://*.uyap.gov.tr/*" }, (tabs) => {
    const t = tabs && tabs[0];
    if (t && t.id) chrome.tabs.sendMessage(t.id, { type: "RUCU_AUTO_SYNC" }).catch(() => {});
  });
});
