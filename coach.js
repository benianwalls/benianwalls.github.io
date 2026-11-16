/* =====================================================
   Recruiter coach — answers questions about Benian from
   coach/knowledge.md. Works fully in the browser; if a
   <meta name="coach-endpoint"> is set, answers stream from
   the Claude-backed worker instead (local engine is the
   fallback).
   ===================================================== */

import { icon } from "./icons.js";

const EMAIL = "bwalls06@outlook.com";
const SECTION_NAMES = {
  about: "About", experience: "Experience", projects: "Projects", skills: "Skills",
  education: "Education", leadership: "Leadership", contact: "Contact",
};
const SUGGESTIONS = [
  "What security tools has he used?",
  "Tell me about MalwareScope",
  "What did he do at the airport?",
  "When does he graduate?",
  "What is the OpenAI Student Collective?",
  "How do I contact him?",
];

/* ---------- knowledge ---------- */

let entries = [];
let idf = new Map();

const STOP = new Set("experience experiences know knows use used done work worked working a an the is are was were be been do does did has have had of to in on at for with and or but what which who whom whose when where why how his him he her she they their benian walls benian's about tell me can could would you your any some this that there it its as by from does i we our please much many kind".split(" "));

const SYNONYMS = {
  job: ["intern", "specialist", "support"], work: ["intern", "specialist"],
  worked: ["intern", "specialist"], internship: ["intern"], internships: ["intern", "open"],
  airport: ["indianapolis", "airport"], iaa: ["indianapolis", "airport"],
  code: ["python", "programming", "github"], coding: ["python", "programming"], program: ["programming"],
  languages: ["python", "java", "sql", "javascript", "english", "turkish"], language: ["python", "english", "turkish"],
  speak: ["english", "turkish", "fluently"], spoken: ["english", "turkish"],
  school: ["indiana", "university", "luddy"], college: ["indiana", "university"], university: ["indiana"],
  degree: ["b.s", "cybersecurity", "graduating", "minor"], major: ["cybersecurity", "policy"],
  graduate: ["graduating", "may", "2028"], graduation: ["graduating", "2028"], grad: ["graduating", "2028"],
  gpa: ["gpa"], grades: ["gpa"], certs: ["certificate"], certifications: ["certificate"], certified: ["certificate"],
  lead: ["leadership", "president"], leadership: ["president", "board", "club"], leader: ["president", "leadership"], manage: ["president", "board", "managing"],
  team: ["board", "members", "club"], club: ["club"], clubs: ["club"],
  contact: ["email", "linkedin"], reach: ["email"], hire: ["email", "open"], email: ["email"],
  ai: ["llm", "genai", "ml", "machine", "pytorch"], ml: ["machine", "pytorch", "scikit"], llm: ["llm", "prompt"],
  malware: ["malwarescope", "malware"], siem: ["siem"], soc: ["siem", "threat", "monitoring"],
  vulnerability: ["nessus", "vulnerability"], vulnerabilities: ["nessus", "vulnerability"], vuln: ["vulnerability", "nessus"],
  phishing: ["gophish", "phishing"], firewall: ["firewalls"], network: ["networking", "network"],
  tools: ["nessus", "nmap", "wireshark", "tools"], security: ["security"], cloud: ["cloud"],
  hobbies: ["fishing", "traveling", "biking"], fun: ["fishing", "traveling", "biking"],
  located: ["bloomington"], location: ["bloomington"], live: ["bloomington"], based: ["bloomington"],
  projects: ["project", "malwarescope", "lab", "scanner"], built: ["built", "project"],
  resume: ["resume", "pdf"], cv: ["resume", "pdf"], linkedin: ["linkedin"], github: ["github"],
};

/* words that point at a section even when the bullet text doesn't repeat them */
const SECTION_HINTS = {
  education: /\b(graduat\w*|grad|gpa|grades|degree|major|minor|school|college|universit\w*|stud\w*|cert\w*|course\w*)\b/i,
  leadership: /\b(lead\w*|president|club\w*|manag\w*|team\w*|organi[sz]\w*|initiative|openai|collective|campus)\b/i,
  experience: /\b(work\w*|job\w*|intern\w*|employ\w*|role\w*|siem|soc|airport|byteshield|uits|professional|experience)\b/i,
  skills: /\b(skill\w*|tools?|know|knows|familiar|proficien\w*|programming|coding|stack|technolog\w*)\b/i,
  projects: /\b(project\w*|built|build|portfolio|github|malwarescope|lab|scanner)\b/i,
  contact: /\b(contact|reach|email|linkedin|connect|hire|resume|cv)\b/i,
};

