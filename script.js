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
let sectionScrollTargets = {};

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
  sectionScrollTargets = {};
  for (const [id, label] of sections) {
    const sec = document.getElementById(id);
    if (!sec) continue;
    const sp = document.createElement("div");
    sp.className = "signpost";
    sp.dataset.target = id;
    // place the sign so it passes the biker when the section is centered on screen
    const x = bikerX + (sec.offsetTop - window.innerHeight * 0.18) * SPEEDS.ground + 320;
    sp.style.left = x + "px";
    // scrollY at which this landmark aligns with the biker (ground speed = 1)
    sectionScrollTargets[id] = clamp(x + 80 - bikerX, 0, maxScroll);
    sp.innerHTML = `<div class="post"></div><div class="sign">${label}</div>`;
    frag.appendChild(sp);

    // the landmark building for this section — click it to open the details
    if (LANDMARK_ART[id]) {
      const lm = document.createElement("div");
      lm.className = "landmark";
      lm.dataset.id = id;
      lm.innerHTML = `<div class="lm-label mono">${LM_LABELS[id]} <span class="lm-click">· click</span></div>${LANDMARK_ART[id]}`;
      lm.style.left = (x + 80) + "px";
      frag.appendChild(lm);
    }

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
   LANDMARKS — buildings along the trail, click to open
   ===================================================== */

const LM_LABELS = {
  about: "🏠 home · about me",
  experience: "🏢 work ·experience",
  projects: "🔧 garage · projects",
  skills: "🛠 gear shop · skills",
  education: "🏫 school · education",
  leadership: "🚩 club · leadership",
  contact: "📮 mail · say hi",
};

const LANDMARK_ART = {
  about: `<svg width="170" height="150" viewBox="0 0 170 150" xmlns="http://www.w3.org/2000/svg">
    <rect x="118" y="26" width="15" height="34" fill="#7a5c3e"/>
    <rect x="20" y="68" width="130" height="82" rx="3" fill="#efe3c8" stroke="#5a4330" stroke-width="3"/>
    <polygon points="8,72 85,14 162,72" fill="#a85638" stroke="#5a4330" stroke-width="3" stroke-linejoin="round"/>
    <rect x="71" y="98" width="28" height="52" rx="3" fill="#7a5c3e"/>
    <circle cx="94" cy="126" r="2.5" fill="#ffd166"/>
    <rect class="lm-window" x="34" y="86" width="25" height="22" rx="3"/>
    <rect class="lm-window" x="111" y="86" width="25" height="22" rx="3"/>
  </svg>`,
  experience: `<svg width="140" height="210" viewBox="0 0 140 210" xmlns="http://www.w3.org/2000/svg">
    <line x1="70" y1="22" x2="70" y2="4" stroke="#3d4a52" stroke-width="4"/>
    <circle cx="70" cy="4" r="3.5" fill="#ff7a3d"/>
    <rect x="20" y="22" width="100" height="188" rx="4" fill="#aebfc7" stroke="#3d4a52" stroke-width="3"/>
    <rect x="20" y="22" width="100" height="16" fill="#3d4a52"/>
    <rect class="lm-window" x="32" y="50" width="18" height="18" rx="2"/><rect class="lm-window" x="61" y="50" width="18" height="18" rx="2"/><rect class="lm-window" x="90" y="50" width="18" height="18" rx="2"/>
    <rect class="lm-window" x="32" y="80" width="18" height="18" rx="2"/><rect class="lm-window" x="61" y="80" width="18" height="18" rx="2"/><rect class="lm-window" x="90" y="80" width="18" height="18" rx="2"/>
    <rect class="lm-window" x="32" y="110" width="18" height="18" rx="2"/><rect class="lm-window" x="61" y="110" width="18" height="18" rx="2"/><rect class="lm-window" x="90" y="110" width="18" height="18" rx="2"/>
    <rect class="lm-window" x="32" y="140" width="18" height="18" rx="2"/><rect class="lm-window" x="90" y="140" width="18" height="18" rx="2"/>
    <rect x="55" y="176" width="30" height="34" rx="2" fill="#2e3b42"/>
  </svg>`,
  projects: `<svg width="180" height="140" viewBox="0 0 180 140" xmlns="http://www.w3.org/2000/svg">
    <rect x="14" y="52" width="152" height="88" rx="3" fill="#cdd6c0" stroke="#46553f" stroke-width="3"/>
    <polygon points="4,56 90,12 176,56" fill="#5d7050" stroke="#46553f" stroke-width="3" stroke-linejoin="round"/>
    <rect x="46" y="76" width="88" height="64" rx="3" fill="#6b7d5e"/>
    <line x1="46" y1="93" x2="134" y2="93" stroke="#54644a" stroke-width="3"/>
    <line x1="46" y1="109" x2="134" y2="109" stroke="#54644a" stroke-width="3"/>
    <line x1="46" y1="125" x2="134" y2="125" stroke="#54644a" stroke-width="3"/>
    <circle cx="90" cy="63" r="9" fill="none" stroke="#ffd166" stroke-width="4"/>
    <rect class="lm-window" x="20" y="78" width="18" height="18" rx="2"/>
    <rect class="lm-window" x="142" y="78" width="18" height="18" rx="2"/>
  </svg>`,
  skills: `<svg width="170" height="140" viewBox="0 0 170 140" xmlns="http://www.w3.org/2000/svg">
    <rect x="18" y="58" width="134" height="82" rx="3" fill="#e8d9bd" stroke="#6b5135" stroke-width="3"/>
    <polygon points="12,64 158,64 148,30 22,30" fill="#ff7a3d" stroke="#c2531a" stroke-width="3" stroke-linejoin="round"/>
    <text x="85" y="53" font-size="14" font-family="JetBrains Mono, monospace" fill="#fff" text-anchor="middle" font-weight="bold">GEAR</text>
    <rect class="lm-window" x="58" y="78" width="54" height="28" rx="3"/>
    <rect x="28" y="106" width="22" height="34" rx="2" fill="#6b5135"/>
  </svg>`,
  education: `<svg width="220" height="175" viewBox="0 0 220 175" xmlns="http://www.w3.org/2000/svg">
    <line x1="110" y1="30" x2="110" y2="2" stroke="#6e3c2a" stroke-width="3"/>
    <polygon points="110,3 136,9 110,15" fill="#9d2235"/>
    <polygon points="84,34 110,12 136,34" fill="#6e3c2a"/>
    <rect x="92" y="32" width="36" height="48" fill="#b56a52" stroke="#6e3c2a" stroke-width="3"/>
    <circle cx="110" cy="54" r="9" fill="#fff7e8" stroke="#6e3c2a" stroke-width="2.5"/>
    <line x1="110" y1="54" x2="110" y2="48" stroke="#6e3c2a" stroke-width="2"/>
    <line x1="110" y1="54" x2="115" y2="56" stroke="#6e3c2a" stroke-width="2"/>
    <rect x="14" y="78" width="192" height="97" rx="3" fill="#c97f64" stroke="#6e3c2a" stroke-width="3"/>
    <rect x="96" y="128" width="28" height="47" rx="3" fill="#5a3526"/>
    <rect class="lm-window" x="28" y="96" width="24" height="22" rx="2"/><rect class="lm-window" x="60" y="96" width="24" height="22" rx="2"/>
    <rect class="lm-window" x="136" y="96" width="24" height="22" rx="2"/><rect class="lm-window" x="168" y="96" width="24" height="22" rx="2"/>
  </svg>`,
  leadership: `<svg width="180" height="160" viewBox="0 0 180 160" xmlns="http://www.w3.org/2000/svg">
    <line x1="162" y1="160" x2="162" y2="16" stroke="#5a4330" stroke-width="4"/>
    <polygon points="162,18 124,27 162,36" fill="#ffd166"/>
    <polygon points="0,74 70,26 140,74" fill="#5a4330"/>
    <rect x="10" y="70" width="120" height="90" rx="3" fill="#9a6b43" stroke="#5a4330" stroke-width="3"/>
    <line x1="10" y1="94" x2="130" y2="94" stroke="#83592f" stroke-width="2.5"/>
    <line x1="10" y1="116" x2="130" y2="116" stroke="#83592f" stroke-width="2.5"/>
    <line x1="10" y1="138" x2="130" y2="138" stroke="#83592f" stroke-width="2.5"/>
    <rect x="56" y="110" width="26" height="50" rx="3" fill="#3f2d1d"/>
    <rect class="lm-window" x="22" y="80" width="22" height="20" rx="2"/>
    <rect class="lm-window" x="96" y="80" width="22" height="20" rx="2"/>
  </svg>`,
  contact: `<svg width="115" height="140" viewBox="0 0 115 140" xmlns="http://www.w3.org/2000/svg">
    <rect x="50" y="62" width="11" height="78" fill="#5a4330"/>
    <rect x="14" y="26" width="82" height="40" rx="18" fill="#ff7a3d" stroke="#b54a16" stroke-width="3"/>
    <rect x="88" y="6" width="5" height="24" fill="#9d2235"/>
    <polygon points="93,6 112,12 93,18" fill="#9d2235"/>
    <text x="55" y="51" font-family="JetBrains Mono, monospace" font-size="13" fill="#fff" text-anchor="middle" font-weight="bold">MAIL</text>
  </svg>`,
};

function openPopup(id) {
  const p = document.getElementById("popup-" + id);
  if (!p) return;
  p.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closePopups() {
  document.querySelectorAll(".popup.open").forEach((p) => p.classList.remove("open"));
  document.body.style.overflow = "";
}

const isSmallScreen = () => window.innerWidth < 768;

function scrollToSection(id) {
  if (isSmallScreen() && sectionScrollTargets[id] != null) {
    window.scrollTo({ top: sectionScrollTargets[id], behavior: "smooth" });
  } else {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }
}

function canScrollPage() {
  if (document.body.style.overflow === "hidden") return false;
  if (document.activeElement?.closest("input, textarea, select, [contenteditable='true']")) return false;
  return true;
}

const SCROLL_STEP = () => window.innerHeight * 0.15;

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") return closePopups();
  if (!canScrollPage()) return;

  let delta = 0;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") delta = SCROLL_STEP();
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") delta = -SCROLL_STEP();
  else return;

  e.preventDefault();
  window.scrollBy({
    top: delta,
    behavior: reducedMotion ? "auto" : "smooth",
  });
});

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
  if (e.target.closest(".popup-close")) return closePopups();
  if (e.target.classList && e.target.classList.contains("popup")) return closePopups();

  const lm = e.target.closest(".landmark");
  if (lm) return openPopup(lm.dataset.id);

  const badge = e.target.closest(".collectible");
  if (badge) return collectBadge(badge, e);

  const sign = e.target.closest(".signpost");
  if (sign) {
    scrollToSection(sign.dataset.target);
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
   FLOATING SECTION DOCK
   ===================================================== */

const navLinks = [...document.querySelectorAll("#topnav a")];
const navSlider = document.getElementById("nav-slider");
let navTops = [];
let activeNav = -1;

function cacheNavTops() {
  navTops = navLinks.map((a) => document.getElementById(a.dataset.target)?.offsetTop ?? 0);
}

function moveSlider(i) {
  const a = navLinks[i];
  navSlider.style.width = a.offsetWidth + "px";
  navSlider.style.transform = `translateX(${a.offsetLeft}px)`;
  // keep the active link visible when the dock overflows (narrow screens)
  const nav = a.closest("#topnav");
  nav.scrollTo({
    left: a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2,
    behavior: "smooth",
  });
}

function updateNav(scrollPos) {
  const pos = scrollPos + window.innerHeight * 0.45;
  let i = 0;
  for (let k = 0; k < navTops.length; k++) if (pos >= navTops[k]) i = k;
  if (i !== activeNav) {
    activeNav = i;
    navLinks.forEach((a, k) => a.classList.toggle("active", k === i));
    moveSlider(i);
  }
}

navLinks.forEach((a) =>
  a.addEventListener("click", () => {
    scrollToSection(a.dataset.target);
  })
);

/* =====================================================
   MAIN LOOP
   ===================================================== */

let target = window.scrollY;
let current = target;
let prev = target;
let idleTime = 0;

window.addEventListener("scroll", () => { target = window.scrollY; }, { passive: true });

window.addEventListener("wheel", (e) => {
  if (!canScrollPage()) return;

  const { deltaX, deltaY } = e;
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    e.preventDefault();
    window.scrollBy({ top: deltaX, left: 0, behavior: "auto" });
  }
}, { passive: false });

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
  document.body.classList.toggle("night", night > 0.5);
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

  // section dock indicator
  updateNav(current);

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
let lastW = window.innerWidth, lastH = window.innerHeight;
window.addEventListener("resize", () => {
  // ignore height-only changes from the mobile URL bar hiding/showing
  const wChanged = window.innerWidth !== lastW;
  const hChanged = Math.abs(window.innerHeight - lastH) > 150;
  if (!wChanged && !hChanged) return;
  lastW = window.innerWidth;
  lastH = window.innerHeight;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    buildScene();
    cacheNavTops();
    if (activeNav >= 0) moveSlider(activeNav);
  }, 200);
});

buildScene();
cacheNavTops();
updateNav(window.scrollY);
requestAnimationFrame(frame);
