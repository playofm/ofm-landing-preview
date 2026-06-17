/* ============================================================
   OFM — Mauszeiger-Komet
   Grüner Schimmer direkt am Mauszeiger + verglühender Schweif,
   gezeichnet auf ein Overlay-Canvas. Der System-Cursor bleibt sichtbar.
   WICHTIG: Das Canvas braucht width/height 100% im CSS, sonst
   rendert es auf Retina in doppelter Größe und alles sitzt versetzt.
   ============================================================ */
(function () {
  // Kein Schweif bei reduzierter Bewegung oder auf Touch-Geräten
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (window.matchMedia("(hover: none)").matches) return;

  const canvas = document.createElement("canvas");
  canvas.id = "cursor-comet";
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;z-index:200;pointer-events:none;";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  const TRAIL_MS = 420; // Lebensdauer eines Schweif-Punkts
  const pts = [];       // { x, y, t }
  let lastX = null, lastY = null;
  let overInput = false;

  window.addEventListener("pointermove", (e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    // Über Eingabefeldern zeigt der Browser den Text-Cursor — Schimmer aus
    overInput = !!(e.target && e.target.closest && e.target.closest("input, textarea, select"));
    const now = performance.now();
    // Zwischenpunkte, damit der Schweif bei schnellen Bewegungen nicht abreißt
    if (lastX !== null) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      const steps = Math.min(8, Math.floor(Math.hypot(dx, dy) / 14));
      for (let i = 1; i <= steps; i++) {
        pts.push({ x: lastX + (dx * i) / (steps + 1), y: lastY + (dy * i) / (steps + 1), t: now });
      }
    }
    pts.push({ x: e.clientX, y: e.clientY, t: now });
    lastX = e.clientX; lastY = e.clientY;
  }, { passive: true });

  // Maus verlässt das Fenster → Schimmer aus
  document.addEventListener("mouseleave", () => { lastX = null; lastY = null; });

  function glowDot(x, y, r, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(0, 230, 118, " + alpha.toFixed(3) + ")");
    g.addColorStop(0.55, "rgba(0, 230, 118, " + (alpha * 0.45).toFixed(3) + ")");
    g.addColorStop(1, "rgba(0, 230, 118, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function paint(now) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (!pts.length && lastX === null) return;
    ctx.globalCompositeOperation = "lighter";
    // Schweif: verglühende Glow-Punkte (je frischer, desto größer und heller)
    for (const p of pts) {
      const k = 1 - (now - p.t) / TRAIL_MS; // 1 = frisch am Ball, 0 = verglüht
      glowDot(p.x, p.y, 3 + 9 * k, 0.35 * k);
    }
    // Schimmer direkt unterm Ball
    if (lastX !== null && !overInput) glowDot(lastX, lastY, 15, 0.45);
    ctx.globalCompositeOperation = "source-over";
  }

  function frame() {
    requestAnimationFrame(frame);
    const now = performance.now();
    while (pts.length && now - pts[0].t > TRAIL_MS) pts.shift();
    paint(now);
  }
  requestAnimationFrame(frame);

  // Debug-Hook: zeichnet einen synthetischen Schweif über den echten Code-Pfad
  // (nur für Tests, im normalen Betrieb ungenutzt)
  window.__cometDemo = function (demoPts) {
    const now = performance.now();
    pts.length = 0;
    for (const d of demoPts) {
      pts.push({ x: d.x, y: d.y, t: now - (1 - d.k) * TRAIL_MS });
      lastX = d.x; lastY = d.y;
    }
    overInput = false;
    while (pts.length && now - pts[0].t > TRAIL_MS) pts.shift();
    paint(now);
  };
})();
