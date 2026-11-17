/* =====================================================
   One line-icon set for the whole site (24px grid, 1.75
   stroke). Used as <svg class="ico"><use href="#i-name"/></svg>
   in the HTML, and as engraved glyphs on the 3D coins.
   ===================================================== */

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  building: '<path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  cap: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6"/>',
  flag: '<path d="M6 21V4M6 4h11l-2.500 4 2.500 4H6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 11v6M8 7.500v.01M12 17v-3.500a2.500 2.500 0 0 1 5 0V17M12 11v6"/>',
  github: '<path d="M15 22v-4a4.800 4.800 0 0 0-1-3.500c3 0 6-2 6-5.500.08-1.250-.27-2.480-1-3.500.28-1.150.28-2.350 0-3.500 0 0-1 0-3 1.500-2.640-.5-5.360-.5-8 0C6 2 5 2 5 2c-.3 1.150-.3 2.350 0 3.500A5.400 5.400 0 0 0 4 9c0 3.500 3 5.500 6 5.500-.39.49-.68 1.050-.85 1.650-.17.6-.22 1.230-.15 1.850v4"/><path d="M9 18c-4.510 2-5-2-7-2"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  play: '<path d="M7 5v14l12-7z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.500"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  pin: '<path d="M12 21s-7-6.200-7-11a7 7 0 0 1 14 0c0 4.800-7 11-7 11z"/><circle cx="12" cy="10" r="2.500"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.500 2.600 3.800 5.600 3.800 9s-1.300 6.400-3.800 9c-2.500-2.600-3.800-5.600-3.800-9S9.500 5.600 12 3z"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.500 14 7 22l5-3 5 3-1.500-8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  external: '<path d="M7 17 17 7M8 7h9v9"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  message: '<path d="M21 12a8 8 0 0 1-8 8H4l2.200-3A8 8 0 1 1 21 12z"/>',
  file: '<path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7z"/><path d="M14 3v4h4M9 13h6M9 17h4"/>',
  restart: '<path d="M3 12a9 9 0 1 0 3-6.700M3 4v5h5"/>',
  coin: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.500 8.500a5 5 0 0 1 0 7M19 6a8.500 8.500 0 0 1 0 12"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="m17 9.500 5 5M22 9.500l-5 5"/>',
  leaf: '<path d="M5 19c0-8 5-13 15-14 0 9-4 15-12 15-1.700 0-3-.4-3-1zM5 19l8-8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  snow: '<path d="M12 2v20M3.500 7l17 10M20.500 7l-17 10M9.500 3.500 12 6l2.500-2.500M9.500 20.500 12 18l2.500 2.500"/>',
  rain: '<path d="M7 15a4.500 4.500 0 1 1 1.200-8.800A6 6 0 0 1 19.500 9 3.500 3.500 0 0 1 18 15.700M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
  check: '<path d="m5 12.500 4.500 4.500L19 7.500"/>',
  shield: '<path d="M12 3l7 3v5.500c0 4.500-3 7.800-7 9.500-4-1.700-7-5-7-9.500V6z"/><path d="m9 12 2.200 2.200L15.200 10"/>',
  users: '<circle cx="9" cy="8" r="3.500"/><path d="M2.500 20a6.500 6.500 0 0 1 13 0M16 4.700a3.500 3.500 0 0 1 0 6.600M18 14.200a6.500 6.500 0 0 1 3.500 5.800"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.500 2.500M15.500 15.500 18 18M18 6l-2.500 2.500M8.500 15.500 6 18"/>',
};

/* path-only glyphs for the collectible coins (drawn onto canvas) */
export const COIN_GLYPHS = {
  about: "M6 11h12v9H6z M8.500 11V8a3.500 3.500 0 0 1 7 0v3",                                        // lock
  experience: "M12 3l7 3v5.500c0 4.500-3 7.800-7 9.500-4-1.700-7-5-7-9.500V6z M9 12l2.200 2.200L15.200 10",   // shield
  projects: "M9 8a3 3 0 0 1 6 0 M7 11a5 5 0 0 1 10 0v4a5 5 0 0 1-10 0z M12 11v9 M7 13H3 M21 13h-4 M7 17l-3 2 M17 17l3 2 M7.500 9 5 7 M16.500 9 19 7", // bug
  skills: "M12 16a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M10.800 13.200 20 4 M16 8l3 3 M18.500 5.500l1.500 1.500",   // key
  education: "M12 13v8 M12 13a1.500 1.500 0 1 0 0-3 1.500 1.500 0 0 0 0 3z M8 15.500a5.500 5.500 0 0 1 0-8 M16 7.500a5.500 5.500 0 0 1 0 8 M5.200 18.300a9.500 9.500 0 0 1 0-13.600 M18.800 4.700a9.500 9.500 0 0 1 0 13.600", // signal
  leadership: "M3 19 9.500 7l4 7 2-3 5.500 8z",                                                       // summit
  contact: "M6 21V4 M6 4h11l-2.500 4 2.500 4H6",                                                     // flag
};

export const icon = (name, cls = "") => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/* inject the sprite once so <use href="#i-…"> resolves everywhere */
export function mountIcons() {
  if (document.getElementById("icon-sprite")) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "icon-sprite";
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  svg.innerHTML = Object.entries(ICONS)
    .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`)
    .join("");
  document.body.prepend(svg);
}
