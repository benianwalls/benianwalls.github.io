/* =====================================================
   Benian Walls — scroll-driven 3D mountain bike world
   (the scene itself lives in world.js)
   ===================================================== */

import { createWorld, SECTION_IDS, STOP_PROGRESS } from "./world.js";
import { initCoach } from "./coach.js";
import { icon, mountIcons } from "./icons.js";

mountIcons();

/* a missing image hides itself (and its caption) instead of showing a broken icon */
for (const img of document.images) {
  img.addEventListener("error", () => { (img.closest(".photo") ?? img).style.display = "none"; });
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isTouch = window.matchMedia("(hover: none)").matches;
const TAP_WORD = isTouch ? "tap" : "click";

/* ---------- helpers ---------- */
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const rand = (min, max) => min + Math.random() * (max - min);

/* track whether the last interaction came from the keyboard so we can
   ride to landmarks that receive focus via Tab (but not via pointer) */
let usingKeyboard = false;
window.addEventListener("keydown", (e) => { if (e.key === "Tab") usingKeyboard = true; }, true);
window.addEventListener("mousedown", () => { usingKeyboard = false; }, true);
window.addEventListener("touchstart", () => { usingKeyboard = false; }, true);

const els = {
  canvas: document.getElementById("gl"),
  labels: document.getElementById("lm-layer"),
  loader: document.getElementById("loader"),
  progress: document.getElementById("trail-progress-fill"),
};

let maxScroll = 1;
let sectionScrollTargets = {};

/* each landmark sits at an even fraction of the ride; the scroll position
   that parks the rider beside it is that fraction of the page */
function measure() {
  maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  SECTION_IDS.forEach((id, i) => {
    sectionScrollTargets[id] = Math.round(STOP_PROGRESS[i] * maxScroll);
  });
}

/* =====================================================
   LANDMARK LABELS — HTML tags pinned over the 3D buildings
   ===================================================== */

const LM_LABELS = {
  about: ["home", "About"],
  experience: ["building", "Experience"],
  projects: ["wrench", "Projects"],
  skills: ["sliders", "Skills"],
  education: ["cap", "Education"],
  leadership: ["flag", "Leadership"],
  contact: ["mail", "Contact"],
};

const labelEls = {};
for (const id of SECTION_IDS) {
  const b = document.createElement("button");
  b.className = "lm-tag";
  b.dataset.id = id;
  b.setAttribute("aria-label", `Open ${id} details`);
  b.title = `${TAP_WORD === "tap" ? "Tap" : "Click"} to open`;
  b.innerHTML = `<span class="lm-label">${icon(LM_LABELS[id][0])}<span><span class="lm-verb">View </span>${LM_LABELS[id][1]}</span>${icon("arrow", "lm-go")}</span>`;
  b.style.visibility = "hidden";
  // tabbing to an off-screen building rides the trail to it
  b.addEventListener("focus", () => {
    if (usingKeyboard) scrollToSection(id);
  });
  els.labels.appendChild(b);
  labelEls[id] = b;
}

/* =====================================================
   POPUPS
   ===================================================== */

let lastFocused = null;
let openId = null;

function openPopup(id) {
  const p = document.getElementById("popup-" + id);
  if (!p) return;
  // opening one card while another is up swaps them in place (no second slide-in)
  const others = [...document.querySelectorAll(".popup.open")].filter((o) => o !== p);
  others.forEach((o) => o.classList.remove("open"));
  p.classList.toggle("swap", others.length > 0);
  if (!others.length) lastFocused = document.activeElement;
  p.classList.add("open");
  p.querySelector(".popup-panel").scrollTop = 0;
  openId = id;
  // the address bar follows the open stop, so the link can be copied and shared
  if (LM_LABELS[id]) history.replaceState(null, "", "#" + id);
  world?.activate(id, true); // the building comes alive behind its card
  document.body.style.overflow = "hidden";
  p.querySelector(".popup-close")?.focus({ preventScroll: true });
}

/* ride to a stop and open its card (used by the card's previous/next buttons
   and by clicking another building while a card is open) */
function goTo(id) {
  scrollToSection(id);
  openPopup(id);
}

/* previous / next at the foot of every stop's card */
SECTION_IDS.forEach((id, i) => {
  const panel = document.querySelector(`#popup-${id} .popup-panel`);
  if (!panel) return;
  const nav = document.createElement("nav");
  nav.className = "card-nav";
  nav.setAttribute("aria-label", "Other sections");
  const link = (j, dir) => {
    if (j < 0 || j >= SECTION_IDS.length) return "<span></span>";
    const name = LM_LABELS[SECTION_IDS[j]][1];
    return dir < 0
      ? `<button class="card-nav-btn" data-go="${SECTION_IDS[j]}">${icon("back")}<span><small>Previous</small>${name}</span></button>`
      : `<button class="card-nav-btn next" data-go="${SECTION_IDS[j]}"><span><small>Next</small>${name}</span>${icon("arrow")}</button>`;
  };
  nav.innerHTML = link(i - 1, -1) + link(i + 1, 1);
  panel.appendChild(nav);
});

function closePopups() {
  document.querySelectorAll(".popup.open").forEach((p) => p.classList.remove("open"));
  openId = null;
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  document.body.style.overflow = "";
  if (lastFocused?.focus) lastFocused.focus({ preventScroll: true });
  lastFocused = null;
}

/* swipe down on a popup card (when scrolled to the top) dismisses it */
document.querySelectorAll(".popup-panel").forEach((panel) => {
  let startY = 0, startedAtTop = false;
  panel.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
    startedAtTop = panel.scrollTop <= 0;
  }, { passive: true });
  panel.addEventListener("touchend", (e) => {
    const dy = e.changedTouches[0].clientY - startY;
    if (startedAtTop && panel.scrollTop <= 0 && dy > 90) closePopups();
  }, { passive: true });
});

