/**
 * Rücu Takip — MAIN-world ağ yakalayıcı · interceptor.js (SALT-OKUMA)
 * UYAP sayfasının KENDİ yaptığı fetch/XHR çağrılarının yanıtlarını content script'e iletir.
 * Amaç: "Ödeme İşlemlerim" gibi ekranların endpoint'ini tahmin etmeden, sayfa listeleyince
 * gelen gerçek veriyi okumak. Hiçbir isteği DEĞİŞTİRMEZ, yeni istek ÜRETMEZ.
 *
 * v1.4.0 — KEŞİF MODU: content script panelden açar/kapatır. Açıkken (statik varlıklar hariç)
 * TÜM istekler tam gövde + yanıt + ekran rotalarıyla ayrı kanaldan ("rucu-kesif-rec") iletilir.
 * Kullanım: takip açma sihirbazı gibi BİLİNMEYEN akışları avukat bir kez elle yürütürken uçlarını
 * öğrenmek (Faz 0). Keşif de yalnızca DİNLER — isteklere dokunmaz.
 */
(() => {
  if (window.__rucuIntc) return;
  window.__rucuIntc = true;
  // ilgi filtresi: .ajx uçları + ödeme/masraf/makbuz benzeri yollar (gürültüyü sınırla)
  const ILGI = /\.ajx|\.uyap|odeme|tahsilat|reddiyat|makbuz|masraf|harc|barokart/i;
  const STATIK = /\.(js|css|map|png|jpe?g|gif|svg|ico|woff2?|ttf|eot|mp4|webm)(\?|$)/i;
  const gonder = (rec) => { try { window.postMessage({ source: "rucu-intercept", rec }, "*"); } catch (e) {} };

  // ── keşif modu durumu + kanalı ──
  let kesif = false;
  window.addEventListener("message", (e) => {
    if (e.source === window && e.data && e.data.source === "rucu-kesif-toggle") kesif = !!e.data.on;
  });
  const kGonder = (rec) => { try { window.postMessage({ source: "rucu-kesif-rec", rec }, "*"); } catch (e) {} };

  // İstek gövdesini okunur biçime çevir — FormData/URLSearchParams/Blob dahil (evrak yükleme adımı için önemli).
  function seriBody(b) {
    try {
      if (b == null) return "";
      if (typeof b === "string") return b.slice(0, 200000);
      if (typeof URLSearchParams !== "undefined" && b instanceof URLSearchParams) return b.toString().slice(0, 200000);
      if (typeof FormData !== "undefined" && b instanceof FormData) {
        const o = {};
        for (const [k, v] of b.entries())
          o[k] = (typeof File !== "undefined" && v instanceof File) ? `«DOSYA ${v.name} · ${v.size}B · ${v.type}»` : String(v).slice(0, 4000);
        return "FORMDATA " + JSON.stringify(o).slice(0, 200000);
      }
      if (typeof Blob !== "undefined" && b instanceof Blob) return `«BLOB ${b.size}B · ${b.type}»`;
      return String(b).slice(0, 200000);
    } catch (e) { return "«gövde okunamadı»"; }
  }

  const of = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const resp = await of.apply(this, arguments);
    try {
      if (ILGI.test(url)) {
        const klon = resp.clone();
        klon.text().then((t) => gonder({ url: String(url), req: init && init.body ? String(init.body).slice(0, 2000) : "", resp: t.slice(0, 500000), t: Date.now() })).catch(() => {});
      }
      if (kesif && !STATIK.test(url)) {
        const method = (init && init.method) || (input && input.method) || "GET";
        const req = seriBody(init && init.body != null ? init.body : null);
        const klon2 = resp.clone();
        klon2.text().then((t) => kGonder({ url: String(url), method: String(method).toUpperCase(), req, resp: t.slice(0, 500000), st: resp.status, t: Date.now() })).catch(() => {});
      }
    } catch (e) {}
    return resp;
  };

  const oOpen = XMLHttpRequest.prototype.open;
  const oSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, url) { this.__rucuUrl = String(url || ""); this.__rucuM = String(m || "GET").toUpperCase(); return oOpen.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) {
    if (ILGI.test(this.__rucuUrl || "")) {
      this.addEventListener("load", () => {
        try { gonder({ url: this.__rucuUrl, req: body ? String(body).slice(0, 2000) : "", resp: String(this.responseText || "").slice(0, 500000), t: Date.now() }); } catch (e) {}
      });
    }
    if (kesif && !STATIK.test(this.__rucuUrl || "")) {
      const req = seriBody(body);
      this.addEventListener("load", () => {
        try {
          const yanit = (this.responseType === "" || this.responseType === "text") ? String(this.responseText || "").slice(0, 500000) : `«${this.responseType} yanıt · ~okunamadı»`;
          kGonder({ url: this.__rucuUrl, method: this.__rucuM, req, resp: yanit, st: this.status, t: Date.now() });
        } catch (e) {}
      });
    }
    return oSend.apply(this, arguments);
  };

  // ── keşifte ekran (SPA rota) geçişleri de kaydedilir — sihirbazın hangi adımda hangi isteği attığı görülsün ──
  const rota = () => { if (kesif) kGonder({ rota: location.href, t: Date.now() }); };
  const oPush = history.pushState, oReplace = history.replaceState;
  history.pushState = function () { const r = oPush.apply(this, arguments); rota(); return r; };
  history.replaceState = function () { const r = oReplace.apply(this, arguments); rota(); return r; };
  window.addEventListener("hashchange", rota);
  window.addEventListener("popstate", rota);
})();
