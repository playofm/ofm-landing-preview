/* ============================================================
   PRISM — scroll engine
   Multiple canvas frame-sequence scrub sections + scroll reveals + counters
   ============================================================ */
// Mobile-First: schmaleres Set + weniger Frames auf kleinen Viewports.
// Einmal beim Laden bestimmt (kein Set-Wechsel bei Resize → keine Doppel-Downloads).
const SCRUB_MOBILE = window.matchMedia("(max-width: 768px)").matches;

function initScrub(cfg, deferLoad) {
  const section = document.querySelector(cfg.section);
  const canvas  = section.querySelector("canvas");
  const ctx     = canvas.getContext("2d", { alpha: false });
  const lines   = [...section.querySelectorAll(".reveal-line")];
  const pFill   = section.querySelector(".progress-fill");
  const bgFill  = cfg.bg || "#0a0a12";

  // Responsive Frame-Set wählen (Mobile = 720w/90 Frames, Desktop = 1280w/179).
  const set = (SCRUB_MOBILE && cfg.mobile) ? cfg.mobile : cfg.desktop;
  const frameCount = set.count;
  const framePath  = (i) => `${set.dir}/frame_${String(i).padStart(4, "0")}.webp`;

  const images = new Array(frameCount);
  let current = -1, firstDrawn = false;

  // ---- Progressiver Loader -------------------------------------------------
  // Frames mit Concurrency-Cap laden — aber NICHT stur aufsteigend, sondern
  // immer den noch fehlenden Frame, der dem aktuellen Scrub-Punkt am nächsten
  // ist (scroll-aware). Entscheidend fürs Mobile-Ruckeln: das Bitmap wird per
  // img.decode() VORAB dekodiert (off the draw path) und erst danach als
  // zeichenbar (_ready) markiert — so passiert nie ein synchrones WebP-Decode
  // mitten im rAF-Tick (= der eigentliche Ruckler beim ersten Scrollen).
  const MAX_PARALLEL = SCRUB_MOBILE ? 4 : 8;
  let active = 0;
  function pickNext() {
    const center = current < 0 ? 0 : current;
    let best = -1, bestDist = Infinity;
    for (let i = 0; i < frameCount; i++) {
      if (images[i]) continue;                // schon angefragt
      const dist = Math.abs(i - center);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
  }
  function fillQueue() {
    while (active < MAX_PARALLEL) {
      const i = pickNext();
      if (i < 0) break;
      loadOne(i);
      active++;
    }
  }
  function loadOne(i) {
    const img = new Image();
    img.decoding = "async";
    images[i] = img;                          // sofort markieren → pickNext überspringt
    const done = () => { active--; fillQueue(); };
    img.onerror = done;
    img.src = framePath(i + 1);
    // decode() zieht das WebP→Bitmap-Dekodieren aus dem Zeichen-Pfad heraus
    img.decode().then(() => {
      img._ready = true;                      // erst jetzt zeichenbar
      if (!firstDrawn) { firstDrawn = true; draw(0); }
      if (i === current) draw(i);             // aktueller, spät fertiger Frame → nachzeichnen
      done();
    }).catch(done);                           // 404/Decode-Fehler: Queue läuft weiter
  }
  let loadStarted = false;
  function startLoading() {
    if (loadStarted) return;
    loadStarted = true;
    fillQueue();
  }
  if (deferLoad) {
    // Off-screen-Sektion (nur mobil): Frames erst laden, wenn sie naht — so
    // gehen beim Kaltstart alle Download-Slots zuerst an die sichtbare Hero-
    // Sektion, statt dass das versteckte Stadion die Bandbreite halbiert.
    const io = new IntersectionObserver((entries, obs) => {
      if (entries.some((e) => e.isIntersecting)) { obs.disconnect(); startLoading(); }
    }, { rootMargin: "100% 0px" });
    io.observe(section);
  } else {
    startLoading();
  }
  // -------------------------------------------------------------------------

  function draw(index) {
    let img = images[index];
    if (!img || !img._ready || !img.naturalWidth) {
      // Ziel-Frame noch nicht dekodiert → nächstgelegenen fertigen Frame zeigen,
      // statt auf dem alten Frame einzufrieren (kein Freeze-dann-Sprung).
      for (let d = 1; d < frameCount; d++) {
        const lo = images[index - d], hi = images[index + d];
        if (lo && lo._ready && lo.naturalWidth) { img = lo; break; }
        if (hi && hi._ready && hi.naturalWidth) { img = hi; break; }
      }
      if (!img || !img._ready || !img.naturalWidth) return;
    }
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    const ir = img.naturalWidth / img.naturalHeight, cr = cw / ch;
    let dw, dh, dx, dy;
    if (ir > cr) { dh = ch; dw = ch * ir; dx = (cw - dw) / 2; dy = 0; }
    else         { dw = cw; dh = cw / ir; dx = 0; dy = (ch - dh) / 2; }
    ctx.fillStyle = bgFill; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
  }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = canvas.clientWidth  * dpr;
    canvas.height = canvas.clientHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(current < 0 ? 0 : current);
  }
  function update() {
    const rect = section.getBoundingClientRect();
    if (rect.bottom < -window.innerHeight || rect.top > window.innerHeight) return;
    const scrollable = rect.height - window.innerHeight;
    const p = Math.min(Math.max(-rect.top / scrollable, 0), 1);
    const idx = Math.min(frameCount - 1, Math.floor(p * (frameCount - 1)));
    if (idx !== current) { current = idx; draw(idx); }
    if (pFill) pFill.style.width = (p * 100).toFixed(2) + "%";
    for (const el of lines) {
      const a = parseFloat(el.dataset.in), b = parseFloat(el.dataset.out);
      const mid = (a + b) / 2, half = (b - a) / 2;
      let o = 1 - Math.abs(p - mid) / half;
      o = Math.max(0, Math.min(1, o));
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translateY(${(1 - o) * 30}px)`;
      el.style.pointerEvents = o > 0.5 ? "auto" : "none";
    }
  }
  window.addEventListener("resize", resize);
  resize();
  return { update, resize };
}

function animateCount(el) {
  const target = parseFloat(el.dataset.count), suffix = el.dataset.suffix || "";
  const prefix = el.dataset.prefix || "";
  const sep = "sep" in el.dataset; // data-sep: deutsche Tausenderpunkte (1.000.000)
  const dur = 1500, t0 = performance.now();
  function step(t) {
    const k = Math.min((t - t0) / dur, 1), eased = 1 - Math.pow(1 - k, 3);
    let val = target % 1 === 0 ? Math.round(target * eased) : (target * eased).toFixed(1);
    if (sep) val = Number(val).toLocaleString("de-DE");
    el.textContent = prefix + val + suffix;
    if (k < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

document.addEventListener("DOMContentLoaded", () => {
  // Auf Mobil die zweite (versteckte) Sektion verzögert laden → Hero kriegt
  // beim Kaltstart die volle Bandbreite. Desktop lädt beide sofort (8 Slots).
  const scrubs = (window.SCRUB_SECTIONS || [])
    .filter(c => document.querySelector(c.section))
    .map((c, i) => initScrub(c, SCRUB_MOBILE && i > 0));

  const lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
  window.__lenis = lenis;
  function raf(t) { lenis.raf(t); scrubs.forEach(s => s.update()); requestAnimationFrame(raf); }
  requestAnimationFrame(raf);

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      if (e.target.classList.contains("stat-num")) animateCount(e.target);
      io.unobserve(e.target);
    });
  }, { threshold: 0.25 });
  document.querySelectorAll(".reveal, .stat-num").forEach((el) => io.observe(el));

  const hudLogo = document.querySelector(".hud-center-logo");
  const heroSec = document.querySelector("#hero");
  lenis.on("scroll", ({ scroll }) => {
    document.querySelectorAll(".scroll-hint").forEach(h => h.style.opacity = scroll > 60 ? "0" : "1");
    // Logo ausblenden, sobald die Hero-Sektion durchgescrollt ist (+ 25vh Puffer)
    if (hudLogo && heroSec) {
      const heroDone = heroSec.offsetTop + heroSec.offsetHeight - window.innerHeight * 0.75;
      hudLogo.classList.toggle("is-hidden", scroll > heroDone);
    }
  });

  // Smart-Download: Nav-Button erkennt das Gerät und führt direkt zum richtigen Store.
  // iPhone/iPad → App Store, Android → Google Play, Desktop → sanft hoch zu den Badges
  // (am Desktop gibt es nichts direkt zu laden).
  // TODO: STORE_IOS / STORE_ANDROID beim finalen Launch durch die echten Listing-URLs ersetzen.
  const STORE_IOS = "https://apps.apple.com/de/app/id6443938433";
  const STORE_ANDROID = "https://play.google.com/store/apps/details?id=com.ofmstudios.ofm";
  const navCta = document.querySelector(".hud-cta");
  if (navCta) {
    const ua = navigator.userAgent || "";
    const isIOS = /iPhone|iPad|iPod/i.test(ua) ||
                  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    if (isIOS || isAndroid) {
      navCta.href = isIOS ? STORE_IOS : STORE_ANDROID;
      navCta.target = "_blank";
      navCta.rel = "noopener";
    } else {
      navCta.addEventListener("click", (ev) => {
        ev.preventDefault();
        if (window.__lenis) window.__lenis.scrollTo(0, { duration: 0.8 });
        else window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }
  }

  // Launch-Version: kein Waitlist-Formular mehr — Haupt-CTA sind die Store-Badges.
});