function scrollToSection(id) {
  const y = id === "start" ? 0 : sectionScrollTargets[id];
  if (y == null) return;
  window.scrollTo({ top: y, behavior: reducedMotion ? "auto" : "smooth" });
}

function canScrollPage() {
  if (document.body.style.overflow === "hidden") return false;
  if (document.activeElement?.closest("input, textarea, select, [contenteditable='true']")) return false;
  return true;
}

const SCROLL_STEP = () => window.innerHeight * 0.15;

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") return closePopups();
  // with a stop's card open, the arrow keys step through the stops
  const at = SECTION_IDS.indexOf(openId);
  if (at >= 0 && (e.key === "ArrowRight" || e.key === "ArrowLeft") && !e.target.closest?.("input, textarea")) {
    const next = SECTION_IDS[at + (e.key === "ArrowRight" ? 1 : -1)];
    if (next) { e.preventDefault(); goTo(next); }
    return;
  }
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

const BADGE_TOTAL = SECTION_IDS.length;
const collected = new Set();

const hud = document.getElementById("hud");
const badgeCount = document.getElementById("badge-count");
document.getElementById("badge-total").textContent = BADGE_TOTAL;

let world = null;

document.addEventListener("click", (e) => {
  if (e.target.closest(".popup-close")) return closePopups();
  if (e.target.classList && e.target.classList.contains("popup")) return closePopups();

  const go = e.target.closest("[data-go]");
  if (go) return goTo(go.dataset.go);

  const tag = e.target.closest(".lm-tag");
  if (tag) return openPopup(tag.dataset.id);

  if (e.target !== els.canvas || !world) return;
  const hit = world.pick(e.clientX, e.clientY);
  if (openId) {
    // a card is open beside the scene: another building switches to it, anywhere else closes
    if (hit?.type === "landmark") return hit.id === openId ? world.activate(hit.id, true) : goTo(hit.id);
    return closePopups();
  }
  if (!hit) return;
  if (hit.type === "landmark") return openPopup(hit.id);
  if (hit.type === "badge") return collectBadge(hit.id, e);
  if (hit.type === "sign") return scrollToSection(hit.id);
  if (hit.type === "biker") return world.hop();
  world.poke(hit); // trees shake, rocks bounce
});