const stem = (w) => w.replace(/'s$/, "").replace(/(ing|ed|es|s)$/, (m, _, i, s) => (s.length - m.length >= 4 ? "" : m));
const tokens = (text) => text.toLowerCase().match(/[a-z0-9.+#]+/g)?.map((w) => w.replace(/\.$/, "")) ?? [];

function parseKnowledge(md) {
  const out = [];
  let section = null;
  for (const line of md.split("\n")) {
    const h = line.match(/^##\s+.*\{#(\w+)\}/);
    if (h) { section = h[1]; continue; }
    const b = line.match(/^-\s+(.*)/);
    if (b && section) {
      const text = b[1].trim();
      out.push({ section, text, terms: new Set(tokens(text).map(stem)) });
    }
  }
  return out;
}

function buildIndex(md) {
  entries = parseKnowledge(md);
  const df = new Map();
  for (const e of entries) for (const t of e.terms) df.set(t, (df.get(t) || 0) + 1);
  idf = new Map([...df].map(([t, n]) => [t, Math.log(1 + entries.length / n)]));
}

/* ---------- the in-browser answer engine ---------- */

const ASK_DIRECTLY = /\b(visa|sponsor|sponsorship|citizen|citizenship|authori[sz]ed|salary|pay|compensation|relocat\w*|remote|hybrid|start date|references?|phone|clearance|address|weakness\w*)\b/i;
const SUMMARY = /\b(who is|summary|summari[sz]e|overview|why (should|would) (we|i|you) hire|strengths?|stand out|elevator|in short|tl;?dr|quick)\b/i;
const GREETING = /^\s*(hi|hello|hey|yo|sup|good (morning|afternoon|evening))\b[\s!.?]*$/i;
const THANKS = /^\s*(thanks|thank you|thx|ty|cool|great|awesome|perfect)\b/i;

function localAnswer(q) {
  if (GREETING.test(q)) {
    return { text: "Hi! I can answer questions about Benian's experience, projects, skills, education, and leadership, all from his resume. What would you like to know?" };
  }
  if (THANKS.test(q) && q.length < 30) {
    return { text: `Happy to help! If you'd like to talk with Benian directly, his email is ${EMAIL}.` };
  }
  if (ASK_DIRECTLY.test(q)) {
    return { text: `That's not something his resume covers, so it's best to ask Benian directly at ${EMAIL}. He's open to internships, security projects, and full-time roles after graduating in May 2028.`, section: "contact" };
  }
  if (/\blanguages?\b/i.test(q) && !/\b(programming|coding|code|scripting)\b/i.test(q)) {
    return { text: "Programming: Python, SQL, Java, JavaScript, HTML, and CSS.\n\nSpoken: English and Turkish, both fluently.", section: "skills" };
  }
  if (SUMMARY.test(q)) {
    return {
      text: "Quick version: Benian is a Cybersecurity & Global Policy student at Indiana University (May 2028, 3.63 GPA). " +
        "He was a **Cybersecurity Intern at the Indianapolis Airport Authority** (vulnerability management, SIEM monitoring, threat investigation), " +
        "runs **Nessus scans and GoPhish phishing tests at ByteShield Solutions** (35+ high-risk findings per project, 45% fewer risky clicks), " +
        "built **MalwareScope**, an ML malware detector, is a **Campus Lead for OpenAI's Student Collective** (1 of 120 worldwide), " +
        "and leads the **400+ member Ingineering Club** as president.",
      section: "experience",
    };
  }

  // words the visitor typed count fully; expanded synonyms count half
  const qTerms = new Map();
  const unknown = []; // words we have no knowledge of at all, e.g. "kubernetes"
  for (const w of tokens(q)) {
    if (STOP.has(w)) continue;
    if (!idf.has(stem(w)) && !SYNONYMS[w] && !SYNONYMS[stem(w)] && !Object.values(SECTION_HINTS).some((r) => r.test(w)) && w.length > 2) unknown.push(w);
    qTerms.set(stem(w), 1);
    for (const s of SYNONYMS[w] ?? SYNONYMS[stem(w)] ?? []) if (!qTerms.has(stem(s))) qTerms.set(stem(s), 0.5);
  }
  if (!qTerms.size) return null;
  const hinted = new Set(Object.keys(SECTION_HINTS).filter((k) => SECTION_HINTS[k].test(q)));

  const scored = entries.map((e) => {
    let score = 0;
    for (const [t, wt] of qTerms) {
      if (e.terms.has(t)) score += (idf.get(t) ?? 1) * wt;
      else if (t.length >= 5) for (const et of e.terms) if (et.startsWith(t) || t.startsWith(et) && et.length >= 5) { score += (idf.get(et) ?? 1) * 0.6 * wt; break; }
    }
    const raw = score;
    if (hinted.has(e.section)) score += 1.5;
    return { e, score, raw };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score);

  const missing = unknown.length ? `I don't see ${unknown.map((u) => `"${u}"`).join(" or ")} in his resume.` : "";
  if (!scored.length || scored[0].score < 1.1 || (missing && scored[0].raw === 0)) {
    return missing ? { text: `${missing} For anything not listed, it's best to ask Benian directly at ${EMAIL}.`, section: "contact" } : null;
  }
  const best = scored[0];
  const picks = scored.filter((s) => s.score >= best.score * 0.6 && s.e.section === best.e.section).slice(0, 3);
  const body = picks.map((p) => p.e.text).join("\n\n");
  return { text: missing ? `${missing} The closest match:\n\n${body}` : body, section: best.e.section };
}

function fallbackAnswer() {
  return {
    text: `I couldn't find that in Benian's resume. Try asking about his experience, projects, skills, or education, or reach him directly at ${EMAIL}.`,
    section: "contact",
  };
}

/* ---------- formatting ---------- */

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function format(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(https?:\/\/[^\s<]+[^\s<.,)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/([\w.+-]+@[\w-]+\.[\w.]+[a-z])/gi, '<a href="mailto:$1">$1</a>')
    .split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}

/* =====================================================
   UI
   ===================================================== */

export function initCoach({ openPopup }) {
  const endpoint = document.querySelector('meta[name="coach-endpoint"]')?.content?.trim() || "";
  const ready = fetch("coach/knowledge.md").then((r) => r.text()).then(buildIndex).catch(() => {});
  const history = [];

  const root = document.createElement("div");
  root.id = "coach";
  root.innerHTML = `
    <button class="coach-fab" aria-expanded="false" aria-controls="coach-panel">
      ${icon("message")}<span class="coach-fab-long">Ask about Benian</span><span class="coach-fab-short">Ask</span>
    </button>
    <section class="coach-panel" id="coach-panel" role="dialog" aria-label="Ask about Benian" hidden>
      <header class="coach-head">
        <img class="coach-avatar" src="assets/headshot.jpg" alt="" width="40" height="40" />
        <div class="coach-title">
          <strong>Ask about Benian</strong>
          <p>${endpoint ? "AI assistant. Answers come from his resume." : "Answers come straight from his resume."}</p>
        </div>
        <button class="coach-close" aria-label="Close">${icon("close")}</button>
      </header>
      <div class="coach-log" aria-live="polite"></div>
      <div class="coach-chips"></div>
      <form class="coach-form">
        <input class="coach-input" type="text" maxlength="400" placeholder="e.g. Has he used a SIEM?" aria-label="Your question" autocomplete="off" />
        <button class="coach-send" type="submit" aria-label="Send">${icon("up")}</button>
      </form>
    </section>`;
  document.body.appendChild(root);

  const fab = root.querySelector(".coach-fab");
  const panel = root.querySelector(".coach-panel");
  const log = root.querySelector(".coach-log");
  const chips = root.querySelector(".coach-chips");
  const form = root.querySelector(".coach-form");
  const input = root.querySelector(".coach-input");

  function setOpen(open) {
    panel.hidden = !open;
    fab.setAttribute("aria-expanded", String(open));
    root.classList.toggle("open", open);
    if (open) {
      if (!log.childElementCount) {
        addMsg("bot", { text: "Hi. Ask me anything about Benian's experience, tools, projects, education, or how to reach him." });
      }
      setTimeout(() => input.focus(), 50);
    }
  }
  fab.addEventListener("click", () => setOpen(panel.hidden));
  root.querySelector(".coach-close").addEventListener("click", () => { setOpen(false); fab.focus(); });
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); setOpen(false); fab.focus(); }
  });

  for (const s of SUGGESTIONS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "coach-chip";
    b.textContent = s;
    b.addEventListener("click", () => ask(s));
    chips.appendChild(b);
  }

  function addMsg(who, { text, section } = {}) {
    const m = document.createElement("div");
    m.className = `coach-msg ${who}`;
    const body = document.createElement("div");
    body.className = "coach-bubble";
    if (text != null) body.innerHTML = who === "user" ? `<p>${escapeHtml(text)}</p>` : format(text);
    m.appendChild(body);
    if (section) addLink(m, section);
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
    return { m, body };
  }

  function addLink(m, section) {
    if (!SECTION_NAMES[section]) return;
    const a = document.createElement("button");
    a.type = "button";
    a.className = "coach-link";
    a.innerHTML = `Open ${SECTION_NAMES[section]}${icon("arrow")}`;
    a.addEventListener("click", () => openPopup(section));
    m.appendChild(a);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) ask(q);
  });

  let busy = false;
  async function ask(q) {
    if (busy) return;
    busy = true;
    input.value = "";
    chips.hidden = true;
    addMsg("user", { text: q });
    await ready;

    if (endpoint) {
      const { m, body } = addMsg("bot", {});
      body.innerHTML = '<p class="coach-typing"><span></span><span></span><span></span></p>';
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: q, history: history.slice(-6) }),
        });
        if (!res.ok || !res.body) throw new Error(`coach ${res.status}`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let text = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += dec.decode(value, { stream: true });
          body.innerHTML = format(text);
          log.scrollTop = log.scrollHeight;
        }
        if (!text.trim()) throw new Error("empty");
        history.push({ role: "user", content: q }, { role: "assistant", content: text });
        const local = localAnswer(q);
        if (local?.section) addLink(m, local.section);
        busy = false;
        return;
      } catch (err) {
        m.remove(); // fall through to the instant engine
      }
    }

    const a = localAnswer(q) ?? fallbackAnswer();
    addMsg("bot", a);
    busy = false;
  }

  return { open: () => setOpen(true) };
}
