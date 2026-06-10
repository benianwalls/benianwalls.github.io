/* =====================================================
   Benian Walls — scroll-driven mountain bike world
   ===================================================== */

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- helpers ---------- */
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const rand = (min, max) => min + Math.random() * (max - min);

/* ---------- layer speeds (px of layer motion per px of scroll) ---------- */
const SPEEDS = { far: 0.06, mid: 0.16, near: 0.34, ground: 1.0, foreground: 1.45 };

const els = {
  far: document.getElementById("mtn-far"),
  mid: document.getElementById("mtn-mid"),
  near: document.getElementById("mtn-near"),
  ground: document.getElementById("ground"),
  foreground: document.getElementById("foreground"),
  skyNight: document.querySelector(".sky-night"),
  stars: document.getElementById("stars"),
  sun: document.getElementById("sun"),
  biker: document.getElementById("biker"),
  dust: document.getElementById("dust"),
  headlight: document.getElementById("headlight"),
  progress: document.getElementById("trail-progress-fill"),
};

let maxScroll = 1;
let worldWidths = {};

/* =====================================================
   PROCEDURAL SCENERY
   ===================================================== */

function mountainSVG(width, height, color, peaks, roughness, snow) {
  const pts = [[0, height]];
  const step = width / peaks;
  let y = rand(height * 0.35, height * 0.7);
  for (let x = 0; x <= width; x += step) {
    pts.push([x, y]);
    y = clamp(y + rand(-roughness, roughness), height * 0.08, height * 0.85);
  }
  pts.push([width, height]);
  const path = "M" + pts.map((p) => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join(" L");

  // snow caps: small triangles on the highest vertices
  let snowPaths = "";
  if (snow) {
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i];
      const prev = pts[i - 1], next = pts[i + 1];
      if (py < prev[1] && py < next[1] && py < height * 0.4) {
        const w = step * 0.42;
        snowPaths += `<path d="M${px - w},${py + w * 0.55} L${px},${py} L${px + w},${py + w * 0.55} L${px + w * 0.4},${py + w * 0.4} L${px},${py + w * 0.62} L${px - w * 0.4},${py + w * 0.42} Z" fill="#eef4f8" opacity="0.92"/>`;
      }
    }
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <path d="${path} Z" fill="${color}"/>${snowPaths}</svg>`;
}

function buildScene() {
  maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // each layer needs viewport width + how far it will travel
  for (const key of ["far", "mid", "near", "ground", "foreground"]) {
    worldWidths[key] = Math.ceil(vw + maxScroll * SPEEDS[key]) + 200;
  }

  els.far.innerHTML = mountainSVG(worldWidths.far, vh * 0.7, "#7fa8c9", 14, vh * 0.22, true);
  els.mid.innerHTML = mountainSVG(worldWidths.mid, vh * 0.55, "#4f7d8c", 22, vh * 0.18, true);
  els.near.innerHTML = mountainSVG(worldWidths.near, vh * 0.42, "#2e5947", 30, vh * 0.13, false);

  buildGround();
  buildForeground();
  buildStars();
}

function buildGround() {
  const w = worldWidths.ground;
  const frag = document.createDocumentFragment();

  const base = document.createElement("div");
  base.className = "ground-base";
  base.style.width = w + "px";
  frag.appendChild(base);

  const trail = document.createElement("div");
  trail.className = "trail-line";
  trail.style.width = w + "px";
  frag.appendChild(trail);

  // trees
  for (let x = rand(100, 300); x < w; x += rand(160, 520)) {
    const t = document.createElement("div");
    t.className = "tree";
    const s = rand(0.55, 1.25);
    t.style.left = x + "px";
    t.style.transform = `scale(${s})`;
    t.style.transformOrigin = "bottom center";
    t.innerHTML = `<div class="sway"><div class="trunk"></div><div class="canopy"></div><div class="canopy c2"></div><div class="canopy c3"></div></div>`;
    frag.appendChild(t);
  }

  // rocks
  for (let x = rand(200, 500); x < w; x += rand(400, 1100)) {
    const r = document.createElement("div");
    r.className = "rock";
    r.style.left = x + "px";
    r.style.width = rand(18, 46) + "px";
    r.style.height = rand(10, 22) + "px";
    frag.appendChild(r);
  }

  // mile-marker signposts at each section
  const sections = [
    ["about", "MILE 01 · ABOUT"],
    ["experience", "MILE 02 · EXPERIENCE"],
    ["projects", "MILE 03 · PROJECTS"],
    ["skills", "MILE 04 · SKILLS"],
    ["education", "MILE 05 · EDUCATION"],
    ["leadership", "MILE 06 · LEADERSHIP"],
    ["contact", "END OF TRAIL"],
  ];
  const bikerX = window.innerWidth * 0.14 + 135; // roughly where the biker sits
  for (const [id, label] of sections) {
    const sec = document.getElementById(id);
    if (!sec) continue;
    const sp = document.createElement("div");
    sp.className = "signpost";
    sp.dataset.target = id;
    // place the sign so it passes the biker when the section is centered on screen
    const x = bikerX + (sec.offsetTop - window.innerHeight * 0.18) * SPEEDS.ground + 320;
    sp.style.left = x + "px";
    sp.innerHTML = `<div class="post"></div><div class="sign">${label}</div>`;
    frag.appendChild(sp);

    // a collectible badge floats near each signpost (unless already grabbed)
    if (BADGE_ICONS[id] && !collected.has(id)) {
      const col = document.createElement("div");
      col.className = "collectible";
      col.dataset.id = id;
      col.textContent = BADGE_ICONS[id];
      col.style.left = (x - rand(420, 720)) + "px";
      col.style.animationDelay = rand(0, 2).toFixed(2) + "s";
      frag.appendChild(col);
    }
  }

  els.ground.innerHTML = "";
  els.ground.appendChild(frag);
  els.ground.style.width = w + "px";
}

function buildForeground() {
  const w = worldWidths.foreground;
  const frag = document.createDocumentFragment();
  for (let x = rand(0, 300); x < w; x += rand(300, 900)) {
    const b = document.createElement("div");
    b.className = "bush";
    b.style.left = x + "px";
    b.style.width = rand(80, 220) + "px";
    b.style.height = rand(26, 60) + "px";
    frag.appendChild(b);
  }
  els.foreground.innerHTML = "";
  els.foreground.appendChild(frag);
  els.foreground.style.width = w + "px";
}

function buildStars() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 90; i++) {
    const s = document.createElement("div");
    s.className = "star";
    const size = rand(1, 2.6);
    s.style.width = s.style.height = size + "px";
    s.style.left = rand(0, 100) + "%";
    s.style.top = rand(0, 100) + "%";
    s.style.animationDelay = rand(0, 3) + "s";
    frag.appendChild(s);
  }
  els.stars.innerHTML = "";
  els.stars.appendChild(frag);
}

/* =====================================================
   CLICKABLE WORLD — badges, hops, shakes
   ===================================================== */

const BADGE_ICONS = {
  about: "🔒", experience: "🛡️", projects: "🐛",
  skills: "🔑", education: "📡", leadership: "⛰️", contact: "🚩",
};
const BADGE_TOTAL = Object.keys(BADGE_ICONS).length;
const collected = new Set();

const hud = document.getElementById("hud");
const badgeCount = document.getElementById("badge-count");
document.getElementById("badge-total").textContent = BADGE_TOTAL;

let hopY = 0, hopVel = 0;

document.addEventListener("click", (e) => {
  const badge = e.target.closest(".collectible");
  if (badge) return collectBadge(badge, e);

  const sign = e.target.closest(".signpost");
  if (sign) {
    document.getElementById(sign.dataset.target)?.scrollIntoView({ behavior: "smooth" });
    return;
  }

  const tree = e.target.closest(".tree");
  if (tree) return replay(tree.querySelector(".sway"), "shaking");

  const rock = e.target.closest(".rock");
  if (rock) return replay(rock, "bouncing");

  if (e.target.closest("#biker") && hopY === 0) hopVel = 10;
});

function replay(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // restart the animation
  el.classList.add(cls);
}

function collectBadge(el, e) {
  const id = el.dataset.id;
  if (collected.has(id)) return;
  collected.add(id);
  el.classList.add("collected");
  setTimeout(() => el.remove(), 600);

  const f = document.createElement("div");
  f.className = "floater";
  f.textContent = "+1";
  f.style.left = e.clientX + "px";
  f.style.top = (e.clientY - 24) + "px";
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 950);

  badgeCount.textContent = collected.size;
  replay(hud, "bump");

  if (collected.size === BADGE_TOTAL) {
    setTimeout(() => { confetti(); showToast(); unlockHackerMode(); }, 350);
  }
}

/* ---------- hacker mode ---------- */
const hackToggle = document.getElementById("hack-toggle");

function unlockHackerMode() {
  localStorage.setItem("trailMaster", "1");
  hackToggle.hidden = false;
  setTimeout(() => setHacked(true), 1800); // let the confetti land first
}

function setHacked(on) {
  document.body.classList.toggle("hacked", on);
  localStorage.setItem("hackMode", on ? "1" : "0");
  hackToggle.textContent = on ? "EXIT HACKER MODE" : "ENTER HACKER MODE";
}

hackToggle.addEventListener("click", () => setHacked(!document.body.classList.contains("hacked")));

// returning trail masters keep their unlock
if (localStorage.getItem("trailMaster") === "1") {
  hackToggle.hidden = false;
  if (localStorage.getItem("hackMode") === "1") setHacked(true);
}

function confetti() {
  const colors = ["#ff7a3d", "#ffd166", "#3e8e5a", "#2563a8", "#ffffff"];
  for (let i = 0; i < 90; i++) {
    const p = document.createElement("div");
    p.className = "confetti-piece";
    p.style.left = rand(0, 100) + "vw";
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = rand(1.8, 3.4).toFixed(2) + "s";
    p.style.animationDelay = rand(0, 0.7).toFixed(2) + "s";
    p.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 4800);
  }
}

function showToast() {
  const toast = document.getElementById("toast");
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 4200);
}

/* =====================================================
   BIKER — wheels, cranks, and two-bone leg IK
   ===================================================== */

const BB = { x: 100, y: 103 };       // bottom bracket
const HIP = { x: 80, y: 56 };
const CRANK = 16;
const THIGH = 36, SHIN = 34;

const legNear = document.getElementById("leg-near");
const legFar = document.getElementById("leg-far");
const crankNear = document.getElementById("crank-near");
const crankFar = document.getElementById("crank-far");
const footNear = document.getElementById("foot-near");
const spokeGroups = document.querySelectorAll(".spokes");

function solveLeg(foot) {
  // two-bone IK from HIP to foot; knee bends forward
  let dx = foot.x - HIP.x, dy = foot.y - HIP.y;
  let d = Math.hypot(dx, dy);
  d = clamp(d, Math.abs(THIGH - SHIN) + 0.5, THIGH + SHIN - 0.5);
  const a = (THIGH * THIGH - SHIN * SHIN + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, THIGH * THIGH - a * a));
  const ux = dx / d, uy = dy / d;
  // two perpendicular options; pick the knee that points forward (+x)
  const k1 = { x: HIP.x + a * ux - h * uy, y: HIP.y + a * uy + h * ux };
  const k2 = { x: HIP.x + a * ux + h * uy, y: HIP.y + a * uy - h * ux };
  return k1.x > k2.x ? k1 : k2;
}

function setLeg(legEl, crankEl, footEl, angle) {
  const foot = { x: BB.x + CRANK * Math.cos(angle), y: BB.y + CRANK * Math.sin(angle) };
  const knee = solveLeg(foot);
  legEl.setAttribute("points", `${HIP.x},${HIP.y} ${knee.x.toFixed(1)},${knee.y.toFixed(1)} ${foot.x.toFixed(1)},${foot.y.toFixed(1)}`);
  crankEl.setAttribute("x2", foot.x.toFixed(1));
  crankEl.setAttribute("y2", foot.y.toFixed(1));
  if (footEl) {
    footEl.setAttribute("cx", foot.x.toFixed(1));
    footEl.setAttribute("cy", foot.y.toFixed(1));
  }
}

/* =====================================================
   MAIN LOOP
   ===================================================== */

let target = window.scrollY;
let current = target;
let prev = target;
let idleTime = 0;

window.addEventListener("scroll", () => { target = window.scrollY; }, { passive: true });

// horizontal scrolling rides forward too: swipe right = pedal on
window.addEventListener("wheel", (e) => {
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    e.preventDefault();
    window.scrollBy(0, e.deltaX);
  }
}, { passive: false });

// arrow keys: → forward, ← back
window.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, textarea, button, a")) return;
  if (e.key === "ArrowRight") { e.preventDefault(); window.scrollBy({ top: 260, behavior: "smooth" }); }
  if (e.key === "ArrowLeft") { e.preventDefault(); window.scrollBy({ top: -260, behavior: "smooth" }); }
});

function frame(now) {
  current = lerp(current, target, reducedMotion ? 1 : 0.085);
  const velocity = current - prev;
  prev = current;

  const progress = clamp(current / maxScroll, 0, 1);

  // parallax layers
  els.far.style.transform = `translate3d(${-current * SPEEDS.far}px,0,0)`;
  els.mid.style.transform = `translate3d(${-current * SPEEDS.mid}px,0,0)`;
  els.near.style.transform = `translate3d(${-current * SPEEDS.near}px,0,0)`;
  els.ground.style.transform = `translate3d(${-current * SPEEDS.ground}px,0,0)`;
  els.foreground.style.transform = `translate3d(${-current * SPEEDS.foreground}px,0,0)`;

  // wheels: rotation from distance travelled
  const wheelDeg = current * 1.05;
  for (const g of spokeGroups) {
    g.setAttribute("transform", `rotate(${wheelDeg.toFixed(1)} ${g.dataset.cx} ${g.dataset.cy})`);
  }

  // pedaling: cranks turn slower than wheels; keep a lazy idle spin
  idleTime += Math.abs(velocity) < 0.05 ? 0.012 : 0;
  const crankAngle = current * 0.011 + idleTime;
  setLeg(legNear, crankNear, footNear, crankAngle);
  setLeg(legFar, crankFar, null, crankAngle + Math.PI);

  // bunny hop physics (triggered by clicking the biker)
  if (hopVel !== 0 || hopY > 0) {
    hopY += hopVel;
    hopVel -= 0.55;
    if (hopY <= 0) { hopY = 0; hopVel = 0; }
  }
  const hopRot = Math.min(hopY * 0.35, 16); // nose lifts during the hop

  // biker bob + lean with speed
  const bobY = Math.sin(current * 0.018) * 2.2;
  const lean = clamp(velocity * 0.18, -7, 7);
  els.biker.style.transform = `translate3d(0,${(bobY - hopY).toFixed(2)}px,0) rotate(${(-lean - hopRot).toFixed(2)}deg)`;

  // dust kicks up with speed (and on hop landings)
  els.dust.style.opacity = clamp(Math.abs(velocity) * 0.04 + (hopY > 0 ? 0.35 : 0), 0, 0.85).toFixed(2);

  // day → night across the ride
  const night = clamp((progress - 0.55) / 0.35, 0, 1);
  els.skyNight.style.opacity = night.toFixed(3);
  els.stars.style.opacity = (night * 0.95).toFixed(3);
  els.headlight.setAttribute("opacity", (night * 0.7).toFixed(2));

  // sun arcs across the sky, then sets; moon-ish color at night
  const sunX = lerp(72, 12, progress);
  const sunY = 14 + Math.pow(progress, 1.6) * 70;
  els.sun.style.left = sunX + "%";
  els.sun.style.top = sunY + "%";
  els.sun.style.filter = `hue-rotate(${progress * 28}deg)`;

  // progress bar
  els.progress.style.width = (progress * 100).toFixed(2) + "%";

  requestAnimationFrame(frame);
}

/* =====================================================
   REVEAL ON SCROLL
   ===================================================== */

const observer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) e.target.classList.add("visible");
    }
  },
  { threshold: 0.18 }
);
document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

/* =====================================================
   INIT
   ===================================================== */

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(buildScene, 200);
});

buildScene();
requestAnimationFrame(frame);