function replay(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // restart the animation
  el.classList.add(cls);
}

function collectBadge(id, e) {
  if (collected.has(id)) return;
  collected.add(id);
  world.collectBadge(id);

  const f = document.createElement("div");
  f.className = "floater";
  f.textContent = "+1";
  f.style.left = e.clientX + "px";
  f.style.top = (e.clientY - 24) + "px";
  document.body.appendChild(f);
  setTimeout(() => f.remove(), 950);

  badgeCount.textContent = collected.size;
  hud.classList.add("found"); // the counter only appears once there is something to count
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
  world?.setHacked(on);
}

hackToggle.addEventListener("click", () => setHacked(!document.body.classList.contains("hacked")));

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
   FLOATING SECTION DOCK
   ===================================================== */

const navLinks = [...document.querySelectorAll("#topnav a")];
const navSlider = document.getElementById("nav-slider");
let navTops = [];
let activeNav = -1;

function cacheNavTops() {
  navTops = navLinks.map((a) => (a.dataset.target === "start" ? 0 : sectionScrollTargets[a.dataset.target] ?? 0));
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
  // a section is "current" once the rider is most of the way to it
  const step = maxScroll / SECTION_IDS.length;
  const pos = scrollPos + step * 0.45;
  let i = 0;
  for (let k = 0; k < navTops.length; k++) if (pos >= navTops[k]) i = k;
  if (i !== activeNav) {
    activeNav = i;
    navLinks.forEach((a, k) => {
      const on = k === i;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
    moveSlider(i);
  }
}

navLinks.forEach((a) =>
  a.addEventListener("click", (e) => {
    e.preventDefault();
    scrollToSection(a.dataset.target);
  })
);

/* =====================================================
   SCROLL STATE
   ===================================================== */

let target = window.scrollY;
let current = target;

window.addEventListener("scroll", () => {
  target = window.scrollY;
  document.body.classList.toggle("riding", window.scrollY > 80);
}, { passive: true });

document.getElementById("scroll-cta")?.addEventListener("click", () => scrollToSection("about"));
document.getElementById("quick-btn")?.addEventListener("click", () => openPopup("quick"));

initCoach({ openPopup: (id) => { closePopups(); openPopup(id); } });

/* =====================================================
   AUTO-RIDE TOUR
   ===================================================== */

const tourBtn = document.getElementById("tour-btn");
let tourActive = false;
let tourPopupOpen = false; // true while a tour card is open and awaiting the visitor

function setTourBtn(ico, label) {
  if (tourBtn) tourBtn.innerHTML = `${icon(ico)}<span>${label}</span>`;
}

const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

function tweenScroll(to, duration) {
  return new Promise((resolve) => {
    if (duration <= 0) {
      window.scrollTo(0, to);
      return resolve(true);
    }
    const from = window.scrollY;
    const change = to - from;
    const start = performance.now();
    (function step(now) {
      if (!tourActive) return resolve(false);
      const t = clamp((now - start) / duration, 0, 1);
      // gentle accel/decel; CSS smooth-scroll is disabled during the tour so
      // each step lands instantly and this curve drives the whole motion
      window.scrollTo(0, Math.round(from + change * easeInOutSine(t)));
      if (t < 1) requestAnimationFrame(step);
      else resolve(true);
    })(performance.now());
  });
}

function tourPause(ms) {
  return new Promise((resolve) => {
    const start = performance.now();
    (function check() {
      if (!tourActive) return resolve(false);
      if (performance.now() - start >= ms) return resolve(true);
      requestAnimationFrame(check);
    })();
  });
}

// resolves once the visitor closes the open card (or false if the tour stops)
function waitForPopupClose() {
  return new Promise((resolve) => {
    (function check() {
      if (!tourActive) return resolve(false);
      if (!document.querySelector(".popup.open")) return resolve(true);
      requestAnimationFrame(check);
    })();
  });
}

async function startTour() {
  tourActive = true;
  document.body.classList.add("touring");
  // disable CSS smooth-scroll so our per-frame steps don't fight the browser's
  // own scroll animation (the cause of the stutter)
  document.documentElement.style.scrollBehavior = "auto";
  setTourBtn("stop", "Stop tour");
  closePopups();
  for (let i = 0; i < SECTION_IDS.length; i++) {
    const id = SECTION_IDS[i];
    const y = sectionScrollTargets[id];
    const dist = Math.abs(y - window.scrollY);
    // constant riding speed so every leg feels the same
    const duration = reducedMotion ? 0 : clamp(dist * 2.4, 1200, 6000);
    if (!(await tweenScroll(y, duration))) return;
    if (!(await tourPause(650))) return; // let the scene settle at the landmark
    openPopup(id);
    // ride on only once the visitor closes the card
    tourPopupOpen = true;
    if (!(await waitForPopupClose())) return;
    tourPopupOpen = false;
    if (!(await tourPause(450))) return; // brief beat before the next leg
  }
  // last leg: under the arch to the overlook, where the closing card opens itself
  if (!(await tweenScroll(maxScroll, reducedMotion ? 0 : 3200))) return;
  stopTour();
}

function stopTour() {
  tourActive = false;
  tourPopupOpen = false;
  document.body.classList.remove("touring");
  document.documentElement.style.scrollBehavior = "";
  setTourBtn("play", "Take the tour");
}

tourBtn?.addEventListener("click", () => (tourActive ? stopTour() : startTour()));

// manual input during a ride leg hands control back; but while a tour card is
// open we expect the visitor to read, scroll, and close it (which advances)
for (const evt of ["wheel", "touchstart", "keydown", "mousedown"]) {
  window.addEventListener(evt, (e) => {
    if (!tourActive || tourPopupOpen) return;
    if (e.target?.closest?.("#tour-btn")) return;
    stopTour();
  }, { passive: true });
}

for (const b of document.querySelectorAll(".back-to-start")) {
  b.addEventListener("click", () => {
    closePopups();
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  });
}

/* the ending: once the rider coasts to the overlook and the camera has pulled
   back, the closing card arrives by itself (once per trip to the end) */
let endTimer = 0, finishShown = false;
function updateEnding(progress, dt) {
  if (progress > 0.995) {
    endTimer += dt;
    if (endTimer > 2.2 && !finishShown && !openId) {
      finishShown = true;
      document.getElementById("finish-coins").textContent = collected.size
        ? `Seven stops, and ${collected.size} of ${BADGE_TOTAL} coins found.`
        : "Seven stops down.";
      openPopup("finish");
    }
  } else if (progress < 0.95) {
    endTimer = 0;
    finishShown = false;
  }
}

window.addEventListener("wheel", (e) => {
  if (!canScrollPage()) return;

  const { deltaX, deltaY } = e;
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    e.preventDefault();
    window.scrollBy({ top: deltaX, left: 0, behavior: "auto" });
  }
}, { passive: false });

/* touch drag: pull the world sideways to ride (phones) */
let touchX = 0, touchY = 0, touchAxis = null, touchOnNav = false;

window.addEventListener("touchstart", (e) => {
  if (e.touches.length !== 1) return;
  touchX = e.touches[0].clientX;
  touchY = e.touches[0].clientY;
  touchAxis = null;
  touchOnNav = !!e.target.closest("#topnav, #coach"); // these scroll themselves
}, { passive: true });

window.addEventListener("touchmove", (e) => {
  if (touchOnNav || !canScrollPage() || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - touchX;
  const dy = e.touches[0].clientY - touchY;
  if (touchAxis === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
    touchAxis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
  }
  if (touchAxis === "x") {
    e.preventDefault();
    // dragging the world left rides forward
    window.scrollBy({ top: -dx * 1.4, left: 0, behavior: "auto" });
  }
  touchX = e.touches[0].clientX;
  touchY = e.touches[0].clientY;
}, { passive: false });

/* =====================================================
   MAIN LOOP
   ===================================================== */

let last = performance.now();
const themeMeta = document.querySelector('meta[name="theme-color"]');
let lastSky = "";
let slowFrames = 0, sampled = 0, degraded = false, prevNow = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  current = reducedMotion ? target : lerp(current, target, 1 - Math.exp(-5.2 * dt));
  if (Math.abs(current - target) < 0.05) current = target;
  const progress = clamp(current / maxScroll, 0, 1);

  const { night, sky } = world.frame({ progress, dt, popupId: openId, reducedMotion, labels: labelEls });
  // phone browsers tint their toolbar with the page's theme colour: keep it matched to the sky
  if (sky !== lastSky) { lastSky = sky; themeMeta?.setAttribute("content", "#" + sky); }
  document.body.classList.toggle("night", night > 0.5);

  els.progress.style.width = (progress * 100).toFixed(2) + "%";
  updateEnding(progress, dt);
  updateNav(current);

  // a struggling GPU gets a lighter scene (sampled over the first few seconds)
  // (gaps over 150ms mean the tab was throttled, not that the GPU is slow)
  const rawDt = (now - prevNow) / 1000;
  prevNow = now;
  if (!degraded && sampled < 240 && document.visibilityState === "visible" && rawDt < 0.15) {
    sampled++;
    if (rawDt > 0.034) slowFrames++;
    if (sampled === 240 && slowFrames > 120) {
      degraded = true;
      world.degrade();
    }
  }

  requestAnimationFrame(frame);
}

/* =====================================================
   INIT
   ===================================================== */

let resizeTimer;
let lastW = window.innerWidth, lastH = window.innerHeight;
window.addEventListener("resize", () => {
  world?.resize();
  // ignore height-only changes from the mobile URL bar hiding/showing
  const wChanged = window.innerWidth !== lastW;
  const hChanged = Math.abs(window.innerHeight - lastH) > 150;
  if (!wChanged && !hChanged) return;
  lastW = window.innerWidth;
  lastH = window.innerHeight;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    measure();
    cacheNavTops();
    target = window.scrollY;
    if (activeNav >= 0) moveSlider(activeNav);
  }, 200);
});

/* deep links: visiting /#projects (etc.) rides to that landmark and opens it */
function openFromHash() {
  const id = location.hash.slice(1);
  if (!LM_LABELS[id]) return;
  const y = sectionScrollTargets[id];
  if (y != null) {
    target = current = y;
    window.scrollTo(0, y);
  }
  openPopup(id);
}
window.addEventListener("hashchange", openFromHash);

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

async function init() {
  if (!webglAvailable()) {
    location.replace("classic/" + location.hash);
    return;
  }
  measure();
  cacheNavTops();
  updateNav(window.scrollY);

  const mobile = isTouch || window.innerWidth < 768;
  world = await createWorld({
    canvas: els.canvas,
    quality: {
      mobile,
      touch: isTouch,
      shadows: !mobile,
      bloom: !mobile,
      dpr: Math.min(window.devicePixelRatio || 1, mobile ? 1.6 : 2),
    },
  });

  SECTION_IDS.forEach((id, i) => {
    if (!collected.has(id)) world.addBadge(id, i);
  });

  // returning trail masters keep their unlock
  if (localStorage.getItem("trailMaster") === "1") {
    hackToggle.hidden = false;
    if (localStorage.getItem("hackMode") === "1") setHacked(true);
  }

  if (location.search.includes("debug")) {
    window.__ride = (id) => {
      const y = typeof id === "number" ? id : sectionScrollTargets[id] ?? 0;
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, y);
      target = current = y;
    };
  }

  openFromHash();
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
    els.loader?.classList.add("done");
    setTimeout(() => els.loader?.remove(), 900);
  });
}

init().catch((err) => {
  console.error(err);
  location.replace("classic/" + location.hash);
});
