// =====================================================================
// Bärchen-Pflege – script.js
// Enthält: Zustand & Speicherung, Bär-Rendering, Pflege-Aktionen,
// Sprechblasen, sowie drei Minispiele (Sternenfang, Seifenblasen, Hüpf-Lauf)
// =====================================================================

// Build-Kennung zur Cache-Diagnose: taucht oben rechts in der App auf.
// Wenn du nach einem Update immer noch eine ALTE Nummer siehst, wurde die
// neue Version noch nicht geladen (Cache-Problem) statt eines echten Bugs.
const BUILD_ID = "build-15";

/* ---------------------------------------------------------------------
   0) GLOBALER FEHLER-FÄNGER (Diagnose)
   Zeigt JavaScript-Fehler direkt als Toast an, damit man Probleme auch
   ohne Entwicklertools (z. B. auf dem Handy) sehen und melden kann.
--------------------------------------------------------------------- */
window.addEventListener("error", (e) => {
  console.error("Globaler Fehler:", e.error || e.message);
  showFatalToast("JS-Fehler: " + (e.message || "unbekannt") + " (Zeile " + e.lineno + ")");
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("Unbehandelte Promise-Ablehnung:", e.reason);
  showFatalToast("Promise-Fehler: " + (e.reason && e.reason.message ? e.reason.message : e.reason));
});
function showFatalToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return alert(msg); // Falls Toast-Element selbst fehlt
  t.textContent = "⚠️ " + msg;
  t.classList.add("show");
  t.style.background = "#B5504A";
  // Fehler-Toast bleibt länger stehen als normale Hinweise
  clearTimeout(window.__fatalToastTimeout);
  window.__fatalToastTimeout = setTimeout(() => {
    t.classList.remove("show");
    t.style.background = "";
  }, 8000);
}

/* ---------------------------------------------------------------------
   1) ZUSTAND & KONSTANTEN
--------------------------------------------------------------------- */
const STORAGE_KEY = "baerchenState_v1";

// Wie schnell die Werte pro Sekunde sinken (Vollausschlag -> 0 in X Minuten)
// Deutlich beschleunigt gegenüber vorher, damit sich Pflege spürbar lohnt.
const DECAY = {
  hunger: 100 / (20 * 60), // 20 Minuten - langsamer, damit er nicht mehr so schnell ohnmächtig wird
  clean:  100 / (20 * 60), // 20 Minuten - langsamer, damit er nach dem Waschen nicht gefühlt sofort wieder dreckig wird
  fun:    100 / (20 * 60), // 20 Minuten - gleiches Tempo wie Hunger/Sauberkeit
};

const MAX_CATCHUP_SECONDS = 3 * 60 * 60; // max. 3h "Abwesenheits-Verfall" nachholen
const REVIVE_COST = 10; // so viele 🍓 werden zum Wiederbeleben gebraucht

// ===== LEVEL- & ALTERSSYSTEM (konfigurierbar) =====
// Pflege-Punkte pro Aktion (frei anpassbar):
const CARE_POINTS = {
  feed: 1,
  drink: 0.5,
  wash: 0.5,
  comfort: 0.5, // Kuss geben / An ihm riechen
  play: 2, // Minispiel abgeschlossen
  tv: 0.8, // Fernsehen erlaubt
};
// Level-Schwellen: bei Erreichen der jeweiligen Gesamtpunktzahl steigt das Level.
const LEVEL_THRESHOLDS = [10, 30, 60, 100, 150, 220, 300, 400, 520, 650];
// Alter = GesamtpflegePunkte * ALTER_FAKTOR (vierstellig formatiert)
const AGE_FACTOR = 0.0001;

let state = {
  hunger: 80,
  clean: 80,
  fun: 80,
  love: 80,
  strawberries: 0,
  coins: 0,
  toys: { piglet: 0, cowboy: 0, plush: 0, ball: 0, kite: 0, yoyo: 0, blocks: 0 }, // gekauftes Spielzeug-Inventar
  clothes: { bow: 0, scarf: 0, glasses: 0, hat: 0, cap: 0, flower: 0 }, // gekaufte Kleidung/Accessoires
  equipped: { neck: null, eyes: null, head: null, ear: null }, // aktuell getragene Kleidung je Slot
  carePoints: 0, // Basis für Level & Alter
  isDead: false,
  isTorn: false, // Naht aufgerissen -> muss genäht werden
  isSick: false, // krank -> braucht Medizin
  stats: {
    feeds: 0,
    washes: 0,
    worksDone: 0,
    gamesPlayed: 0,
    toysBought: 0,
    clothesBought: 0,
    strawberriesLifetime: 0,
  },
  dailyStreak: { count: 0, best: 0, lastClaim: null },
  achievementsClaimed: {},
  cards: {}, // gesammelte Sammelkarten: id -> Anzahl
  wheel: { lastSpin: null }, // Datum des letzten Glücksrad-Drehs
  lastSave: Date.now(),
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      state = { ...state, ...saved };
      if (!state.toys) state.toys = { piglet: 0, cowboy: 0, plush: 0 };
      for (const key of ["piglet", "cowboy", "plush", "ball", "kite", "yoyo", "blocks"]) {
        if (typeof state.toys[key] !== "number") state.toys[key] = 0;
      }
      if (!state.clothes) state.clothes = {};
      for (const key of ["bow", "scarf", "glasses", "hat", "cap", "flower"]) {
        if (typeof state.clothes[key] !== "number") state.clothes[key] = 0;
      }
      if (!state.equipped) state.equipped = { neck: null, eyes: null, head: null, ear: null };
      for (const slot of ["neck", "eyes", "head", "ear"]) {
        if (state.equipped[slot] === undefined) state.equipped[slot] = null;
      }
      if (!state.stats) state.stats = {};
      for (const key of ["feeds", "washes", "worksDone", "gamesPlayed", "toysBought", "clothesBought", "strawberriesLifetime"]) {
        if (typeof state.stats[key] !== "number") state.stats[key] = 0;
      }
      if (!state.dailyStreak) state.dailyStreak = { count: 0, best: 0, lastClaim: null };
      if (typeof state.dailyStreak.count !== "number") state.dailyStreak.count = 0;
      if (typeof state.dailyStreak.best !== "number") state.dailyStreak.best = 0;
      if (!state.achievementsClaimed) state.achievementsClaimed = {};
      if (!state.cards) state.cards = {};
      if (!state.wheel) state.wheel = { lastSpin: null };
      // Verfall seit letztem Besuch nachholen (nur wenn Summi noch lebt)
      if (!state.isDead) {
        const elapsedSec = Math.min(
          (Date.now() - (state.lastSave || Date.now())) / 1000,
          MAX_CATCHUP_SECONDS
        );
        if (elapsedSec > 1) applyDecay(elapsedSec);
      }
    }
  } catch (e) {
    console.warn("Konnte Speicherstand nicht laden:", e);
  }
}

function saveState() {
  state.lastSave = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Konnte nicht speichern:", e);
  }
}

function clamp(v) {
  return Math.max(0, Math.min(100, v));
}

// Kurzes haptisches Feedback auf Geräten, die es unterstützen (no-op sonst).
function vibrate(ms) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {
    /* egal, rein kosmetisch */
  }
}

// Erdbeeren hinzufügen UND für Erfolge mitzählen (Lebenszeit-Gesamtsumme).
function addStrawberries(n) {
  if (!n) return;
  state.strawberries += n;
  state.stats.strawberriesLifetime += n;
}

/* ---------------------------------------------------------------------
   2) DOM-REFERENZEN
--------------------------------------------------------------------- */
const el = {
  bearWrap: document.getElementById("bearWrap"),
  bearSvg: document.getElementById("bearSvg"),
  eyeLeft: document.getElementById("eyeLeft"),
  eyeRight: document.getElementById("eyeRight"),
  mouth: document.getElementById("mouth"),
  tear: document.getElementById("tear"),
  tear2: document.getElementById("tear2"),
  dirtSpots: document.getElementById("dirtSpots"),
  flies: document.getElementById("flies"),
  stinkClouds: document.getElementById("stinkClouds"),
  particles: document.getElementById("particles"),
  washFx: document.getElementById("washFx"),
  speechBubble: document.getElementById("speechBubble"),
  speechText: document.getElementById("speechText"),
  toast: document.getElementById("toast"),
  strawberryCount: document.getElementById("strawberryCount"),
  coinCount: document.getElementById("coinCount"),
  deathOverlay: document.getElementById("deathOverlay"),
  deathStrawberryText: document.getElementById("deathStrawberryText"),
  reviveBtn: document.getElementById("reviveBtn"),
  actionButtons: document.querySelectorAll(".action-btn"),
  sleepBtnLabel: document.getElementById("sleepBtnLabel"),
  comfortButtons: document.getElementById("comfortButtons"),
  workBanner: document.getElementById("workBanner"),
  workFill: document.getElementById("workFill"),
  heldToy: document.getElementById("heldToy"),
  toyPlayBanner: document.getElementById("toyPlayBanner"),
  toyPlayLabel: document.getElementById("toyPlayLabel"),
  toyPlayFill: document.getElementById("toyPlayFill"),
  fills: {
    hunger: document.getElementById("fill-hunger"),
    clean: document.getElementById("fill-clean"),
    fun: document.getElementById("fill-fun"),
    love: document.getElementById("fill-love"),
  },
};

/* ---------------------------------------------------------------------
   3) RENDERING: Balken, Stimmung, Schmutz, Fliegen
--------------------------------------------------------------------- */
function renderBars() {
  for (const key of ["hunger", "clean", "fun", "love"]) {
    const fill = el.fills[key];
    fill.style.width = clamp(state[key]) + "%";
    fill.classList.toggle("low", state[key] < 25);
  }
}

const EYES = {
  happy:
    '<path d="M -12 0 Q 0 -10 12 0" stroke="#5A3F34" stroke-width="4" fill="none" stroke-linecap="round"/>',
  neutral: '<circle cx="0" cy="0" r="6" fill="#4A3730"/>',
  sad: '<circle cx="0" cy="1" r="5.5" fill="#4A3730"/><path d="M -9 -8 Q 0 -13 9 -8" stroke="#4A3730" stroke-width="3" fill="none" stroke-linecap="round"/>',
  verySad:
    '<path d="M -9 -3 Q 0 4 9 -3" stroke="#4A3730" stroke-width="4" fill="none" stroke-linecap="round"/>',
  crying:
    '<circle cx="0" cy="1" r="5.5" fill="#4A3730"/><path d="M -9 -9 Q 0 -14 9 -9" stroke="#4A3730" stroke-width="3.2" fill="none" stroke-linecap="round"/>',
  sleeping:
    '<path d="M -11 0 Q 0 4 11 0" stroke="#5A3F34" stroke-width="4" fill="none" stroke-linecap="round"/>',
  dead:
    '<path d="M -10 -8 L 10 8 M 10 -8 L -10 8" stroke="#4A3730" stroke-width="4" fill="none" stroke-linecap="round"/>',
  torn:
    '<circle cx="0" cy="1" r="5.5" fill="#4A3730"/><path d="M -9 -9 Q 0 -14 9 -9" stroke="#4A3730" stroke-width="3.2" fill="none" stroke-linecap="round"/>',
  sick:
    '<path d="M -9 -1 Q 0 3 9 -1" stroke="#4A3730" stroke-width="3.5" fill="none" stroke-linecap="round"/>',
};

const MOUTHS = {
  happy: "M 128 152 Q 150 175 172 152",
  neutral: "M 134 160 L 166 160",
  sad: "M 130 168 Q 150 150 170 168",
  verySad: "M 128 165 Q 150 145 172 165",
  crying: "M 132 170 Q 150 148 168 170",
  sleeping: "", // Schlafmund wird separat als offenes Oval + Sabbertropfen angezeigt
  dead: "M 136 162 Q 150 156 164 162 Q 150 168 136 162",
  torn: "M 132 170 Q 150 148 168 170",
  sick: "M 134 166 Q 150 158 166 166",
};

// WEINEN: wenn Hunger ODER Spaß unter die kritische Schwelle fallen.
const CRY_THRESHOLD = 20;

function computeMood() {
  if (state.isDead) return "dead";
  if (state.isTorn) return "torn";
  if (state.isSick) return "sick";
  if (isSleeping) return "sleeping";
  if (forcedCrying) return "crying"; // hat "Nein" beim Fernsehen gehört
  if (isWatchingTV) return "happy";
  if (state.hunger < CRY_THRESHOLD || state.fun < CRY_THRESHOLD) return "crying";
  const careAvg = (state.hunger + state.clean + state.fun) / 3;
  if (state.love <= 15 || careAvg <= 15) return "verySad";
  if (careAvg < 35) return "sad";
  if (careAvg >= 70 && state.love >= 60) return "happy";
  return "neutral";
}

let lastMood = null;
function renderMood() {
  const mood = computeMood();
  el.bearWrap.classList.toggle("fainted", mood === "dead");
  el.bearWrap.classList.toggle("crying", mood === "crying" || mood === "torn");
  el.bearWrap.classList.toggle("torn", mood === "torn");
  el.bearWrap.classList.toggle("sick", mood === "sick");
  el.bearWrap.classList.toggle("mood-happy", mood === "happy");
  el.comfortButtons.classList.toggle("show", mood === "crying");
  document.getElementById("sewButtonWrap").classList.toggle("show", mood === "torn");
  if (mood === lastMood) return; // nur bei Änderung neu zeichnen
  lastMood = mood;

  el.eyeLeft.setAttribute("transform", "translate(120,110)");
  el.eyeRight.setAttribute("transform", "translate(180,110)");
  el.eyeLeft.innerHTML = EYES[mood];
  el.eyeRight.innerHTML = EYES[mood];
  el.mouth.setAttribute("d", MOUTHS[mood]);
  const showTear = mood === "verySad" || mood === "crying" || mood === "torn";
  el.tear.style.opacity = showTear ? "1" : "0";
  el.tear.setAttribute("d", "M 118 118 q -4 10 0 16 q 4 -6 0 -16 Z");
  el.tear2.style.opacity = mood === "crying" || mood === "torn" ? "1" : "0";
}

// Feste "zufällige" Positionen für Schmutzflecken (bleiben stabil beim Rendern)
const DIRT_SPOTS = [
  { cx: 110, cy: 175, r: 7 },
  { cx: 185, cy: 195, r: 6 },
  { cx: 150, cy: 205, r: 8 },
  { cx: 95, cy: 230, r: 6 },
  { cx: 205, cy: 240, r: 7 },
  { cx: 160, cy: 100, r: 5 },
];

function renderDirt() {
  const dirtiness = clamp(100 - state.clean); // 0 = sauber, 100 = sehr dreckig
  el.bearWrap.classList.toggle("dirty", dirtiness > 40);

  const visibleCount = Math.round((dirtiness / 100) * DIRT_SPOTS.length);
  el.dirtSpots.innerHTML = DIRT_SPOTS.slice(0, visibleCount)
    .map(
      (s) =>
        `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="#8A6B4C" opacity="0.55"/>`
    )
    .join("");

  // Fliegen: je dreckiger, desto mehr
  let flyCount = 0;
  if (state.clean < 60) flyCount = 1;
  if (state.clean < 35) flyCount = 3;
  if (state.clean < 15) flyCount = 5;

  if (el.flies.childElementCount !== flyCount) {
    el.flies.innerHTML = "";
    for (let i = 0; i < flyCount; i++) {
      const fly = document.createElement("div");
      fly.className = "fly";
      fly.textContent = "🪰";
      fly.style.left = 20 + Math.random() * 60 + "%";
      fly.style.top = 5 + Math.random() * 55 + "%";
      fly.style.animationDelay = Math.random() * 2 + "s";
      el.flies.appendChild(fly);
    }
  }

  // Gestank-Wolken: erscheinen ab mittlerer Verschmutzung über dem Kopf
  let stinkCount = 0;
  if (state.clean < 50) stinkCount = 1;
  if (state.clean < 25) stinkCount = 2;

  if (el.stinkClouds.childElementCount !== stinkCount) {
    el.stinkClouds.innerHTML = "";
    for (let i = 0; i < stinkCount; i++) {
      const cloud = document.createElement("div");
      cloud.className = "stink-cloud";
      cloud.textContent = "💨";
      cloud.style.left = 35 + Math.random() * 30 + "%";
      cloud.style.top = -2 + Math.random() * 10 + "%";
      cloud.style.animationDelay = Math.random() * 2 + "s";
      el.stinkClouds.appendChild(cloud);
    }
  }
}

function renderStrawberries() {
  el.strawberryCount.textContent = state.strawberries;
  el.coinCount.textContent = state.coins;
  el.deathStrawberryText.textContent = state.strawberries + " / " + REVIVE_COST + " 🍓";
  el.reviveBtn.disabled = state.strawberries < REVIVE_COST;
}

function renderActionLock() {
  // Während Summi schläft oder arbeitet, sind die meisten Aktionen gesperrt.
  // Der Schlaf-Knopf selbst bleibt aktiv (außer bei Ohnmacht/Arbeit), damit
  // man ihn jederzeit aufwecken kann.
  const lockMost = state.isDead || isSleeping || isWorking || !!toyPlayState;
  el.actionButtons.forEach((btn) => {
    if (btn.id === "btnSleep") {
      btn.classList.toggle("disabled", state.isDead || isWorking);
    } else {
      btn.classList.toggle("disabled", lockMost);
    }
  });
  if (el.sleepBtnLabel) {
    el.sleepBtnLabel.textContent = isSleeping ? "Aufwecken" : "Ins Bett";
  }
}

function showDeathOverlay() {
  el.deathOverlay.classList.remove("hidden");
  renderActionLock();
}

// ===== LEVEL & ALTER =====
function computeLevel(points) {
  let lvl = 1;
  for (const threshold of LEVEL_THRESHOLDS) {
    if (points >= threshold) lvl++;
    else break;
  }
  return lvl;
}

function computeAge(points) {
  return (points * AGE_FACTOR).toFixed(4);
}

function renderLevelAge() {
  const el2 = document.getElementById("levelAgeText");
  if (!el2) return;
  const lvl = computeLevel(state.carePoints || 0);
  const age = computeAge(state.carePoints || 0);
  el2.textContent = "Lvl " + lvl + " • Alter " + age;
}

// Wird bei jeder Pflege-Aktion aufgerufen, um Level & Alter zu erhöhen.
function addCarePoints(points) {
  const prevLevel = computeLevel(state.carePoints || 0);
  state.carePoints = (state.carePoints || 0) + points;
  const newLevel = computeLevel(state.carePoints);
  renderLevelAge();
  if (newLevel > prevLevel) {
    showToast("🎉 Level Up! Summi ist jetzt Level " + newLevel + "!");
  }
}

function hideDeathOverlay() {
  el.deathOverlay.classList.add("hidden");
  renderActionLock();
}

function renderAll() {
  renderBars();
  renderMood();
  renderDirt();
  renderStrawberries();
  renderActionLock();
  renderLevelAge();
}

/* ---------------------------------------------------------------------
   4) SPRECHBLASEN
--------------------------------------------------------------------- */
const PHRASES = [
  "Spielen wir? 🎮",
  "Mama, wann gehen wir ins Kino? 🎬",
  "Darf ich was anschauen? 📺",
  "Ich hab Hunger! 🍓",
  "Kuscheln wir? 🤗",
  "Lass uns nach draußen gehen! 🌳",
  "Ich langweile mich ein bisschen...",
  "Du bist der/die Beste! 💗",
  "Wasch mich, ich glitzer dann! 🧼",
  "Erzähl mir eine Geschichte! 📖",
  "Wann kommt Papa? Wir wollten doch zusammen ein Erdbeermarmeladebrot essen! 🍓🍞",
  "Darf ich mit Scruffy spielen, meinem besten Freund? 🧸",
  "Wo ist mein Cowboy-Freund? Ich vermisse ihn! 🤠",
];

// "Shuffle-Bag": jeder Satz kommt genau einmal dran, bevor sich das Bag neu
// mischt. So wiederholt sich nie derselbe Satz mehrfach hintereinander,
// und alle Sätze (auch die zuerst gewünschten) kommen garantiert vor.
let phraseBag = [];
function nextPhrase() {
  if (phraseBag.length === 0) {
    phraseBag = [...PHRASES];
    // Fisher-Yates-Shuffle
    for (let i = phraseBag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [phraseBag[i], phraseBag[j]] = [phraseBag[j], phraseBag[i]];
    }
  }
  return phraseBag.pop();
}

let speechTimeout = null;
function scheduleSpeech(initial = false) {
  clearTimeout(speechTimeout);
  // Beim allerersten Mal etwas früher, damit man es nicht ewig verpasst
  const delay = initial
    ? 6000 + Math.random() * 6000 // 6-12s
    : 15000 + Math.random() * 20000; // 15-35s
  speechTimeout = setTimeout(showRandomSpeech, delay);
}

function showRandomSpeech() {
  if (!document.getElementById("gameOverlay").classList.contains("hidden")) {
    scheduleSpeech(); // während eines Minispiels nicht stören
    return;
  }
  // Schläft er oder ist ohnmächtig, sagt er gerade nichts.
  if (isSleeping || state.isDead) {
    scheduleSpeech();
    return;
  }

  let phrase;
  if (!isWorking && Math.random() < 0.12) {
    // Seltene, zufällige Frage, ob er arbeiten gehen darf
    phrase = "Darf ich heute etwas arbeiten gehen? Ich verdien auch gern mal Coins! 💼";
  } else if (state.hunger > 70 && state.fun > 70 && Math.random() < 0.35) {
    // Nach viel Spielen und vollem Bauch fragt er von sich aus nach Schlaf
    phrase = "Ich hab so viel gespielt und bin richtig satt... darf ich schlafen gehen? 😴";
  } else {
    phrase = nextPhrase();
  }

  el.speechText.textContent = phrase;
  el.speechBubble.classList.add("show");
  setTimeout(() => el.speechBubble.classList.remove("show"), 3500);
  scheduleSpeech();
}

/* ---------------------------------------------------------------------
   5) TOAST-HINWEIS
--------------------------------------------------------------------- */
let toastTimeout = null;
function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.toast.classList.remove("show"), 1800);
}

/* ---------------------------------------------------------------------
   6) PARTIKEL (Herzen beim Streicheln)
--------------------------------------------------------------------- */
function spawnParticles(emoji, count = 5) {
  for (let i = 0; i < count; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    p.textContent = emoji;
    p.style.left = 35 + Math.random() * 30 + "%";
    p.style.top = 30 + Math.random() * 20 + "%";
    p.style.animationDelay = i * 0.08 + "s";
    el.particles.appendChild(p);
    setTimeout(() => p.remove(), 1300);
  }
}

/* ---------------------------------------------------------------------
   7) PFLEGE-AKTIONEN
--------------------------------------------------------------------- */
// Gemeinsame Sperre: viele Aktionen dürfen nicht ausgeführt werden, während
// Summi tot, am Schlafen oder am Arbeiten ist.
function actionsBlocked() {
  if (state.isDead) {
    showToast("😵 Summi ist ohnmächtig – erst wiederbeleben!");
    return true;
  }
  if (isSleeping) {
    showToast("😴 Summi schläft gerade – erst aufwecken!");
    return true;
  }
  if (isWorking) {
    showToast("💼 Summi arbeitet gerade und darf nicht gestört werden!");
    return true;
  }
  if (toyPlayState) {
    showToast("🧸 Summi spielt gerade – lass ihn kurz fertig spielen!");
    return true;
  }
  return false;
}

function feed() {
  if (actionsBlocked()) return;
  if (state.strawberries < 1) {
    showToast("🍓 Keine Erdbeeren mehr! Sammle welche in der Erdbeer-Jagd.");
    return;
  }
  state.strawberries -= 1;
  state.hunger = clamp(state.hunger + 30);
  state.love = clamp(state.love + 3);
  addCarePoints(CARE_POINTS.feed);
  state.stats.feeds++;
  showToast("🍓🍞 Lecker, Toast mit Erdbeermarmelade!");
  spawnParticles("🍓", 4);
  wiggleBear();
  vibrate(15);
  registerInteraction();
  renderAll();
  saveState();
  checkAchievements();
}

function drink() {
  if (actionsBlocked()) return;
  state.hunger = clamp(state.hunger + 15);
  state.love = clamp(state.love + 5);
  addCarePoints(CARE_POINTS.drink);
  showToast("☕ Mmh, heiße Schokolade!");
  spawnParticles("☕", 3);
  wiggleBear();
  registerInteraction();
  renderAll();
  saveState();
}

const FRESH_SHINE_MS = 15000; // wie lange der "frisch geduscht"-Glanz sichtbar bleibt
let freshShineTimeout = null;

function wash() {
  if (actionsBlocked()) return;
  el.bearWrap.classList.add("washing");
  el.washFx.innerHTML = "";
  for (let i = 0; i < 10; i++) {
    const b = document.createElement("div");
    b.className = "bubble-fx";
    b.style.left = 10 + Math.random() * 80 + "%";
    b.style.animationDelay = Math.random() * 0.6 + "s";
    el.washFx.appendChild(b);
  }
  showToast("🧴 Schrubb schrubb – sauber und frisch!");
  state.clean = 100;
  state.love = clamp(state.love + 5);
  addCarePoints(CARE_POINTS.wash);
  state.stats.washes++;
  registerInteraction();
  renderAll();
  saveState();
  checkAchievements();

  // Länger anhaltender Glanz-Effekt, nicht nur die kurze Seifenblasen-Animation.
  clearTimeout(freshShineTimeout);
  el.bearWrap.classList.add("freshly-washed");
  freshShineTimeout = setTimeout(() => {
    el.bearWrap.classList.remove("freshly-washed");
  }, FRESH_SHINE_MS);

  setTimeout(() => {
    el.bearWrap.classList.remove("washing");
    el.washFx.innerHTML = "";
  }, 1400);
}

function petBear() {
  if (state.isDead) return showToast("😵 Summi ist ohnmächtig – sammle 🍓 zum Wiederbeleben!");
  if (isWorking) return showToast("💼 Summi arbeitet gerade und darf nicht gestört werden!");
  if (isSleeping) {
    // Antippen weckt einen schlafenden Bären, statt ihn zu streicheln
    registerInteraction();
    renderAll();
    saveState();
    return;
  }
  state.love = clamp(state.love + 2);
  state.fun = clamp(state.fun + 1);
  spawnParticles("💗", 3);
  wiggleBear();
  registerInteraction();
  renderAll();
  saveState();
}

function wiggleBear() {
  el.bearWrap.classList.remove("tapped");
  void el.bearWrap.offsetWidth; // Reflow erzwingen, damit Animation neu startet
  el.bearWrap.classList.add("tapped");
}

/* ---------------------------------------------------------------------
   7b) SCHLAFEN & SABBERN
   Nach dem Spielen wird Summi müde und schläft bald ein. Wird er länger
   gar nicht beachtet, döst er auch so weg. Jede Pflege-Aktion weckt ihn.
--------------------------------------------------------------------- */
let isSleeping = false;
let sleepTimer = null;

const IDLE_SLEEP_MS = 90 * 1000; // nach 90s allgemeiner Untätigkeit
const TIRED_SLEEP_MS = 12 * 1000; // nach einem Minispiel geht's schneller

function scheduleSleep(delay) {
  clearTimeout(sleepTimer);
  sleepTimer = setTimeout(fallAsleep, delay);
}

function fallAsleep() {
  if (isSleeping) return;
  if (!overlay.classList.contains("hidden") || isWorking || isWatchingTV || toyPlayState) {
    // Während eines Minispiels, der Arbeit, einer laufenden Sendung oder
    // während Summi gerade mit einem Spielzeug spielt, nicht einschlafen,
    // aber später erneut prüfen.
    scheduleSleep(5000);
    return;
  }
  // Ein offen stehender "Darf ich fernsehen?"-Dialog darf nicht einfach
  // weiter herumstehen, während Summi eigentlich schon schläft - er kann
  // ja im Schlaf nicht mehr antworten.
  if (tvPromptOpen) {
    tvPromptOpen = false;
    document.getElementById("tvPrompt").classList.add("hidden");
    scheduleTV();
  }
  isSleeping = true;
  el.bearWrap.classList.add("sleeping");
  showToast("😴 Summi ist eingeschlafen...");
  renderAll();
}

function wakeUp(silent) {
  const wasSleeping = isSleeping;
  isSleeping = false;
  el.bearWrap.classList.remove("sleeping");
  if (wasSleeping && !silent) showToast("🥱 Summi ist aufgewacht!");
  renderAll();
}

// Nach jeder Interaktion Timer neu starten. tired=true (z.B. nach Minispiel)
// lässt Summi schneller wieder einschlafen, weil er müde vom Spielen ist.
function registerInteraction(tired = false) {
  wakeUp(true);
  scheduleSleep(tired ? TIRED_SLEEP_MS : IDLE_SLEEP_MS);
}

// MANUELLER SCHLAF-BUTTON: "Ins Bett bringen" <-> "Aufwecken"
function toggleManualSleep() {
  if (state.isDead) return showToast("😵 Summi ist ohnmächtig – erst wiederbeleben!");
  if (isWorking) return showToast("💼 Erst wenn er mit der Arbeit fertig ist!");
  if (state.isTorn) return showToast("🪡 Erst die Naht flicken, dann kann Summi schlafen!");
  if (isWatchingTV) return showToast("📺 Erst wenn die Sendung zu Ende ist!");
  if (isSleeping) {
    wakeUp();
    scheduleSleep(IDLE_SLEEP_MS);
  } else {
    clearTimeout(sleepTimer);
    fallAsleep();
  }
  saveState();
}

/* ---------------------------------------------------------------------
   7c) TRÖSTEN (bei "Weinen")
--------------------------------------------------------------------- */
function giveKiss() {
  if (actionsBlocked()) return;
  state.love = clamp(state.love + 10);
  state.hunger = clamp(state.hunger + 8);
  addCarePoints(CARE_POINTS.comfort);
  spawnParticles("💋", 3);
  wiggleBear();
  registerInteraction();
  if (forcedCrying) {
    // Extra Dankes-Animation, wenn er wegen des Fernseh-"Nein" geweint hat
    forcedCrying = false;
    showToast("😘 Danke für den Kuss! Summi hüpft glücklich herum.");
    spawnParticles("✨", 3);
  } else {
    showToast("😘 Ein dicker Kuss – gleich geht's ihm besser!");
  }
  renderAll();
  saveState();
}

function sniffBear() {
  if (actionsBlocked()) return;
  state.love = clamp(state.love + 5);
  state.fun = clamp(state.fun + 12);
  addCarePoints(CARE_POINTS.comfort);
  spawnParticles("👃", 3);
  wiggleBear();
  registerInteraction();
  if (forcedCrying) {
    forcedCrying = false;
    showToast("👃 Das riecht so vertraut! Summi bedankt sich freudig.");
    spawnParticles("✨", 3);
  } else {
    showToast("👃 Riecht nach Kuscheltier – das beruhigt!");
  }
  renderAll();
  saveState();
}

/* ---------------------------------------------------------------------
   7ca) FERNSEHEN
   Summi fragt gelegentlich, ob er fernsehen darf. "Ja" -> kurze
   Fernseh-Animation. "Nein" -> er weint (erzwungen), bis man ihn tröstet.
--------------------------------------------------------------------- */
let isWatchingTV = false;
let forcedCrying = false;
let tvPromptOpen = false;
let tvTimeout = null;
const TV_MIN_WATCH_MS = 10000;
const TV_MAX_WATCH_MS = 20000;

function scheduleTV() {
  clearTimeout(tvTimeout);
  // Zufälliger Abstand, damit die Frage nicht zu oft auftaucht
  const delay = 45000 + Math.random() * 60000; // 45–105s
  tvTimeout = setTimeout(maybeAskTV, delay);
}

function maybeAskTV() {
  const blocked =
    state.isDead ||
    state.isTorn ||
    state.isSick ||
    isSleeping ||
    isWorking ||
    isWatchingTV ||
    tvPromptOpen ||
    forcedCrying ||
    !overlay.classList.contains("hidden");
  if (blocked) {
    scheduleTV(); // später erneut versuchen
    return;
  }
  tvPromptOpen = true;
  document.getElementById("tvPrompt").classList.remove("hidden");
}

function answerTV(yes) {
  tvPromptOpen = false;
  document.getElementById("tvPrompt").classList.add("hidden");

  if (yes) {
    isWatchingTV = true;
    el.bearWrap.classList.add("watching-tv");
    addCarePoints(CARE_POINTS.tv);
    showToast("📺 Summi schaut gespannt seine Lieblingsserie!");
    renderAll();
    const watchDuration = TV_MIN_WATCH_MS + Math.random() * (TV_MAX_WATCH_MS - TV_MIN_WATCH_MS);
    setTimeout(() => {
      isWatchingTV = false;
      el.bearWrap.classList.remove("watching-tv");
      showToast("📺 Die Serie ist zu Ende – Summi ist zufrieden!");
      renderAll();
      saveState();
    }, watchDuration);
  } else {
    forcedCrying = true;
    showToast("😢 Summi ist traurig, dass er nicht fernsehen darf...");
    renderAll();
  }
  saveState();
  scheduleTV();
}

document.getElementById("tvYesBtn").addEventListener("click", () => answerTV(true));
document.getElementById("tvNoBtn").addEventListener("click", () => answerTV(false));

/* ---------------------------------------------------------------------
   7d) ARBEITEN & COINS
--------------------------------------------------------------------- */
let isWorking = false;
let workInterval = null;
const WORK_MIN_MS = 15000;
const WORK_MAX_MS = 20000;

function startWork() {
  if (actionsBlocked()) return;
  if (state.isTorn) return showToast("🪡 Erst die Naht flicken, dann kann Summi wieder arbeiten!");
  if (state.isSick) return showToast("🤒 Summi ist krank – erst Medizin geben!");
  isWorking = true;
  el.bearWrap.classList.add("working");
  // Zeigt das Spielzeug, mit dem Summi während der Arbeit "schaukelt" –
  // nimmt ein besessenes Spielzeug, sonst den generischen Teddy-Platzhalter.
  const ownedToy = TOYS.find((t) => state.toys[t.id] > 0);
  document.getElementById("workToyIcon").textContent = ownedToy ? ownedToy.emoji : "🧸";
  const duration = WORK_MIN_MS + Math.random() * (WORK_MAX_MS - WORK_MIN_MS);
  const startTime = performance.now();
  el.workBanner.classList.remove("hidden");
  el.workFill.style.width = "0%";
  renderAll();
  saveState();

  clearInterval(workInterval);
  workInterval = setInterval(() => {
    const elapsed = performance.now() - startTime;
    const pct = Math.min(100, (elapsed / duration) * 100);
    el.workFill.style.width = pct + "%";
    if (elapsed >= duration) finishWork();
  }, 100);
}

function finishWork() {
  clearInterval(workInterval);
  isWorking = false;
  el.bearWrap.classList.remove("working");
  el.workBanner.classList.add("hidden");
  const earned = Math.floor(10 + Math.random() * 21); // 10-30 Coins
  state.coins += earned;
  state.stats.worksDone++;
  // Logische Folge: Arbeiten kostet Kraft - danach ist er hungriger und
  // müder, statt einfach unverändert weiterzumachen wie zuvor.
  state.hunger = clamp(state.hunger - 15);
  state.fun = clamp(state.fun - 5);
  showToast("💼 Feierabend! +" + earned + " Coins verdient! Er hat jetzt Hunger und ist müde.");
  vibrate(20);
  registerInteraction(true); // müde von der Arbeit -> schläft bald ein, wie nach dem Spielen
  renderAll();
  saveState();
  checkAchievements();
}

/* ---------------------------------------------------------------------
   7e) NAHT-RISS & NÄHEN
   Selten reißt eine Naht auf. Der Bär "weint" (wie beim Weinen), bis man
   sie zunäht. Danach ist er noch etwas geschwächt und möchte trösten
   werden - über Essen oder Fernsehen (natürliche Folge, weil Hunger/Spaß
   nach dem Nähen etwas absinken und die bestehende Sprech-/Cry-Logik das
   von selbst aufgreift).
--------------------------------------------------------------------- */
let afflictionTimeout = null;
const AFFLICTION_CHECK_MIN_MS = 5 * 60 * 1000; // alle 5-15 Minuten einmal prüfen
const AFFLICTION_CHECK_MAX_MS = 15 * 60 * 1000;
const TEAR_CHANCE = 0.12; // Wahrscheinlichkeit pro Prüfung
const SICK_CHANCE = 0.08;

function scheduleAfflictionCheck() {
  clearTimeout(afflictionTimeout);
  const delay = AFFLICTION_CHECK_MIN_MS + Math.random() * (AFFLICTION_CHECK_MAX_MS - AFFLICTION_CHECK_MIN_MS);
  afflictionTimeout = setTimeout(rollAffliction, delay);
}

function rollAffliction() {
  const blocked =
    state.isDead || state.isTorn || state.isSick || isSleeping || isWorking ||
    !overlay.classList.contains("hidden");
  if (!blocked) {
    const r = Math.random();
    if (r < TEAR_CHANCE) {
      state.isTorn = true;
      showToast("😢 Autsch! Eine Naht ist aufgerissen!");
      registerInteraction();
      renderAll();
      saveState();
    } else if (r < TEAR_CHANCE + SICK_CHANCE) {
      state.isSick = true;
      showToast("🤒 Summi fühlt sich plötzlich nicht gut...");
      registerInteraction();
      renderAll();
      saveState();
      document.getElementById("sickPrompt").classList.remove("hidden");
    }
  }
  scheduleAfflictionCheck();
}

function sewBear() {
  if (!state.isTorn) return;
  state.isTorn = false;
  state.love = clamp(state.love + 6);
  // Nach dem Nähen etwas geschwächt - er hat noch Hunger und möchte Trost.
  state.hunger = clamp(state.hunger - 15);
  state.fun = clamp(state.fun - 10);
  showToast("🪡 Fertig genäht! Summi hätte jetzt gern etwas zu essen oder Fernsehen...");
  spawnParticles("🧵", 3);
  vibrate(20);
  registerInteraction();
  renderAll();
  saveState();
}

function giveMedicine() {
  if (!state.isSick) return;
  if (state.coins < 20) {
    showToast("Noch nicht genug 🪙 Coins für Medizin! Geh dafür arbeiten.");
    return;
  }
  state.coins -= 20;
  state.isSick = false;
  state.love = clamp(state.love + 8);
  state.hunger = clamp(state.hunger + 5);
  document.getElementById("sickPrompt").classList.add("hidden");
  showToast("🌡️ Medizin gegeben – Summi geht es gleich besser!");
  spawnParticles("💊", 3);
  vibrate(20);
  registerInteraction();
  renderAll();
  saveState();
}

document.getElementById("btnSew").addEventListener("click", sewBear);
document.getElementById("btnGiveMedicine").addEventListener("click", giveMedicine);

/* ---------------------------------------------------------------------
   8) VERFALL ÜBER ZEIT
--------------------------------------------------------------------- */
function applyDecay(seconds) {
  if (state.isDead) return; // im "ohnmächtigen" Zustand sinkt nichts mehr weiter

  state.hunger = clamp(state.hunger - DECAY.hunger * seconds);
  state.clean = clamp(state.clean - DECAY.clean * seconds);
  // Läuft jetzt gleichmäßig wie Hunger/Sauberkeit ab (auch im Schlaf), damit
  // sich kein Wert gegenüber den anderen "verzögert" anfühlt.
  state.fun = clamp(state.fun - DECAY.fun * seconds);

  const careAvg = (state.hunger + state.clean + state.fun) / 3;
  let loveRate;
  if (careAvg > 60) loveRate = 0.4; // steigt bei guter Pflege
  else if (careAvg < 30) loveRate = -1.3; // sinkt schnell bei Vernachlässigung
  else loveRate = -0.2;
  state.love = clamp(state.love + loveRate * seconds);

  checkDeath();
}

// Wenn wirklich ALLE Werte bei 0 sind, fällt Summi in Ohnmacht. Er wacht erst
// wieder auf, wenn genug 🍓 Erdbeeren gesammelt und für die Wiederbelebung
// eingesetzt wurden.
function checkDeath() {
  if (state.isDead) return;
  if (state.hunger <= 0 && state.clean <= 0 && state.fun <= 0 && state.love <= 0) {
    state.isDead = true;
    if (typeof stopGameLoop === "function") stopGameLoop();
    if (typeof overlay !== "undefined" && !overlay.classList.contains("hidden")) {
      overlay.classList.add("hidden");
    }
    showToast("😵 Summi ist ohnmächtig geworden...");
    showDeathOverlay();
  }
}

function reviveSummi() {
  if (state.strawberries < REVIVE_COST) return;
  state.strawberries -= REVIVE_COST;
  state.isDead = false;
  state.hunger = 50;
  state.clean = 50;
  state.fun = 50;
  state.love = 50;
  hideDeathOverlay();
  showToast("🎉 Summi ist wieder wach! Pass gut auf ihn auf.");
  registerInteraction();
  renderAll();
  saveState();
}

/* ---------------------------------------------------------------------
   7e) SPIELZEUG- & KLEIDUNG-SHOP (mit Coins) & INVENTAR
--------------------------------------------------------------------- */
// Generische Spielzeuge (bewusst KEINE geschützten Marken/Figuren verwendet).
const TOYS = [
  { id: "piglet", emoji: "🐷", name: "Kuscheltier-Ferkel", desc: "Süßes kleines Ferkel zum Kuscheln", cost: 30, funGain: 15 },
  { id: "cowboy", emoji: "🤠", name: "Cowboy-Figur", desc: "Mutige Spielzeug-Figur für Abenteuer", cost: 60, funGain: 25 },
  { id: "plush", emoji: "🧸", name: "XXL-Kuscheltier", desc: "Riesiges, flauschiges Kuscheltier", cost: 120, funGain: 40 },
  { id: "ball", emoji: "⚽", name: "Spielball", desc: "Zum Kicken und Werfen", cost: 25, funGain: 12 },
  { id: "yoyo", emoji: "🪀", name: "Jo-Jo", desc: "Für flinke Tricks", cost: 20, funGain: 10 },
  { id: "kite", emoji: "🪁", name: "Drachen", desc: "Steigt hoch in den Wind", cost: 55, funGain: 22 },
  { id: "blocks", emoji: "🧩", name: "Bauklötze", desc: "Zum Türme bauen und Knobeln", cost: 45, funGain: 18 },
  { id: "duck", emoji: "🦆", name: "Quietsche-Ente", desc: "Süße Ente zum Quietschen", cost: 20, funGain: 10 },
  { id: "doll", emoji: "🪆", name: "Puppe", desc: "Zum Herzen und Wiegen", cost: 65, funGain: 26 },
  { id: "dollcar", emoji: "🚗", name: "Puppenauto", desc: "Zum Herumfahren und Schieben", cost: 50, funGain: 20 },
];

// Anziehbare Kleidung/Accessoires. "slot" bestimmt, welches SVG-Overlay
// getauscht wird (nur ein Teil pro Slot gleichzeitig sichtbar).
const CLOTHES = [
  { id: "bow", slot: "neck", groupId: "accessoryBow", emoji: "🎀", name: "Fliege", desc: "Schick für besondere Anlässe", cost: 40, loveGain: 8 },
  { id: "scarf", slot: "neck", groupId: "accessoryScarf", emoji: "🧣", name: "Schal", desc: "Kuschelig warm", cost: 35, loveGain: 6 },
  { id: "glasses", slot: "eyes", groupId: "accessoryGlasses", emoji: "🕶️", name: "Brille", desc: "Cool und lässig", cost: 45, loveGain: 8 },
  { id: "hat", slot: "head", groupId: "accessoryHat", emoji: "🎩", name: "Zylinder", desc: "Edel und vornehm", cost: 70, loveGain: 12 },
  { id: "cap", slot: "head", groupId: "accessoryCap", emoji: "🧢", name: "Basecap", desc: "Sportlich-lässig", cost: 50, loveGain: 10 },
  { id: "flower", slot: "ear", groupId: "accessoryFlower", emoji: "🌸", name: "Blümchen", desc: "Süß hinterm Ohr", cost: 25, loveGain: 5 },
];

// Zeigt im Shop exakt dieselbe Zeichnung wie am Bären selbst (statt eines
// Emojis, das optisch anders aussieht als das tatsächliche SVG-Accessoire).
// Die Pfade sind 1:1 aus den #accessory*-Gruppen im HTML kopiert, nur mit
// einem engeren viewBox-Ausschnitt fürs kleine Vorschaubild.
const CLOTHES_PREVIEW = {
  bow: {
    viewBox: "115 165 70 42",
    inner: `
      <path d="M 150 186 L 128 172 Q 122 186 128 200 Z" fill="#7FB3B8"/>
      <path d="M 150 186 L 172 172 Q 178 186 172 200 Z" fill="#5FA3A8"/>
      <circle cx="150" cy="186" r="7" fill="#5C4A42"/>`,
  },
  scarf: {
    viewBox: "90 172 120 68",
    inner: `
      <path d="M 96 178 Q 150 200 204 178 L 204 192 Q 150 214 96 192 Z" fill="#E2564F"/>
      <path d="M 140 205 L 132 236 L 150 226 Z" fill="#C23F3F"/>
      <path d="M 160 205 L 168 232 L 150 224 Z" fill="#E2564F"/>`,
  },
  glasses: {
    viewBox: "85 88 130 48",
    inner: `
      <circle cx="120" cy="112" r="19" fill="none" stroke="#4A3730" stroke-width="4"/>
      <circle cx="180" cy="112" r="19" fill="none" stroke="#4A3730" stroke-width="4"/>
      <path d="M 139 112 L 161 112" stroke="#4A3730" stroke-width="4"/>
      <path d="M 101 108 L 90 100" stroke="#4A3730" stroke-width="4" stroke-linecap="round"/>
      <path d="M 199 108 L 210 100" stroke="#4A3730" stroke-width="4" stroke-linecap="round"/>`,
  },
  hat: {
    viewBox: "95 10 110 70",
    inner: `
      <ellipse cx="150" cy="62" rx="52" ry="12" fill="#5C4A42"/>
      <path d="M 112 64 Q 112 18 150 18 Q 188 18 188 64 Z" fill="#6B5850"/>
      <ellipse cx="150" cy="64" rx="38" ry="9" fill="#7A6660"/>`,
  },
  cap: {
    viewBox: "95 28 130 62",
    inner: `
      <path d="M 100 78 Q 108 32 150 32 Q 192 32 200 78 Q 150 68 100 78 Z" fill="#7FB3B8"/>
      <path d="M 186 70 Q 214 70 218 82 Q 196 84 184 78 Z" fill="#5FA3A8"/>`,
  },
  flower: {
    viewBox: "61 34 34 30",
    inner: `
      <circle cx="75" cy="50" r="5" fill="#F26D9B"/>
      <circle cx="83" cy="44" r="5" fill="#FFA6C1"/>
      <circle cx="85" cy="54" r="5" fill="#FFA6C1"/>
      <circle cx="79" cy="50" r="4" fill="#FFD97D"/>`,
  },
};

const shopOverlay = document.getElementById("shopOverlay");
const shopList = document.getElementById("shopList");
const inventoryList = document.getElementById("inventoryList");
const inventoryTitle = document.getElementById("inventoryTitle");
const shopTabHint = document.getElementById("shopTabHint");
let shopActiveTab = "toys";

function openShop() {
  shopOverlay.classList.remove("hidden");
  renderShop();
}

function closeShop() {
  shopOverlay.classList.add("hidden");
}

function setShopTab(tab) {
  shopActiveTab = tab;
  document.getElementById("shopTabToys").classList.toggle("active", tab === "toys");
  document.getElementById("shopTabClothes").classList.toggle("active", tab === "clothes");
  document.getElementById("shopTabCards").classList.toggle("active", tab === "cards");
  shopTabHint.textContent =
    tab === "toys"
      ? "Kaufe Spielzeug für mehr Spaß! Coins bekommst du fürs Arbeiten und in Minispielen."
      : tab === "clothes"
      ? "Kleide Summi ein! Getragene Sachen sieht man direkt am Bären."
      : "Öffne Booster-Packs und sammle alle Karten!";
  inventoryTitle.textContent = tab === "toys" ? "🎒 Spielzeug-Inventar" : tab === "clothes" ? "🎒 Kleiderschrank" : "🎴 Deine Karten";
  renderShop();
}

function renderShop() {
  if (shopActiveTab === "clothes") {
    renderClothesShop();
  } else if (shopActiveTab === "cards") {
    renderCardsShop();
  } else {
    renderToyShop();
  }
}

function renderToyShop() {
  shopList.className = "shop-list";
  shopList.innerHTML = TOYS.map(
    (toy) => `
    <div class="shop-item">
      <div class="shop-item-emoji">${toy.emoji}</div>
      <div class="shop-item-info">
        <div class="shop-item-name">${toy.name}</div>
        <div class="shop-item-desc">${toy.desc} · +${toy.funGain} 🎈 Spaß</div>
      </div>
      <button class="shop-buy-btn" data-toy="${toy.id}" ${state.coins < toy.cost ? "disabled" : ""}>
        ${toy.cost}<img src="coin_gold_bear.png" alt="Coins" class="coin-icon">
      </button>
    </div>`
  ).join("");

  shopList.querySelectorAll(".shop-buy-btn").forEach((btn) => {
    btn.addEventListener("click", () => buyToy(btn.dataset.toy));
  });

  renderToyInventory();
}

function renderToyInventory() {
  const owned = TOYS.filter((t) => state.toys[t.id] > 0);
  if (owned.length === 0) {
    inventoryList.innerHTML = '<span class="inventory-empty">Noch kein Spielzeug gekauft.</span>';
    return;
  }
  inventoryList.innerHTML = owned
    .map(
      (t) => `
      <span class="inventory-item">
        ${t.emoji} ${t.name} ×${state.toys[t.id]}
        <button class="inventory-play-btn" data-toy="${t.id}" title="Zusammen mit Summi spielen!">▶️</button>
      </span>`
    )
    .join("");
  inventoryList.querySelectorAll(".inventory-play-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeShop();
      startToyPlay(btn.dataset.toy);
    });
  });
}

function renderClothesShop() {
  shopList.className = "shop-list";
  shopList.innerHTML = CLOTHES.map((item) => {
    const preview = CLOTHES_PREVIEW[item.id];
    const previewHtml = preview
      ? `<svg viewBox="${preview.viewBox}">${preview.inner}</svg>`
      : item.emoji;
    return `
    <div class="shop-item">
      <div class="shop-item-emoji clothes-preview">${previewHtml}</div>
      <div class="shop-item-info">
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-desc">${item.desc} · +${item.loveGain} 💗 Liebe</div>
      </div>
      <button class="shop-buy-btn" data-clothes="${item.id}" ${state.coins < item.cost ? "disabled" : ""}>
        ${item.cost}<img src="coin_gold_bear.png" alt="Coins" class="coin-icon">
      </button>
    </div>`;
  }).join("");

  shopList.querySelectorAll(".shop-buy-btn").forEach((btn) => {
    btn.addEventListener("click", () => buyClothing(btn.dataset.clothes));
  });

  renderClothesInventory();
}

function renderClothesInventory() {
  const owned = CLOTHES.filter((c) => state.clothes[c.id] > 0);
  if (owned.length === 0) {
    inventoryList.innerHTML = '<span class="inventory-empty">Noch keine Kleidung gekauft.</span>';
    return;
  }
  inventoryList.innerHTML = owned
    .map((c) => {
      const worn = state.equipped[c.slot] === c.id;
      return `
      <span class="inventory-item">
        ${c.emoji} ${c.name}
        <button class="inventory-play-btn shop-equip-btn ${worn ? "is-worn" : ""}" data-clothes="${c.id}">
          ${worn ? "Ausziehen" : "Anziehen"}
        </button>
      </span>`;
    })
    .join("");
  inventoryList.querySelectorAll(".shop-equip-btn").forEach((btn) => {
    btn.addEventListener("click", () => toggleEquip(btn.dataset.clothes));
  });
}

function buyToy(id) {
  const toy = TOYS.find((t) => t.id === id);
  if (!toy) return;
  if (state.coins < toy.cost) {
    showToast("Noch nicht genug 🪙 Coins! Geh dafür arbeiten.");
    return;
  }
  state.coins -= toy.cost;
  state.toys[id] = (state.toys[id] || 0) + 1;
  state.fun = clamp(state.fun + toy.funGain);
  state.love = clamp(state.love + 5);
  state.stats.toysBought++;
  showToast(toy.emoji + " " + toy.name + " gekauft – Summi freut sich!");
  vibrate(15);
  renderAll();
  saveState();
  renderShop();
  checkAchievements();
}

function buyClothing(id) {
  const item = CLOTHES.find((c) => c.id === id);
  if (!item) return;
  if (state.coins < item.cost) {
    showToast("Noch nicht genug 🪙 Coins! Geh dafür arbeiten.");
    return;
  }
  state.coins -= item.cost;
  state.clothes[id] = (state.clothes[id] || 0) + 1;
  state.love = clamp(state.love + item.loveGain);
  state.stats.clothesBought++;
  // Direkt anziehen, damit man den Kauf sofort am Bären sieht.
  state.equipped[item.slot] = id;
  showToast(item.emoji + " " + item.name + " gekauft – Summi trägt es direkt!");
  vibrate(15);
  renderAccessories();
  renderAll();
  saveState();
  renderShop();
  checkAchievements();
}

function toggleEquip(id) {
  const item = CLOTHES.find((c) => c.id === id);
  if (!item || !state.clothes[id]) return;
  state.equipped[item.slot] = state.equipped[item.slot] === id ? null : id;
  renderAccessories();
  renderShop();
  saveState();
}

// Blendet die passenden SVG-Overlays für aktuell getragene Kleidung ein/aus.
function renderAccessories() {
  CLOTHES.forEach((c) => {
    const g = document.getElementById(c.groupId);
    if (!g) return;
    g.classList.toggle("hidden-acc", state.equipped[c.slot] !== c.id);
  });
}

document.getElementById("shopBtn").addEventListener("click", openShop);
document.getElementById("shopClose").addEventListener("click", closeShop);
document.getElementById("shopTabToys").addEventListener("click", () => setShopTab("toys"));
document.getElementById("shopTabClothes").addEventListener("click", () => setShopTab("clothes"));

/* ---------------------------------------------------------------------
   7f) MIT SPIELZEUG SPIELEN (direkt am Bären auf der Startseite, statt in
   einem separaten Popup — Summi nimmt das Spielzeug sichtbar in die Hand
   und spielt danach ganz von selbst damit, mit einer zum Spielzeug
   passenden Animation. Die Auswahl liegt im "Spielen"-Menü, damit sie
   nicht dauerhaft auf der Startseite herumsteht, sondern nur erscheint,
   wenn man sie wirklich braucht.)
--------------------------------------------------------------------- */
const toyMenuSection = document.getElementById("toyMenuSection");
const toyMenuList = document.getElementById("toyMenuList");
const TOY_PLAY_DURATION = 4.5; // Sekunden, in denen Summi selbständig spielt
let toyPlayState = null; // { id }
let toyPlayTimeout = null;

// Jedes Spielzeug bekommt seine eigene CSS-Animationsklasse fürs Halten,
// dazu eine "Haltungsart" (hand/hug/ground), damit die Arme/Position logisch
// zum Spielzeug passen (z.B. ein Ball gehört an den Fuß, kein Kuscheltier
// wird in der Hand gehalten wie ein Ball).
const TOY_ANIM_CLASS = {
  piglet: "toy-anim-cuddle",
  cowboy: "toy-anim-gallop",
  plush: "toy-anim-hug",
  ball: "toy-anim-ball",
  yoyo: "toy-anim-yoyo",
  kite: "toy-anim-kite",
  blocks: "toy-anim-blocks",
  duck: "toy-anim-duck",
  doll: "toy-anim-cuddle",
  dollcar: "toy-anim-car",
};
const TOY_HOLD_CLASS = {
  piglet: "playing-toy-hug",
  cowboy: "playing-toy-hand",
  plush: "playing-toy-hug",
  ball: "playing-toy-ground",
  yoyo: "playing-toy-hand",
  kite: "playing-toy-hand",
  blocks: "playing-toy-hand",
  duck: "playing-toy-hand",
  doll: "playing-toy-hug",
  dollcar: "playing-toy-ground",
};

// Füllt die Spielzeug-Auswahl im "Spielen"-Menü (nur sichtbar, solange das
// Menü offen ist — nicht dauerhaft auf der Startseite).
function renderToyMenu() {
  if (!toyMenuSection) return;
  const owned = TOYS.filter((t) => state.toys[t.id] > 0);
  if (owned.length === 0) {
    toyMenuSection.classList.add("hidden");
    return;
  }
  toyMenuSection.classList.remove("hidden");
  toyMenuList.innerHTML = owned
    .map((t) => `<button class="toy-tray-btn" data-toy="${t.id}" title="Mit ${t.name} spielen">${t.emoji}</button>`)
    .join("");
  toyMenuList.querySelectorAll(".toy-tray-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeGameOverlay();
      startToyPlay(btn.dataset.toy);
    });
  });
}

function startToyPlay(id) {
  const toy = TOYS.find((t) => t.id === id);
  if (!toy || !state.toys[id]) return;
  if (actionsBlocked()) return;

  registerInteraction();
  toyPlayState = { id };
  renderActionLock(); // andere Aktionen sofort sperren, solange Summi spielt

  const animClass = TOY_ANIM_CLASS[id] || "toy-anim-ball";
  const holdClass = TOY_HOLD_CLASS[id] || "playing-toy-hand";
  el.heldToy.textContent = toy.emoji;
  el.heldToy.className = "held-toy " + animClass;
  el.bearWrap.classList.remove("playing-toy-hand", "playing-toy-hug", "playing-toy-ground");
  el.bearWrap.classList.add("playing-toy", holdClass);

  el.toyPlayLabel.textContent = toy.emoji + " Spielt selbständig mit " + toy.name;
  el.toyPlayBanner.classList.remove("hidden");
  // Füllbalken läuft rein per CSS-Transition automatisch durch, kein Antippen nötig.
  el.toyPlayFill.style.transition = "none";
  el.toyPlayFill.style.width = "0%";
  void el.toyPlayFill.offsetWidth; // Reflow erzwingen, damit die Transition neu startet
  el.toyPlayFill.style.transition = "width " + TOY_PLAY_DURATION + "s linear";
  el.toyPlayFill.style.width = "100%";

  clearTimeout(toyPlayTimeout);
  toyPlayTimeout = setTimeout(finishToyPlay, TOY_PLAY_DURATION * 1000);
}

function finishToyPlay() {
  clearTimeout(toyPlayTimeout);
  if (!toyPlayState) return;
  const toy = TOYS.find((t) => t.id === toyPlayState.id);
  toyPlayState = null;

  el.bearWrap.classList.remove("playing-toy", "playing-toy-hand", "playing-toy-hug", "playing-toy-ground");
  el.heldToy.classList.add("hidden");
  el.toyPlayBanner.classList.add("hidden");
  if (!toy) return;

  const funGain = toy.funGain;
  const loveGain = 6;
  state.fun = clamp(state.fun + funGain);
  state.love = clamp(state.love + loveGain);
  addCarePoints(CARE_POINTS.play * 0.5);
  spawnParticles("✨", 4);
  if (toy.id === "cowboy") {
    showToast("🤠 Da bist du ja! Summi hat seinen Cowboy-Freund so vermisst! (+" + funGain + " 🎈)");
  } else {
    showToast(toy.emoji + " Summi hatte riesigen Spaß mit " + toy.name + "! (+" + funGain + " 🎈)");
  }
  vibrate(30);
  registerInteraction(true);
  renderAll();
  saveState();
}

function startTickLoop() {
  setInterval(() => {
    applyDecay(1);
    renderAll();
  }, 1000);

  setInterval(saveState, 5000);
}

/* ---------------------------------------------------------------------
   7f-2) SAMMELKARTEN & BOOSTER-PACKS
   Die Karten zeigen echte Summi-Fotos (dieselben Bilder wie im
   Fotoalbum), gerahmt je nach Seltenheit. Um weitere Karten zu
   ergänzen, einfach einen Eintrag mit "img"-Pfad + Seltenheit anhängen.
--------------------------------------------------------------------- */
const CARD_RARITIES = {
  common: { label: "Common", weight: 60 },
  rare: { label: "Rare", weight: 28 },
  ultra: { label: "Ultra", weight: 10 },
  legendary: { label: "Legendär", weight: 2 },
};

const CARD_POOL = [
  { id: "p1", name: "Kuschelmoment", img: "photos/photo1.jpg", rarity: "common" },
  { id: "p2", name: "Verschlafen", img: "photos/photo2.jpg", rarity: "common" },
  { id: "p3", name: "Neugierig", img: "photos/photo3.jpg", rarity: "common" },
  { id: "p4", name: "Verspielt", img: "photos/photo4.jpg", rarity: "common" },
  { id: "p5", name: "Gemütlich", img: "photos/photo5.jpg", rarity: "common" },
  { id: "p6", name: "Träumerisch", img: "photos/photo6.jpg", rarity: "common" },
  { id: "p7", name: "Zufrieden", img: "photos/photo7.jpg", rarity: "common" },
  { id: "p8", name: "Entspannt", img: "photos/photo8.jpg", rarity: "common" },
  { id: "p9", name: "Fröhlich", img: "photos/photo9.jpg", rarity: "common" },
  { id: "p10", name: "Ausgeruht", img: "photos/photo10.jpg", rarity: "common" },
  { id: "p11", name: "Abenteuerlustig", img: "photos/photo11.jpg", rarity: "rare" },
  { id: "p12", name: "Verträumt", img: "photos/photo12.jpg", rarity: "rare" },
  { id: "p14", name: "Herzlich", img: "photos/photo14.jpg", rarity: "rare" },
  { id: "p15", name: "Charmant", img: "photos/photo15.jpg", rarity: "rare" },
  { id: "p16", name: "Bezaubernd", img: "photos/photo16.jpg", rarity: "rare" },
  { id: "p17", name: "Strahlender Stern", img: "photos/photo17.jpg", rarity: "ultra" },
  { id: "p18", name: "Goldmoment", img: "photos/photo18.jpg", rarity: "ultra" },
  { id: "p19", name: "Der ganz besondere Moment", img: "photos/photo19.jpg", rarity: "legendary" },
  { id: "p20", name: "Schlummerstunde", img: "photos/photo20.jpg", rarity: "ultra" },
  { id: "p21", name: "Frostig", img: "photos/photo21.jpg", rarity: "common" },
  { id: "p22", name: "Festlich", img: "photos/photo22.jpg", rarity: "common" },
  { id: "p23", name: "Verschmust", img: "photos/photo23.jpg", rarity: "common" },
  { id: "p24", name: "Blumenkind", img: "photos/photo24.jpg", rarity: "common" },
  { id: "p25", name: "Mittagsschläfchen", img: "photos/photo25.jpg", rarity: "common" },
  { id: "p26", name: "Bienchen-Schlaf", img: "photos/photo26.jpg", rarity: "common" },
  { id: "p27", name: "Frühstückszeit", img: "photos/photo27.jpg", rarity: "common" },
  { id: "p28", name: "Farbenfroh", img: "photos/photo28.jpg", rarity: "rare" },
  { id: "p29", name: "Sonnig", img: "photos/photo29.jpg", rarity: "common" },
  { id: "p30", name: "Eiszeit", img: "photos/photo30.jpg", rarity: "rare" },
  { id: "p31", name: "Beste Freunde", img: "photos/photo31.jpg", rarity: "rare" },
  { id: "p32", name: "Zuhause", img: "photos/photo32.jpg", rarity: "common" },
  { id: "p33", name: "Nachdenklich", img: "photos/photo33.jpg", rarity: "common" },
  { id: "p34", name: "Geborgen", img: "photos/photo34.jpg", rarity: "ultra" },
  { id: "p35", name: "Unterwegs", img: "photos/photo35.jpg", rarity: "rare" },
  { id: "p36", name: "Eingekuschelt", img: "photos/photo36.jpg", rarity: "common" },
  { id: "p37", name: "Daheim", img: "photos/photo37.jpg", rarity: "common" },
  { id: "p38", name: "Café-Besuch", img: "photos/photo38.jpg", rarity: "common" },
  { id: "p39", name: "Lichtblick", img: "photos/photo39.jpg", rarity: "rare" },
  { id: "p40", name: "Stadtbummel", img: "photos/photo40.jpg", rarity: "legendary" },
];

// Mehrere unterschiedliche Pack-Varianten (eigenes Thema, Cover-Foto und
// Farbe je Pack) - wie ein Regal mit verschiedenen Sammelkarten-Editionen.
const BOOSTER_PACKS = [
  {
    id: "basic",
    name: "Kuschelmomente",
    subtitle: "Standard-Pack",
    desc: "3 zufällige Karten",
    cost: 40,
    currency: "coins",
    cardCount: 3,
    boosted: false,
    coverImg: "pack-cover.jpg",
    gradient: "linear-gradient(160deg,#7FB3B8,#5FA3A8)",
  },
  {
    id: "premium",
    name: "Sternenstaub",
    subtitle: "Glücks-Pack",
    desc: "3 Karten, bessere Chance auf Seltenes!",
    cost: 12,
    currency: "strawberries",
    cardCount: 3,
    boosted: true,
    coverImg: "pack-cover.jpg",
    gradient: "linear-gradient(160deg,#C79AF0,#8F5FD1)",
  },
  {
    id: "adventure",
    name: "Abenteuer-Zeit",
    subtitle: "Abenteuer-Pack",
    desc: "3 zufällige Karten",
    cost: 55,
    currency: "coins",
    cardCount: 3,
    boosted: false,
    coverImg: "pack-cover.jpg",
    gradient: "linear-gradient(160deg,#A9CC8C,#6E9A56)",
  },
  {
    id: "sunny",
    name: "Strand & Sonne",
    subtitle: "Sommer-Pack",
    desc: "3 zufällige Karten",
    cost: 60,
    currency: "coins",
    cardCount: 3,
    boosted: false,
    coverImg: "pack-cover.jpg",
    gradient: "linear-gradient(160deg,#FFD97D,#F2A65A)",
  },
  {
    id: "kitchen",
    name: "Kuschel-Küche",
    subtitle: "Leckerbissen-Pack",
    desc: "3 zufällige Karten",
    cost: 45,
    currency: "coins",
    cardCount: 3,
    boosted: false,
    coverImg: "pack-cover.jpg",
    gradient: "linear-gradient(160deg,#F4A6A6,#E2564F)",
  },
  {
    id: "dream",
    name: "Traumreise",
    subtitle: "Nacht-Pack",
    desc: "3 Karten, bessere Chance auf Seltenes!",
    cost: 20,
    currency: "strawberries",
    cardCount: 3,
    boosted: true,
    coverImg: "pack-cover.jpg",
    gradient: "linear-gradient(160deg,#7B8FD1,#4A5A9E)",
  },
];

function rollCardRarity(boosted) {
  const weights = Object.entries(CARD_RARITIES).map(([key, r]) => ({
    key,
    weight: boosted && key !== "common" ? r.weight * 2 : r.weight,
  }));
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * total;
  for (const w of weights) {
    if (roll < w.weight) return w.key;
    roll -= w.weight;
  }
  return "common";
}

function pickRandomCard(rarity) {
  const pool = CARD_POOL.filter((c) => c.rarity === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

function cardTileHtml(card, options = {}) {
  const owned = state.cards[card.id] || 0;
  if (!owned && !options.forceShow) {
    return `<div class="card-tile locked"><span class="card-lock">🔒</span></div>`;
  }
  const countBadge = owned > 1 ? `<span class="card-count">×${owned}</span>` : "";
  const revealClass = options.reveal ? "reveal-in" : "";
  const delay = options.delay ? `style="animation-delay:${options.delay}s"` : "";
  const sparkles = card.rarity !== "common"
    ? `<span class="card-sparkle card-sparkle-tl">✨</span><span class="card-sparkle card-sparkle-bl">✨</span>`
    : "";
  return `
    <div class="card-tile rarity-${card.rarity} ${revealClass}" ${delay}>
      <div class="card-tile-inner">
        <div class="card-photo-wrap"><img src="${card.img}" alt="${card.name}" loading="lazy"></div>
        <span class="card-name">${card.name}</span>
      </div>
      <span class="card-rarity-badge">${CARD_RARITIES[card.rarity].label}</span>
      ${countBadge}
      ${sparkles}
    </div>`;
}

function openBoosterPack(packId) {
  const pack = BOOSTER_PACKS.find((p) => p.id === packId);
  if (!pack) return;
  const balance = pack.currency === "coins" ? state.coins : state.strawberries;
  if (balance < pack.cost) {
    showToast("Nicht genug " + (pack.currency === "coins" ? "🪙 Coins" : "🍓 Erdbeeren") + " für dieses Pack!");
    return;
  }
  if (pack.currency === "coins") state.coins -= pack.cost;
  else state.strawberries -= pack.cost;

  const drawnCards = [];
  for (let i = 0; i < pack.cardCount; i++) {
    const rarity = rollCardRarity(pack.boosted);
    const card = pickRandomCard(rarity);
    state.cards[card.id] = (state.cards[card.id] || 0) + 1;
    drawnCards.push(card);
  }

  renderAll();
  saveState();
  renderShop();
  checkAchievements();
  showBoosterOpeningAnimation(pack, drawnCards);
  vibrate(25);
}

// Zeigt zuerst eine kurze "Öffnungs-Animation" (Pack zittert und platzt
// auf) und erst DANACH das Karten-Reveal - man weiß also bis zum
// Aufplatzen nicht, was man gezogen hat.
let boosterAnimTimeouts = [];
function showBoosterOpeningAnimation(pack, cards) {
  clearBoosterAnimTimeouts();
  const overlayEl = document.getElementById("boosterOpenOverlay");
  const stage = document.getElementById("boosterOpeningStage");
  const packEl = document.getElementById("boosterOpeningPack");
  const revealSection = document.getElementById("boosterRevealSection");
  const doneBtn = document.getElementById("boosterRevealDoneBtn");

  packEl.style.background = pack.gradient;
  packEl.innerHTML = `<img src="${pack.coverImg}" alt=""><div class="booster-opening-name">${pack.name}</div>`;
  packEl.className = "booster-opening-pack";
  document.getElementById("boosterOpeningHint").textContent = "Wird geöffnet ...";

  stage.classList.remove("hidden");
  revealSection.classList.add("hidden");
  doneBtn.classList.add("hidden");
  overlayEl.classList.remove("hidden");

  void packEl.offsetWidth; // Reflow erzwingen, damit die Animation sicher (neu) startet
  packEl.classList.add("shake");

  boosterAnimTimeouts.push(setTimeout(() => {
    packEl.classList.add("burst");
    vibrate(35);
  }, 900));

  boosterAnimTimeouts.push(setTimeout(() => {
    stage.classList.add("hidden");
    showBoosterReveal(cards);
  }, 1450));
}

function clearBoosterAnimTimeouts() {
  boosterAnimTimeouts.forEach(clearTimeout);
  boosterAnimTimeouts = [];
}

function showBoosterReveal(cards) {
  const grid = document.getElementById("boosterRevealGrid");
  grid.innerHTML = cards
    .map((card, i) => cardTileHtml(card, { forceShow: true, reveal: true, delay: i * 0.15 }))
    .join("");
  document.getElementById("boosterRevealSection").classList.remove("hidden");
  document.getElementById("boosterRevealDoneBtn").classList.remove("hidden");
  document.getElementById("boosterOpenOverlay").classList.remove("hidden");
}

function closeBoosterReveal() {
  clearBoosterAnimTimeouts();
  document.getElementById("boosterOpenOverlay").classList.add("hidden");
}

// Einheitliches Marken-Logo auf jedem Pack (wie eine "Spielserie"), damit die
// Packs wie echte, verschlossene Sammelkarten-Packs aussehen und nicht wie
// eine einfache Vorschau des Inhalts.
const BOOSTER_BRAND_TITLE = "Summis Sammelwelt";

function renderCardsShop() {
  shopList.className = "shop-boosters";
  shopList.innerHTML = BOOSTER_PACKS.map((pack) => {
    const balance = pack.currency === "coins" ? state.coins : state.strawberries;
    const costLabel = pack.currency === "coins"
      ? `${pack.cost}<img src="coin_gold_bear.png" alt="Coins" class="coin-icon">`
      : `${pack.cost} 🍓`;
    return `
    <div class="booster-pack-card" style="background:${pack.gradient}">
      <div class="pack-top-trim"></div>
      <div class="pack-brand">${BOOSTER_BRAND_TITLE}</div>
      <div class="booster-pack-subtitle">${pack.subtitle}</div>
      <div class="pack-art">
        <img src="${pack.coverImg}" alt="">
        <span class="pack-deco pack-deco-1">✨</span>
        <span class="pack-deco pack-deco-2">⭐</span>
        <span class="pack-deco pack-deco-3">💫</span>
      </div>
      <div class="booster-pack-name">${pack.name}</div>
      <div class="pack-bottom-bar"><span>${pack.cardCount} Karten</span></div>
      <div class="pack-bottom-trim"></div>
      <button class="booster-buy-btn" data-pack="${pack.id}" ${balance < pack.cost ? "disabled" : ""}>
        ${costLabel}
      </button>
    </div>`;
  }).join("");

  shopList.querySelectorAll(".booster-buy-btn").forEach((btn) => {
    btn.addEventListener("click", () => openBoosterPack(btn.dataset.pack));
  });

  inventoryTitle.textContent = "🎴 Deine Karten";
  const owned = CARD_POOL.filter((c) => state.cards[c.id] > 0).length;
  inventoryList.innerHTML = `<span class="inventory-empty">${owned} / ${CARD_POOL.length} Karten gesammelt – im Kartenalbum (🎴 oben) ansehen.</span>`;
}

function openCardAlbum() {
  const grid = document.getElementById("cardAlbumGrid");
  grid.innerHTML = CARD_POOL.map((card) => cardTileHtml(card)).join("");
  const owned = CARD_POOL.filter((c) => state.cards[c.id] > 0).length;
  document.getElementById("cardAlbumProgress").textContent = owned + " / " + CARD_POOL.length + " Karten gesammelt";
  document.getElementById("cardAlbumOverlay").classList.remove("hidden");
}

document.getElementById("cardAlbumBtn").addEventListener("click", openCardAlbum);
document.getElementById("cardAlbumClose").addEventListener("click", () => {
  document.getElementById("cardAlbumOverlay").classList.add("hidden");
});
document.getElementById("boosterOpenClose").addEventListener("click", closeBoosterReveal);
document.getElementById("boosterRevealDoneBtn").addEventListener("click", closeBoosterReveal);
document.getElementById("shopTabCards").addEventListener("click", () => setShopTab("cards"));

/* ---------------------------------------------------------------------
   7g) TÄGLICHE BELOHNUNG (Login-Serie) & ERFOLGE
--------------------------------------------------------------------- */
const DAILY_REWARDS = [
  { coins: 10, strawberries: 0 },
  { coins: 15, strawberries: 1 },
  { coins: 20, strawberries: 1 },
  { coins: 25, strawberries: 2 },
  { coins: 30, strawberries: 2 },
  { coins: 40, strawberries: 3 },
  { coins: 60, strawberries: 5 }, // Tag 7: großer Bonus
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function canClaimDailyReward() {
  return state.dailyStreak.lastClaim !== todayStr();
}

function claimDailyReward() {
  if (!canClaimDailyReward()) {
    showToast("🏆 Heute schon abgeholt – komm morgen wieder!");
    return;
  }
  const today = todayStr();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (state.dailyStreak.lastClaim === yesterday) {
    state.dailyStreak.count++;
  } else {
    state.dailyStreak.count = 1; // Serie verpasst -> neu beginnen
  }
  state.dailyStreak.lastClaim = today;
  state.dailyStreak.best = Math.max(state.dailyStreak.best, state.dailyStreak.count);

  const cycleDay = ((state.dailyStreak.count - 1) % 7) + 1;
  const reward = DAILY_REWARDS[cycleDay - 1];
  state.coins += reward.coins;
  addStrawberries(reward.strawberries);
  showToast(
    "🎁 Tag " + state.dailyStreak.count + ": +" + reward.coins + " Coins" +
    (reward.strawberries ? " +" + reward.strawberries + " 🍓" : "") + "!"
  );
  spawnParticles("🎉", 5);
  vibrate(30);
  renderAll();
  saveState();
  renderDailyReward();
  checkAchievements();
  document.getElementById("questBtn").classList.toggle("has-badge", canClaimDailyReward() || canSpinWheel());
}

function renderDailyReward() {
  const textEl = document.getElementById("dailyStreakText");
  const rowEl = document.getElementById("dailyStreakRow");
  const claimBtn = document.getElementById("dailyClaimBtn");
  if (!textEl) return;

  const cycleDay = ((Math.max(state.dailyStreak.count, 1) - 1) % 7) + 1;
  textEl.textContent = "Serie: Tag " + state.dailyStreak.count + " (bester Streak: " + state.dailyStreak.best + ")";

  rowEl.innerHTML = Array.from({ length: 7 }, (_, i) => {
    const dayNum = i + 1;
    const claimedInCycle = dayNum < cycleDay || (dayNum === cycleDay && !canClaimDailyReward());
    const isToday = dayNum === cycleDay;
    return `<div class="daily-day ${claimedInCycle ? "claimed" : ""} ${isToday ? "today" : ""}">${dayNum}</div>`;
  }).join("");

  if (canClaimDailyReward()) {
    claimBtn.disabled = false;
    claimBtn.textContent = "🎁 Belohnung abholen";
  } else {
    claimBtn.disabled = true;
    claimBtn.textContent = "✅ Heute schon abgeholt";
  }
}

/* ---------------------------------------------------------------------
   7h) TÄGLICHES GLÜCKSRAD (einmal pro Tag, zusätzlich zur Login-Serie)
--------------------------------------------------------------------- */
const WHEEL_PRIZES = [
  { type: "coins", amount: 10, weight: 25, emoji: "🪙", label: "10 Coins" },
  { type: "strawberries", amount: 5, weight: 20, emoji: "🍓", label: "5 Erdbeeren" },
  { type: "coins", amount: 25, weight: 20, emoji: "🪙", label: "25 Coins" },
  { type: "toy", weight: 10, emoji: "🎁", label: "Spielzeug" },
  { type: "strawberries", amount: 10, weight: 15, emoji: "🍓", label: "10 Erdbeeren" },
  { type: "coins", amount: 50, weight: 6, emoji: "🪙", label: "50 Coins" },
  { type: "booster", weight: 3, emoji: "🎴", label: "Booster-Pack" },
  { type: "coins", amount: 100, weight: 1, emoji: "💎", label: "Jackpot!" },
];
const WHEEL_SEGMENT_COLORS = ["#F4A6A6", "#8FC6C9", "#FFD97D", "#C79AF0", "#7FB3E0", "#F26D9B", "#A9CC8C", "#F2B84B"];

function canSpinWheel() {
  return state.wheel.lastSpin !== todayStr();
}

function renderWheelSegments() {
  const wheelEl = document.getElementById("wheelEl");
  if (!wheelEl) return;
  const n = WHEEL_PRIZES.length;
  const segAngle = 360 / n;
  const stops = WHEEL_PRIZES.map((_, i) =>
    `${WHEEL_SEGMENT_COLORS[i % WHEEL_SEGMENT_COLORS.length]} ${i * segAngle}deg ${(i + 1) * segAngle}deg`
  ).join(", ");
  wheelEl.style.background = `conic-gradient(${stops})`;
  wheelEl.innerHTML = WHEEL_PRIZES.map((p, i) => {
    const center = i * segAngle + segAngle / 2;
    return `<div class="wheel-label" style="transform:rotate(${center}deg)">
      <span style="transform:rotate(${-center}deg)">${p.emoji}</span>
    </div>`;
  }).join("");
}

function rollWheelIndex() {
  const total = WHEEL_PRIZES.reduce((sum, p) => sum + p.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < WHEEL_PRIZES.length; i++) {
    if (r < WHEEL_PRIZES[i].weight) return i;
    r -= WHEEL_PRIZES[i].weight;
  }
  return 0;
}

let wheelRotation = 0;
function spinWheelToIndex(index) {
  const wheelEl = document.getElementById("wheelEl");
  const segAngle = 360 / WHEEL_PRIZES.length;
  const center = index * segAngle + segAngle / 2;
  const currentMod = ((wheelRotation % 360) + 360) % 360;
  const delta = (((360 - center) - currentMod) % 360 + 360) % 360;
  wheelRotation += 360 * 5 + delta; // 5 zusätzliche volle Umdrehungen für den Spannungsbogen
  wheelEl.style.transform = "rotate(" + wheelRotation + "deg)";
}

function grantWheelPrize(prize) {
  if (prize.type === "coins") {
    state.coins += prize.amount;
    return prize.amount + " Coins";
  }
  if (prize.type === "strawberries") {
    addStrawberries(prize.amount);
    return prize.amount + " 🍓";
  }
  if (prize.type === "toy") {
    const missing = TOYS.filter((t) => !state.toys[t.id]);
    if (missing.length === 0) {
      state.coins += 20;
      return "20 Coins (schon alles Spielzeug!)";
    }
    const toy = missing[Math.floor(Math.random() * missing.length)];
    state.toys[toy.id] = (state.toys[toy.id] || 0) + 1;
    return toy.emoji + " " + toy.name;
  }
  if (prize.type === "booster") {
    const pack = BOOSTER_PACKS[0];
    const drawn = [];
    for (let i = 0; i < pack.cardCount; i++) {
      const card = pickRandomCard(rollCardRarity(pack.boosted));
      state.cards[card.id] = (state.cards[card.id] || 0) + 1;
      drawn.push(card);
    }
    setTimeout(() => showBoosterOpeningAnimation(pack, drawn), 600);
    return "ein Booster-Pack";
  }
  return "";
}

function spinWheel() {
  if (!canSpinWheel()) {
    showToast("🎡 Heute schon gedreht – komm morgen wieder!");
    return;
  }
  const spinBtn = document.getElementById("wheelSpinBtn");
  spinBtn.disabled = true;
  const index = rollWheelIndex();
  const prize = WHEEL_PRIZES[index];
  spinWheelToIndex(index);
  vibrate(15);

  setTimeout(() => {
    const resultLabel = grantWheelPrize(prize);
    state.wheel.lastSpin = todayStr();
    document.getElementById("wheelResultText").textContent = "🎉 Gewonnen: " + resultLabel + "!";
    spawnParticles(prize.emoji, 5);
    vibrate(30);
    renderAll();
    saveState();
    renderWheelState();
    checkAchievements();
    document.getElementById("questBtn").classList.toggle("has-badge", canClaimDailyReward() || canSpinWheel());
  }, 3000);
}

function renderWheelState() {
  const spinBtn = document.getElementById("wheelSpinBtn");
  if (!spinBtn) return;
  if (canSpinWheel()) {
    spinBtn.disabled = false;
    spinBtn.textContent = "🎡 Drehen";
  } else {
    spinBtn.disabled = true;
    spinBtn.textContent = "✅ Heute schon gedreht";
  }
}

document.getElementById("wheelSpinBtn").addEventListener("click", spinWheel);

// Erfolge: einmalige Coin-/Erdbeer-Belohnungen bei Meilensteinen.
const ACHIEVEMENTS = [
  { id: "feed1", icon: "🍓", title: "Erster Bissen", desc: "Füttere Summi einmal.", target: 1, get: (s) => s.feeds, reward: { coins: 5, strawberries: 0 } },
  { id: "feed25", icon: "🍞", title: "Vielfraß", desc: "Füttere Summi 25 Mal.", target: 25, get: (s) => s.feeds, reward: { coins: 35, strawberries: 0 } },
  { id: "wash15", icon: "🧼", title: "Sauberkeitsfan", desc: "Wasche Summi 15 Mal.", target: 15, get: (s) => s.washes, reward: { coins: 25, strawberries: 0 } },
  { id: "work10", icon: "💼", title: "Fleißige Pfoten", desc: "Schließe 10 Arbeitsschichten ab.", target: 10, get: (s) => s.worksDone, reward: { coins: 50, strawberries: 0 } },
  { id: "games10", icon: "🎮", title: "Spielefuchs", desc: "Spiele 10 Minispiel-Runden.", target: 10, get: (s) => s.gamesPlayed, reward: { coins: 40, strawberries: 0 } },
  { id: "games30", icon: "🏆", title: "Highscore-Jäger", desc: "Spiele 30 Minispiel-Runden.", target: 30, get: (s) => s.gamesPlayed, reward: { coins: 90, strawberries: 0 } },
  { id: "berries50", icon: "🍓", title: "Erdbeer-Sammler", desc: "Sammle insgesamt 50 Erdbeeren.", target: 50, get: (s) => s.strawberriesLifetime, reward: { coins: 30, strawberries: 5 } },
  { id: "toys3", icon: "🧸", title: "Spielzeug-Sammler", desc: "Besitze 3 verschiedene Spielzeuge.", target: 3, get: (s) => s.toyVariety, reward: { coins: 45, strawberries: 0 } },
  { id: "clothes3", icon: "👒", title: "Modebewusst", desc: "Besitze 3 Kleidungsstücke.", target: 3, get: (s) => s.clothesVariety, reward: { coins: 45, strawberries: 0 } },
  { id: "streak7", icon: "📅", title: "Wochentreue", desc: "Hol 7 Tage in Folge die tägliche Belohnung ab.", target: 7, get: (s) => s.streakBest, reward: { coins: 100, strawberries: 10 } },
  { id: "cards8", icon: "🎴", title: "Kartensammler", desc: "Sammle 8 verschiedene Karten.", target: 8, get: (s) => s.cardVariety, reward: { coins: 60, strawberries: 0 } },
  { id: "cardsAll", icon: "🌈", title: "Vollständiges Album", desc: "Sammle alle " + CARD_POOL.length + " Karten.", target: CARD_POOL.length, get: (s) => s.cardVariety, reward: { coins: 150, strawberries: 10 } },
];

function statsSnapshot() {
  return {
    feeds: state.stats.feeds,
    washes: state.stats.washes,
    worksDone: state.stats.worksDone,
    gamesPlayed: state.stats.gamesPlayed,
    strawberriesLifetime: state.stats.strawberriesLifetime,
    toyVariety: TOYS.filter((t) => state.toys[t.id] > 0).length,
    clothesVariety: CLOTHES.filter((c) => state.clothes[c.id] > 0).length,
    streakBest: state.dailyStreak.best,
    cardVariety: CARD_POOL.filter((c) => state.cards[c.id] > 0).length,
  };
}

let achievementUnlockQueue = [];

function checkAchievements() {
  const snap = statsSnapshot();
  let unlockedAny = false;
  for (const a of ACHIEVEMENTS) {
    if (state.achievementsClaimed[a.id]) continue;
    if (a.get(snap) >= a.target) {
      state.achievementsClaimed[a.id] = true;
      state.coins += a.reward.coins;
      addStrawberries(a.reward.strawberries);
      spawnParticles("🏅", 4);
      vibrate(30);
      unlockedAny = true;
      achievementUnlockQueue.push(a);
    }
  }
  if (unlockedAny) {
    renderAll();
    saveState();
    showNextAchievementUnlock();
  }
  renderAchievements();
}

// Zeigt Erfolge nacheinander als gut sichtbares Popup an (statt sie nur
// im schnell verschwindenden Toast zu erwähnen), auch wenn mehrere auf
// einmal freigeschaltet wurden.
function showNextAchievementUnlock() {
  const overlayEl = document.getElementById("achievementUnlockOverlay");
  if (!overlayEl.classList.contains("hidden")) return; // schon eins offen, wartet in der Queue
  const a = achievementUnlockQueue.shift();
  if (!a) return;
  document.getElementById("achievementUnlockIcon").textContent = a.icon;
  document.getElementById("achievementUnlockTitle").textContent = a.title;
  document.getElementById("achievementUnlockDesc").textContent = a.desc;
  document.getElementById("achievementUnlockReward").textContent =
    "+" + a.reward.coins + " Coins" + (a.reward.strawberries ? " +" + a.reward.strawberries + " 🍓" : "");
  overlayEl.classList.remove("hidden");
}

document.getElementById("achievementUnlockCloseBtn").addEventListener("click", () => {
  document.getElementById("achievementUnlockOverlay").classList.add("hidden");
  showNextAchievementUnlock();
});

function renderAchievements() {
  const listEl = document.getElementById("achievementList");
  if (!listEl) return;
  const snap = statsSnapshot();
  listEl.innerHTML = ACHIEVEMENTS.map((a) => {
    const done = !!state.achievementsClaimed[a.id];
    const progress = Math.min(a.target, a.get(snap));
    const pct = Math.round((progress / a.target) * 100);
    return `
      <div class="achievement-item ${done ? "done" : ""}">
        <div class="achievement-icon">${a.icon}</div>
        <div class="achievement-info">
          <div class="achievement-title">${a.title}</div>
          <div class="achievement-desc">${a.desc} (${progress}/${a.target})</div>
          <div class="achievement-progress-bar"><div class="achievement-progress-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="achievement-check">${done ? "✅" : ""}</div>
      </div>`;
  }).join("");
}

const questOverlay = document.getElementById("questOverlay");
document.getElementById("questBtn").addEventListener("click", () => {
  questOverlay.classList.remove("hidden");
  renderDailyReward();
  renderAchievements();
  renderWheelState();
});
document.getElementById("questClose").addEventListener("click", () => {
  questOverlay.classList.add("hidden");
});
document.getElementById("dailyClaimBtn").addEventListener("click", claimDailyReward);

/* ---------------------------------------------------------------------
   9) MINISPIELE
--------------------------------------------------------------------- */
const overlay = document.getElementById("gameOverlay");
const overlayPanel = document.querySelector(".overlay-panel");
const gameMenu = document.getElementById("gameMenu");
const gameScreen = document.getElementById("gameScreen");
const gameResult = document.getElementById("gameResult");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const memoryGrid = document.getElementById("memoryGrid");
const harvestGrid = document.getElementById("harvestGrid");
const chaseArea = document.getElementById("chaseArea");
const chaseTarget = document.getElementById("chaseTarget");
const simonGrid = document.getElementById("simonGrid");
const balloonArea = document.getElementById("balloonArea");
const gameTitleEl = document.getElementById("gameTitle");
const gameScoreEl = document.getElementById("gameScore");
const gameTimerEl = document.getElementById("gameTimer");
const gameHintEl = document.getElementById("gameHint");

let rafId = null;
let lastFrameTime = 0;
let runtime = { elapsed: 0, score: 0, running: false };
let currentGameKey = null;

// ---- Gemeinsamer Ablauf ----
function openGameOverlay() {
  if (actionsBlocked()) return;
  if (state.isTorn) return showToast("🪡 Erst die Naht flicken, dann kann Summi wieder spielen!");
  if (state.isSick) return showToast("🤒 Summi ist krank – erst Medizin geben!");
  registerInteraction();
  overlay.classList.remove("hidden");
  showMenu();
}

function closeGameOverlay() {
  stopGameLoop();
  stopHarvestGame();
  stopChaseGame();
  stopSimonGame();
  stopBalloonGame();
  overlayPanel.classList.remove("no-scroll");
  overlay.classList.add("hidden");
  // War Summi ohnmächtig und hat währenddessen Erdbeeren im Minispiel
  // gesammelt, zurück zum Ohnmacht-Screen (der Wiederbeleben-Button ist
  // jetzt evtl. schon freigeschaltet).
  if (state.isDead) el.deathOverlay.classList.remove("hidden");
}

// Erlaubt das Spielen von Minispielen, während Summi ohnmächtig ist -
// sonst gäbe es keinen Weg mehr, die zum Wiederbeleben nötigen 🍓
// Erdbeeren zu verdienen (die Minispiele geben bei jedem Ergebnis welche).
function openGameOverlayFromDeath() {
  el.deathOverlay.classList.add("hidden");
  overlay.classList.remove("hidden");
  showMenu();
}
document.getElementById("deathPlayBtn").addEventListener("click", openGameOverlayFromDeath);

function showMenu() {
  stopGameLoop();
  stopHarvestGame();
  stopChaseGame();
  stopSimonGame();
  stopBalloonGame();
  overlayPanel.classList.remove("no-scroll");
  gameMenu.classList.remove("hidden");
  gameScreen.classList.add("hidden");
  gameResult.classList.add("hidden");
  renderToyMenu();
}

function startGame(key) {
  // Vorherigen Loop IMMER zuerst stoppen, sonst können sich bei schnellem
  // Doppel-Tippen mehrere Spiel-Loops überlagern und alles blockieren.
  stopGameLoop();

  currentGameKey = key;
  gameMenu.classList.add("hidden");
  gameResult.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  overlayPanel.classList.add("no-scroll"); // verhindert iOS-Scroll-Bug über dem Canvas
  document.getElementById("debugLine").textContent = ""; // alte Debug-Zeile nicht ins neue Spiel mitschleppen

  if (key === "figures") {
    canvas.classList.add("hidden");
    memoryGrid.classList.remove("hidden");
    harvestGrid.classList.add("hidden");
    chaseArea.classList.add("hidden");
    simonGrid.classList.add("hidden");
    balloonArea.classList.add("hidden");
    jumpBtn.classList.add("hidden");
    gasBtn.classList.add("hidden");
    gameTitleEl.textContent = "🧸 Figuren-Memory";
    gameHintEl.textContent = "Finde die passenden Spielzeug-Paare!";
    startMemoryGame();
    return;
  }

  if (key === "harvest") {
    canvas.classList.add("hidden");
    memoryGrid.classList.add("hidden");
    harvestGrid.classList.remove("hidden");
    chaseArea.classList.add("hidden");
    simonGrid.classList.add("hidden");
    balloonArea.classList.add("hidden");
    jumpBtn.classList.add("hidden");
    gasBtn.classList.add("hidden");
    gameTitleEl.textContent = "🍓 Erdbeer-Ernte";
    gameHintEl.textContent = "Tippe die auftauchenden Erdbeeren schnell an!";
    startHarvestGame();
    return;
  }

  if (key === "chase") {
    canvas.classList.add("hidden");
    memoryGrid.classList.add("hidden");
    harvestGrid.classList.add("hidden");
    chaseArea.classList.remove("hidden");
    simonGrid.classList.add("hidden");
    balloonArea.classList.add("hidden");
    jumpBtn.classList.add("hidden");
    gasBtn.classList.add("hidden");
    gameTitleEl.textContent = "🍓 Erdbeer-Jagd";
    gameHintEl.textContent = "Fang die wild hüpfende Erdbeere so oft wie möglich!";
    startChaseGame();
    return;
  }

  if (key === "simon") {
    canvas.classList.add("hidden");
    memoryGrid.classList.add("hidden");
    harvestGrid.classList.add("hidden");
    chaseArea.classList.add("hidden");
    simonGrid.classList.remove("hidden");
    balloonArea.classList.add("hidden");
    jumpBtn.classList.add("hidden");
    gasBtn.classList.add("hidden");
    gameTitleEl.textContent = "🎵 Melodie-Merker";
    gameHintEl.textContent = "Schau genau hin und tippe die Reihenfolge nach!";
    startSimonGame();
    return;
  }

  if (key === "balloon") {
    canvas.classList.add("hidden");
    memoryGrid.classList.add("hidden");
    harvestGrid.classList.add("hidden");
    chaseArea.classList.add("hidden");
    simonGrid.classList.add("hidden");
    balloonArea.classList.remove("hidden");
    jumpBtn.classList.add("hidden");
    gasBtn.classList.add("hidden");
    gameTitleEl.textContent = "🎈 Ballon-Fang";
    gameHintEl.textContent = "Tippe die Ballons an, bevor sie wegfliegen – meide die Bienen! 🐝";
    startBalloonGame();
    return;
  }

  memoryGrid.classList.add("hidden");
  harvestGrid.classList.add("hidden");
  chaseArea.classList.add("hidden");
  simonGrid.classList.add("hidden");
  balloonArea.classList.add("hidden");
  canvas.classList.remove("hidden");
  jumpBtn.classList.toggle("hidden", key !== "runner");
  gasBtn.classList.toggle("hidden", key !== "car");

  const game = GAMES[key];
  gameTitleEl.textContent = game.title;
  gameHintEl.textContent = game.hint;
  runtime = { elapsed: 0, score: 0, running: true, gameOver: false };
  lastHudScore = 0;
  frameCount = 0;
  game.init();
  updateHud(game);

  lastFrameTime = performance.now();
  rafId = requestAnimationFrame(loop);
}

let lastHudScore = 0;
function updateHud(game) {
  if (runtime.score > lastHudScore) {
    // kleiner visueller "Punkt bekommen!"-Puls, macht Erfolg sofort sichtbar
    gameScoreEl.classList.remove("pulse");
    void gameScoreEl.offsetWidth; // Reflow erzwingen, damit die Animation neu startet
    gameScoreEl.classList.add("pulse");
  }
  lastHudScore = runtime.score;

  gameScoreEl.textContent = "Punkte: " + runtime.score;
  if (game.timeLimit) {
    const remaining = Math.max(0, Math.ceil(game.timeLimit - runtime.elapsed));
    gameTimerEl.textContent = "⏱ " + remaining;
  } else {
    gameTimerEl.textContent = "";
  }
}

let frameCount = 0;
function loop(now) {
  if (!runtime.running) return;
  const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;
  const game = GAMES[currentGameKey];

  try {
    frameCount++;
    runtime.elapsed += dt;
    game.update(dt);
    game.draw(ctx);
    updateHud(game);
    updateDebugLine(game);

    const timeUp = game.timeLimit && runtime.elapsed >= game.timeLimit;
    if (timeUp || runtime.gameOver) {
      finishGame(game);
      return;
    }
    rafId = requestAnimationFrame(loop);
  } catch (err) {
    // Falls doch mal etwas schiefgeht, Fehler sichtbar machen UND Spiel
    // sauber beenden statt "einfrieren".
    console.error("Minispiel-Fehler:", err);
    showFatalToast("Minispiel-Fehler: " + err.message);
    stopGameLoop();
    showMenu();
  }
}

// Temporäre Diagnose-Anzeige: zeigt live, ob der Spiel-Loop wirklich läuft
// und wie viele Objekte gerade auf dem Feld sind.
function updateDebugLine(game) {
  const line = document.getElementById("debugLine");
  if (!line) return;
  let objectCount = "-";
  if (currentGameKey === "car") objectCount = game.coins.length;
  if (currentGameKey === "runner") objectCount = game.obstacles.length;
  line.textContent =
    "Debug: Frame " + frameCount + " | Objekte: " + objectCount + " | " + BUILD_ID;
}

function stopGameLoop() {
  runtime.running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

// ===== GESTAFFELTE MINISPIEL-BELOHNUNGEN =====
// Je besser der Score (ratio 0-1, aus dem jeweiligen Spaß-Gewinn abgeleitet),
// desto höher die Gewichtung für die besseren Tiers. Trotzdem bleibt es
// zufällig (kein garantiertes Ergebnis) – nur die Chancen verschieben sich.
const REWARD_TIERS = [
  { name: "low", min: 1, max: 3 },
  { name: "medium", min: 4, max: 8 },
  { name: "high", min: 9, max: 18 },
];

function rollBonusCoins(scoreRatio) {
  const weights =
    scoreRatio < 0.4
      ? [70, 25, 5]
      : scoreRatio < 0.7
      ? [30, 50, 20]
      : [10, 35, 55];
  const total = weights[0] + weights[1] + weights[2];
  let r = Math.random() * total;
  for (let i = 0; i < REWARD_TIERS.length; i++) {
    if (r < weights[i]) {
      const tier = REWARD_TIERS[i];
      return Math.floor(tier.min + Math.random() * (tier.max - tier.min + 1));
    }
    r -= weights[i];
  }
  return REWARD_TIERS[0].min;
}

function showResult(scoreText, funGain, strawberryGain = 0) {
  state.fun = clamp(state.fun + funGain);
  state.love = clamp(state.love + 4);
  addStrawberries(strawberryGain);
  addCarePoints(CARE_POINTS.play);
  state.stats.gamesPlayed++;

  // Gestaffelter Coin-Bonus abhängig vom Abschneiden im Minispiel
  const scoreRatio = Math.min(1, funGain / 30);
  const bonusCoins = rollBonusCoins(scoreRatio);
  state.coins += bonusCoins;

  vibrate(25);
  registerInteraction(true); // müde vom Spielen -> schläft bald ein
  renderAll();
  saveState();
  checkAchievements();

  document.getElementById("resultScore").textContent = scoreText;
  document.getElementById("resultFun").textContent =
    "Spaß +" +
    funGain +
    " 💗 Liebe +4" +
    (strawberryGain ? " 🍓 +" + strawberryGain : "") +
    " · +" + bonusCoins + " Coins";

  overlayPanel.classList.remove("no-scroll");
  gameScreen.classList.add("hidden");
  gameResult.classList.remove("hidden");
}

function finishGame(game) {
  stopGameLoop();
  const funGain = game.rewardFromScore(runtime.score);
  const strawberryGain = Math.min(6, 2 + Math.floor(runtime.score / 4));
  showResult("Punkte: " + runtime.score, funGain, strawberryGain);
}

// Tippen/Klicken auf dem Canvas: pointerdown UND touchstart als Rückfallebene,
// da manche mobilen Browser Pointer Events in eingebetteten/scrollbaren
// Containern nicht zuverlässig auslösen.
function handleCanvasTap(clientX, clientY) {
  if (!runtime.running) return;
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * canvas.width;
  const y = ((clientY - rect.top) / rect.height) * canvas.height;
  GAMES[currentGameKey].onPointerDown(x, y);
}

// Verhindert, dass ein Tap sowohl über "touchstart" als auch über das
// danach ausgelöste "pointerdown" doppelt gezählt wird.
let lastTapTime = 0;
function handleCanvasTapDeduped(clientX, clientY) {
  const now = performance.now();
  if (now - lastTapTime < 50) return; // gleicher Tap (Touch+Pointer), schon verarbeitet
  lastTapTime = now;
  handleCanvasTap(clientX, clientY);
}

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  handleCanvasTapDeduped(e.clientX, e.clientY);
});

canvas.addEventListener(
  "touchstart",
  (e) => {
    if (!e.touches || e.touches.length === 0) return;
    e.preventDefault();
    const t = e.touches[0];
    handleCanvasTapDeduped(t.clientX, t.clientY);
  },
  { passive: false }
);

// Eigener, großer Sprung-Button für den Hüpf-Lauf (zusätzlich zu Tippen/Leertaste)
const jumpBtn = document.getElementById("jumpBtn");
function triggerJump(e) {
  e.preventDefault();
  if (runtime.running && currentGameKey === "runner") GAMES.runner.jump();
}
jumpBtn.addEventListener("pointerdown", triggerJump);
jumpBtn.addEventListener("touchstart", triggerJump, { passive: false });

// Gas-Button für die Hügel-Fahrt: Gas geben beim Drücken, loslassen beim Loslassen
const gasBtn = document.getElementById("gasBtn");
function setCarGas(on, e) {
  if (e) e.preventDefault();
  if (currentGameKey === "car") GAMES.car.setGas(on);
}
gasBtn.addEventListener("pointerdown", (e) => setCarGas(true, e));
gasBtn.addEventListener("pointerup", (e) => setCarGas(false, e));
gasBtn.addEventListener("pointerleave", (e) => setCarGas(false, e));
gasBtn.addEventListener("touchstart", (e) => setCarGas(true, e), { passive: false });
gasBtn.addEventListener("touchend", (e) => setCarGas(false, e), { passive: false });
gasBtn.addEventListener("touchcancel", (e) => setCarGas(false, e), { passive: false });

window.addEventListener("keydown", (e) => {
  if (!runtime.running) return;
  if (e.code === "Space" && currentGameKey === "runner") {
    e.preventDefault();
    GAMES.runner.jump();
  }
});

/* ---- Spiel 1: Hügel-Fahrt (Hill-Climb-Racing-Stil) ---- */
// Bewusst EINFACH gehalten: nur ein großer Gas-Knopf, keine präzisen Klicks
// auf kleine, schnelle Ziele nötig (das war die Fehlerquelle der alten Spiele).
const carGame = {
  title: "🚗 Hügel-Fahrt",
  hint: "Halte Gas gedrückt, sammle Erdbeeren & schnapp dir Honig-Boosts!",
  timeLimit: 25,
  groundY: 330,
  worldX: 0,
  speed: 0,
  accelerating: false,
  boostTimer: 0,
  coins: [],
  honeys: [],
  clouds: [],
  nextCoinAt: 0,
  nextHoneyAt: 0,
  init() {
    this.worldX = 0;
    this.speed = 0;
    this.accelerating = false;
    this.boostTimer = 0;
    this.coins = [];
    this.honeys = [];
    this.nextCoinAt = 250;
    this.nextHoneyAt = 650;
    // Wolken für etwas Abwechslung im Hintergrund (rein dekorativ)
    this.clouds = Array.from({ length: 5 }, (_, i) => ({
      x: i * 180 + Math.random() * 80,
      y: 40 + Math.random() * 90,
      scale: 0.7 + Math.random() * 0.6,
    }));
  },
  // Hügel-Höhe an einer Weltposition (deterministisch, kein Speicher nötig)
  terrainHeight(x) {
    return (
      Math.sin(x / 140) * 34 +
      Math.sin(x / 55 + 1.3) * 14 +
      Math.sin(x / 300) * 20
    );
  },
  setGas(on) {
    this.accelerating = on;
  },
  update(dt) {
    // Honig-Boost aktiv: kurzzeitig deutlich schneller, unabhängig vom Gas geben
    if (this.boostTimer > 0) {
      this.boostTimer -= dt;
      this.speed = 320;
    } else if (this.accelerating) {
      this.speed = Math.min(210, this.speed + 220 * dt);
    } else {
      this.speed = Math.max(40, this.speed - 160 * dt);
    }
    this.worldX += this.speed * dt;

    // Neue Erdbeeren am Streckenrand erzeugen
    while (this.nextCoinAt < this.worldX + 500) {
      this.coins.push({ x: this.nextCoinAt, collected: false });
      this.nextCoinAt += 220 + Math.random() * 160;
    }
    // Seltener: Honigtöpfe für den Speed-Boost
    while (this.nextHoneyAt < this.worldX + 500) {
      this.honeys.push({ x: this.nextHoneyAt, collected: false });
      this.nextHoneyAt += 500 + Math.random() * 350;
    }

    const carWorldX = this.worldX + 80;
    for (const coin of this.coins) {
      if (!coin.collected && Math.abs(coin.x - carWorldX) < 22) {
        coin.collected = true;
        runtime.score++;
      }
    }
    for (const honey of this.honeys) {
      if (!honey.collected && Math.abs(honey.x - carWorldX) < 24) {
        honey.collected = true;
        this.boostTimer = 2.2;
        showToast("🍯 Honig-Boost! Zoooom!");
      }
    }
    this.coins = this.coins.filter((c) => c.x > this.worldX - 40);
    this.honeys = this.honeys.filter((h) => h.x > this.worldX - 40);

    // Wolken langsam nach links driften lassen (Parallax), am rechten Rand neu einsetzen
    for (const cloud of this.clouds) {
      cloud.x -= this.speed * 0.15 * dt;
      if (cloud.x < -60) cloud.x = canvas.width + Math.random() * 60;
    }
  },
  draw(c) {
    c.clearRect(0, 0, canvas.width, canvas.height);
    drawSky(c);

    // Wolken (Hintergrund-Dekoration)
    c.fillStyle = "rgba(255,255,255,0.8)";
    for (const cloud of this.clouds) {
      c.beginPath();
      c.ellipse(cloud.x, cloud.y, 22 * cloud.scale, 13 * cloud.scale, 0, 0, Math.PI * 2);
      c.ellipse(cloud.x + 18 * cloud.scale, cloud.y + 4, 16 * cloud.scale, 10 * cloud.scale, 0, 0, Math.PI * 2);
      c.ellipse(cloud.x - 16 * cloud.scale, cloud.y + 5, 14 * cloud.scale, 9 * cloud.scale, 0, 0, Math.PI * 2);
      c.fill();
    }

    // Boden als Streckenzug zeichnen
    c.beginPath();
    c.moveTo(0, canvas.height);
    for (let sx = 0; sx <= canvas.width; sx += 8) {
      const worldPos = this.worldX + sx;
      c.lineTo(sx, this.groundY - this.terrainHeight(worldPos));
    }
    c.lineTo(canvas.width, canvas.height);
    c.closePath();
    c.fillStyle = "#CDE8B5";
    c.fill();
    c.strokeStyle = "#A9CC8C";
    c.lineWidth = 3;
    c.stroke();

    // Erdbeeren & Honigtöpfe
    c.font = "26px \"Apple Color Emoji\",\"Segoe UI Emoji\",\"Noto Color Emoji\",serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    for (const coin of this.coins) {
      if (coin.collected) continue;
      c.fillText("🍓", coin.x - this.worldX, this.groundY - this.terrainHeight(coin.x) - 30);
    }
    for (const honey of this.honeys) {
      if (honey.collected) continue;
      c.fillText("🍯", honey.x - this.worldX, this.groundY - this.terrainHeight(honey.x) - 30);
    }

    // Boost-Effekt: kleine Tempolinien hinter dem Auto
    if (this.boostTimer > 0) {
      c.strokeStyle = "rgba(242,184,75,0.8)";
      c.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const ly = this.groundY - this.terrainHeight(this.worldX + 80) - 10 - i * 8;
        c.beginPath();
        c.moveTo(30, ly);
        c.lineTo(55, ly);
        c.stroke();
      }
    }

    // Auto (an fester Bildschirmposition, Welt scrollt darunter durch)
    const carScreenX = 80;
    const carWorldX = this.worldX + carScreenX;
    const groundHereY = this.groundY - this.terrainHeight(carWorldX);
    const slope =
      this.terrainHeight(carWorldX + 10) - this.terrainHeight(carWorldX - 10);
    const angle = Math.atan2(-slope, 20);

    c.save();
    c.translate(carScreenX, groundHereY - 16);
    c.rotate(angle);
    c.scale(-1, 1); // Auto-Emoji zeigt von Haus aus nach links -> spiegeln, damit es nach RECHTS (Fahrtrichtung) schaut
    c.font = "38px \"Apple Color Emoji\",\"Segoe UI Emoji\",\"Noto Color Emoji\",serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("🚗", 0, 0);
    c.restore();
  },
  onPointerDown() {
    this.setGas(true);
  },
  rewardFromScore(score) {
    return Math.min(30, 8 + score * 2);
  },
};

/* ---- Spiel 3: Hüpf-Lauf (Endless Runner) ---- */
const runnerGame = {
  title: "🏃 Hüpf-Lauf",
  hint: "Drück den Sprung-Button (oder tippe/Leertaste), um zu springen!",
  timeLimit: null, // endet bei Kollision
  groundY: 360,
  bear: { x: 60, y: 0, vy: 0, size: 34, onGround: true },
  obstacles: [],
  spawnTimer: 0,
  speed: 160,
  init() {
    this.bear = { x: 60, y: this.groundY - 34, vy: 0, size: 34, onGround: true };
    this.obstacles = [];
    this.spawnTimer = 1.2;
    this.speed = 160;
    runtime.gameOver = false;
  },
  jump() {
    if (this.bear.onGround) {
      this.bear.vy = -420;
      this.bear.onGround = false;
    }
  },
  onPointerDown() {
    this.jump();
  },
  update(dt) {
    this.speed = 160 + runtime.elapsed * 6;

    // Bär-Physik
    this.bear.vy += 1100 * dt; // Schwerkraft
    this.bear.y += this.bear.vy * dt;
    const floor = this.groundY - this.bear.size;
    if (this.bear.y >= floor) {
      this.bear.y = floor;
      this.bear.vy = 0;
      this.bear.onGround = true;
    }

    // Hindernisse
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = Math.max(0.7, 1.6 - runtime.elapsed / 25);
      this.obstacles.push({
        x: canvas.width + 20,
        w: 26,
        h: 30 + Math.random() * 20,
      });
    }
    for (const o of this.obstacles) o.x -= this.speed * dt;
    this.obstacles = this.obstacles.filter((o) => o.x > -40);

    // Kollision (einfache Box-Prüfung)
    for (const o of this.obstacles) {
      const bearBox = {
        left: this.bear.x - this.bear.size / 2,
        right: this.bear.x + this.bear.size / 2,
        top: this.bear.y,
        bottom: this.bear.y + this.bear.size,
      };
      const obsBox = {
        left: o.x,
        right: o.x + o.w,
        top: this.groundY - o.h,
        bottom: this.groundY,
      };
      const overlap =
        bearBox.right > obsBox.left &&
        bearBox.left < obsBox.right &&
        bearBox.bottom > obsBox.top &&
        bearBox.top < obsBox.bottom;
      if (overlap) runtime.gameOver = true;
    }

    runtime.score = Math.floor(runtime.elapsed * 10);
  },
  draw(c) {
    c.clearRect(0, 0, canvas.width, canvas.height);
    drawSky(c);
    // Boden
    c.fillStyle = "#CDE8B5";
    c.fillRect(0, this.groundY, canvas.width, canvas.height - this.groundY);
    c.strokeStyle = "#A9CC8C";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, this.groundY);
    c.lineTo(canvas.width, this.groundY);
    c.stroke();

    // Hindernisse
    c.font = "30px \"Apple Color Emoji\",\"Segoe UI Emoji\",\"Noto Color Emoji\",serif";
    c.textAlign = "center";
    c.textBaseline = "bottom";
    for (const o of this.obstacles) {
      c.fillText("🌵", o.x + o.w / 2, this.groundY + 6);
    }

    // Bär
    c.font = this.bear.size * 1.5 + "px \"Apple Color Emoji\",\"Segoe UI Emoji\",\"Noto Color Emoji\",serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("🧸", this.bear.x, this.bear.y + this.bear.size / 2);
  },
  rewardFromScore(score) {
    return Math.min(30, Math.round(score / 3));
  },
};

const GAMES = { car: carGame, runner: runnerGame };

/* ---- Spiel 7: Ballon-Fang (DOM-basiert, keine Canvas-Emoji) ----
   Emoji-Zeichen über Canvas fillText() werden auf manchen Android-Handys
   nur als Strich/Platzhalter statt als farbiges Bild dargestellt (der
   System-Font wird von der Canvas-Textausgabe nicht immer sauber
   gefunden). Ganz normale HTML-Buttons wie bei der Erdbeer-Jagd
   funktionieren dagegen überall zuverlässig, deshalb ist dieses Spiel
   – wie Erdbeer-Ernte/-Jagd – bewusst OHNE Canvas gebaut. */
const BALLOON_DURATION = 22; // Sekunden
const BALLOON_RISE_MIN = 3.4; // Sekunden, die ein Ballon fürs Hochsteigen braucht
const BALLOON_RISE_MAX = 5.5;
let balloonState = null;
let balloonSpawnTimeout = null;
let balloonTimerInterval = null;
let balloonRafId = null;
let balloonNextId = 0;

function startBalloonGame() {
  balloonState = { balloons: [], score: 0, timeLeft: BALLOON_DURATION };
  gameScoreEl.textContent = "Punkte: 0";
  gameTimerEl.textContent = "⏱ " + BALLOON_DURATION;
  document.getElementById("balloonArea").innerHTML = "";
  scheduleBalloonSpawn();

  clearInterval(balloonTimerInterval);
  balloonTimerInterval = setInterval(() => {
    if (!balloonState) return;
    balloonState.timeLeft -= 1;
    gameTimerEl.textContent = "⏱ " + Math.max(0, balloonState.timeLeft);
    if (balloonState.timeLeft <= 0) finishBalloonGame();
  }, 1000);

  let lastFrame = performance.now();
  const step = (now) => {
    if (!balloonState) return;
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    updateBalloonPositions(dt);
    balloonRafId = requestAnimationFrame(step);
  };
  balloonRafId = requestAnimationFrame(step);
}

function scheduleBalloonSpawn() {
  clearTimeout(balloonSpawnTimeout);
  if (!balloonState) return;
  balloonSpawnTimeout = setTimeout(() => {
    spawnBalloon();
    scheduleBalloonSpawn();
  }, 550 + Math.random() * 400);
}

function spawnBalloon() {
  if (!balloonState) return;
  const isBee = Math.random() < 0.22;
  const id = balloonNextId++;
  const riseDuration = BALLOON_RISE_MIN + Math.random() * (BALLOON_RISE_MAX - BALLOON_RISE_MIN);
  const balloon = {
    id,
    isBee,
    leftPct: 10 + Math.random() * 80,
    topPct: 108, // startet knapp unterhalb des sichtbaren Feldes
    riseDuration,
    elapsed: 0,
    popped: false,
  };
  balloonState.balloons.push(balloon);

  const btn = document.createElement("button");
  btn.className = "balloon-item";
  btn.textContent = isBee ? "🐝" : "🎈";
  btn.style.left = balloon.leftPct + "%";
  btn.style.top = balloon.topPct + "%";
  btn.dataset.id = id;
  btn.addEventListener("click", () => popBalloon(id));
  document.getElementById("balloonArea").appendChild(btn);
  balloon.el = btn;
}

function updateBalloonPositions(dt) {
  if (!balloonState) return;
  for (const b of balloonState.balloons) {
    if (b.popped) continue;
    b.elapsed += dt;
    b.topPct = 108 - (b.elapsed / b.riseDuration) * 128; // steigt bis über den oberen Rand
    b.el.style.top = b.topPct + "%";
    if (b.topPct < -20) {
      b.popped = true; // oben rausgeflogen, ohne Strafe einfach entfernen
      b.el.remove();
    }
  }
  balloonState.balloons = balloonState.balloons.filter((b) => !b.popped);
}

function popBalloon(id) {
  if (!balloonState) return;
  const b = balloonState.balloons.find((x) => x.id === id);
  if (!b || b.popped) return;
  b.popped = true;
  b.el.classList.add("popped");
  vibrate(b.isBee ? 20 : 10);
  if (b.isBee) {
    balloonState.score = Math.max(0, balloonState.score - 2);
    showToast("🐝 Autsch, das war eine Biene!");
  } else {
    balloonState.score++;
  }
  gameScoreEl.classList.remove("pulse");
  void gameScoreEl.offsetWidth;
  gameScoreEl.classList.add("pulse");
  gameScoreEl.textContent = "Punkte: " + balloonState.score;
  setTimeout(() => {
    b.el.remove();
    // Spiel könnte in der Zwischenzeit geschlossen worden sein (stopBalloonGame
    // setzt balloonState dann auf null) - in dem Fall nichts mehr tun.
    if (balloonState) balloonState.balloons = balloonState.balloons.filter((x) => x.id !== id);
  }, 260);
}

function finishBalloonGame() {
  clearInterval(balloonTimerInterval);
  clearTimeout(balloonSpawnTimeout);
  if (balloonRafId) cancelAnimationFrame(balloonRafId);
  balloonRafId = null;
  const score = balloonState ? balloonState.score : 0;
  balloonState = null;
  document.getElementById("balloonArea").innerHTML = "";
  const funGain = Math.min(30, Math.max(0, score * 2));
  showResult("Punkte: " + score, funGain, 0);
}

function stopBalloonGame() {
  clearInterval(balloonTimerInterval);
  clearTimeout(balloonSpawnTimeout);
  if (balloonRafId) cancelAnimationFrame(balloonRafId);
  balloonRafId = null;
  balloonState = null;
  document.getElementById("balloonArea").innerHTML = "";
}

/* ---- Spiel 4: Figuren-Memory (generische Spielzeug-Icons, keine Marken) ---- */
const MEMORY_ICONS = ["🚀", "🤠", "🐷", "🐮", "🐔", "🚂"];
let memoryState = null;

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function startMemoryGame() {
  const icons = shuffleArray([...MEMORY_ICONS, ...MEMORY_ICONS]);
  memoryState = {
    cards: icons.map((icon, i) => ({ id: i, icon, flipped: false, matched: false })),
    flippedIds: [],
    moves: 0,
    matchedPairs: 0,
    locked: false,
  };
  gameScoreEl.textContent = "Paare: 0/" + MEMORY_ICONS.length;
  gameTimerEl.textContent = "Züge: 0";
  renderMemoryGrid();
}

function renderMemoryGrid() {
  memoryGrid.innerHTML = memoryState.cards
    .map((c) => {
      const shown = c.flipped || c.matched;
      return `<button class="memory-card ${shown ? "flipped" : ""} ${
        c.matched ? "matched" : ""
      }" data-id="${c.id}" aria-label="Karte">${shown ? c.icon : "🐾"}</button>`;
    })
    .join("");

  memoryGrid.querySelectorAll(".memory-card").forEach((btn) => {
    btn.addEventListener("click", () => flipMemoryCard(parseInt(btn.dataset.id, 10)));
  });
}

function flipMemoryCard(id) {
  if (memoryState.locked) return;
  const card = memoryState.cards.find((c) => c.id === id);
  if (!card || card.flipped || card.matched) return;

  card.flipped = true;
  memoryState.flippedIds.push(id);
  renderMemoryGrid();

  if (memoryState.flippedIds.length < 2) return;

  memoryState.moves++;
  memoryState.locked = true;
  gameTimerEl.textContent = "Züge: " + memoryState.moves;

  const [id1, id2] = memoryState.flippedIds;
  const c1 = memoryState.cards.find((c) => c.id === id1);
  const c2 = memoryState.cards.find((c) => c.id === id2);

  if (c1.icon === c2.icon) {
    c1.matched = true;
    c2.matched = true;
    memoryState.matchedPairs++;
    memoryState.flippedIds = [];
    memoryState.locked = false;
    gameScoreEl.textContent = "Paare: " + memoryState.matchedPairs + "/" + MEMORY_ICONS.length;
    renderMemoryGrid();

    if (memoryState.matchedPairs === MEMORY_ICONS.length) {
      const funGain = Math.max(10, Math.min(30, 30 - Math.max(0, memoryState.moves - 6) * 2));
      setTimeout(
        () =>
          showResult(
            "Geschafft in " + memoryState.moves + " Zügen! 🎉",
            funGain,
            4
          ),
        450
      );
    }
  } else {
    setTimeout(() => {
      c1.flipped = false;
      c2.flipped = false;
      memoryState.flippedIds = [];
      memoryState.locked = false;
      renderMemoryGrid();
    }, 700);
  }
}

/* ---- Spiel 5: Erdbeer-Ernte (Whack-a-Mole-Stil, rein DOM-basiert) ---- */
// Bewusst OHNE Canvas gebaut, wie das Memory-Spiel: einfache, große
// Tap-Ziele mit normalen "click"-Events, keine Koordinaten-Umrechnung nötig.
const HARVEST_HOLE_COUNT = 9;
const HARVEST_DURATION = 20; // Sekunden
let harvestState = null;
let harvestSpawnTimeout = null;
let harvestTimerInterval = null;

function startHarvestGame() {
  harvestState = {
    holes: Array.from({ length: HARVEST_HOLE_COUNT }, () => ({ active: false })),
    score: 0,
    timeLeft: HARVEST_DURATION,
  };
  gameScoreEl.textContent = "Punkte: 0";
  gameTimerEl.textContent = "⏱ " + HARVEST_DURATION;
  renderHarvestGrid();
  scheduleHarvestSpawn();

  clearInterval(harvestTimerInterval);
  harvestTimerInterval = setInterval(() => {
    if (!harvestState) return;
    harvestState.timeLeft -= 1;
    gameTimerEl.textContent = "⏱ " + Math.max(0, harvestState.timeLeft);
    if (harvestState.timeLeft <= 0) finishHarvestGame();
  }, 1000);
}

function scheduleHarvestSpawn() {
  clearTimeout(harvestSpawnTimeout);
  if (!harvestState) return;
  harvestSpawnTimeout = setTimeout(() => {
    if (!harvestState) return;
    const freeHoles = harvestState.holes
      .map((h, i) => (h.active ? -1 : i))
      .filter((i) => i !== -1);
    if (freeHoles.length > 0) {
      const idx = freeHoles[Math.floor(Math.random() * freeHoles.length)];
      harvestState.holes[idx].active = true;
      renderHarvestGrid();
      // Erdbeere verschwindet von selbst, wenn sie nicht rechtzeitig getippt wird
      setTimeout(() => {
        if (harvestState && harvestState.holes[idx].active) {
          harvestState.holes[idx].active = false;
          renderHarvestGrid();
        }
      }, 900);
    }
    scheduleHarvestSpawn();
  }, 500 + Math.random() * 350);
}

function renderHarvestGrid() {
  harvestGrid.innerHTML = harvestState.holes
    .map(
      (h, i) =>
        `<button class="harvest-hole ${h.active ? "active" : ""}" data-id="${i}">${
          h.active ? "🍓" : ""
        }</button>`
    )
    .join("");
  harvestGrid.querySelectorAll(".harvest-hole").forEach((btn) => {
    btn.addEventListener("click", () => tapHarvestHole(parseInt(btn.dataset.id, 10)));
  });
}

function tapHarvestHole(id) {
  if (!harvestState || !harvestState.holes[id].active) return;
  harvestState.holes[id].active = false;
  harvestState.score++;
  gameScoreEl.classList.remove("pulse");
  void gameScoreEl.offsetWidth;
  gameScoreEl.classList.add("pulse");
  gameScoreEl.textContent = "Punkte: " + harvestState.score;
  renderHarvestGrid();
}

function finishHarvestGame() {
  clearInterval(harvestTimerInterval);
  clearTimeout(harvestSpawnTimeout);
  const score = harvestState ? harvestState.score : 0;
  harvestState = null;
  const funGain = Math.min(30, Math.round(score * 1.5));
  const strawberryGain = Math.min(6, 2 + Math.floor(score / 3));
  showResult("Punkte: " + score, funGain, strawberryGain);
}

// Räumt alle laufenden Timer des Ernte-Spiels auf (z. B. wenn man vorzeitig
// über das ✕ oder "Zurück" aussteigt), damit nichts unsichtbar weiterläuft.
function stopHarvestGame() {
  clearInterval(harvestTimerInterval);
  clearTimeout(harvestSpawnTimeout);
  harvestState = null;
}

/* ---- Spiel 6: Erdbeer-Jagd (wild hüpfende Erdbeere, DOM-basiert) ---- */
// Ebenfalls bewusst ohne Canvas gebaut: ein einzelnes Ziel, springt zufällig
// im Feld herum. Jeder Treffer gibt SOFORT +1 Erdbeere fürs Inventar.
const CHASE_DURATION = 10; // Sekunden
let chaseState = null;
let chaseMoveTimeout = null;
let chaseTimerInterval = null;

function startChaseGame() {
  chaseState = { timeLeft: CHASE_DURATION, score: 0 };
  gameScoreEl.textContent = "🍓 gefangen: 0";
  gameTimerEl.textContent = "⏱ " + CHASE_DURATION;
  moveChaseTarget();

  clearInterval(chaseTimerInterval);
  chaseTimerInterval = setInterval(() => {
    if (!chaseState) return;
    chaseState.timeLeft -= 1;
    gameTimerEl.textContent = "⏱ " + Math.max(0, chaseState.timeLeft);
    if (chaseState.timeLeft <= 0) finishChaseGame();
  }, 1000);
}

function moveChaseTarget() {
  clearTimeout(chaseMoveTimeout);
  if (!chaseState) return;
  const top = 8 + Math.random() * 74; // % - bleibt innerhalb des sichtbaren Feldes
  const left = 8 + Math.random() * 74;
  chaseTarget.style.top = top + "%";
  chaseTarget.style.left = left + "%";
  chaseMoveTimeout = setTimeout(moveChaseTarget, 550 + Math.random() * 300);
}

function tapChaseTarget() {
  if (!chaseState) return;
  chaseState.score++;
  addStrawberries(1); // sofort im Erdbeer-Inventar gutschreiben
  vibrate(10);
  gameScoreEl.classList.remove("pulse");
  void gameScoreEl.offsetWidth;
  gameScoreEl.classList.add("pulse");
  gameScoreEl.textContent = "🍓 gefangen: " + chaseState.score;
  renderAll();
  saveState();
  moveChaseTarget(); // sofort neu springen, extra responsiv
}

function finishChaseGame() {
  clearInterval(chaseTimerInterval);
  clearTimeout(chaseMoveTimeout);
  const score = chaseState ? chaseState.score : 0;
  chaseState = null;
  // Die Erdbeeren wurden schon pro Treffer gutgeschrieben - hier gibt's noch
  // einen kleinen Spaß-Bonus obendrauf.
  showResult("🍓 " + score + " Erdbeeren gefangen!", Math.min(20, 4 + score), 0);
}

function stopChaseGame() {
  clearInterval(chaseTimerInterval);
  clearTimeout(chaseMoveTimeout);
  chaseState = null;
}

chaseTarget.addEventListener("click", tapChaseTarget);

/* ---- Spiel 8: Melodie-Merker (Simon-Stil, DOM-basiert) ---- */
const SIMON_PAD_COUNT = 4;
const SIMON_MAX_ROUNDS = 14; // danach gilt es als "gewonnen" (Highscore-Deckel)
let simonState = null;
let simonPlaybackTimeout = null;

const simonPads = Array.from(simonGrid.querySelectorAll(".simon-pad"));

function startSimonGame() {
  simonState = { sequence: [], playerStep: 0, round: 0, accepting: false };
  gameScoreEl.textContent = "Runde: 0";
  gameTimerEl.textContent = "";
  simonNextRound();
}

function simonNextRound() {
  if (!simonState) return;
  simonState.round++;
  simonState.sequence.push(Math.floor(Math.random() * SIMON_PAD_COUNT));
  simonState.playerStep = 0;
  simonState.accepting = false;
  gameScoreEl.textContent = "Runde: " + simonState.round;
  gameScoreEl.classList.remove("pulse");
  void gameScoreEl.offsetWidth;
  gameScoreEl.classList.add("pulse");
  playSimonSequence();
}

function playSimonSequence() {
  clearTimeout(simonPlaybackTimeout);
  let i = 0;
  const step = () => {
    if (!simonState) return;
    if (i >= simonState.sequence.length) {
      simonState.accepting = true;
      return;
    }
    const padIdx = simonState.sequence[i];
    litSimonPad(padIdx);
    i++;
    simonPlaybackTimeout = setTimeout(step, 650);
  };
  simonPlaybackTimeout = setTimeout(step, 500);
}

function litSimonPad(idx) {
  const pad = simonPads[idx];
  if (!pad) return;
  pad.classList.add("lit");
  setTimeout(() => pad.classList.remove("lit"), 380);
}

function tapSimonPad(idx) {
  if (!simonState || !simonState.accepting) return;
  litSimonPad(idx);
  vibrate(10);
  const expected = simonState.sequence[simonState.playerStep];
  if (idx !== expected) {
    finishSimonGame(false);
    return;
  }
  simonState.playerStep++;
  if (simonState.playerStep >= simonState.sequence.length) {
    simonState.accepting = false;
    if (simonState.round >= SIMON_MAX_ROUNDS) {
      finishSimonGame(true);
    } else {
      setTimeout(simonNextRound, 700);
    }
  }
}

function finishSimonGame(won) {
  clearTimeout(simonPlaybackTimeout);
  const rounds = simonState ? simonState.round - (won ? 0 : 1) : 0;
  simonState = null;
  const funGain = Math.min(30, Math.max(2, rounds * 3));
  const strawberryGain = Math.min(6, Math.floor(rounds / 2));
  showResult(
    won ? "🎉 Alle " + SIMON_MAX_ROUNDS + " Runden gemeistert!" : "Geschafft bis Runde " + rounds,
    funGain,
    strawberryGain
  );
}

function stopSimonGame() {
  clearTimeout(simonPlaybackTimeout);
  simonState = null;
}

simonPads.forEach((pad, idx) => {
  pad.addEventListener("click", () => tapSimonPad(idx));
});

function drawSky(c) {
  const grad = c.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "#EAF7F8");
  grad.addColorStop(1, "#DCEFF0");
  c.fillStyle = grad;
  c.fillRect(0, 0, canvas.width, canvas.height);
}

/* ---------------------------------------------------------------------
   10) EVENT-VERDRAHTUNG
--------------------------------------------------------------------- */

// "Mehr"-Dropdown: fasst Kartenalbum/Fotoalbum/Info/Installieren zusammen,
// damit die Kopfzeile nicht mit lauter kleinen Icons überladen wirkt.
const moreBtn = document.getElementById("moreBtn");
const moreMenu = document.getElementById("moreMenu");
moreBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  moreMenu.classList.toggle("hidden");
});
moreMenu.addEventListener("click", (e) => {
  if (e.target.closest(".more-menu-item")) moreMenu.classList.add("hidden");
});
document.addEventListener("click", (e) => {
  if (!moreMenu.classList.contains("hidden") && !moreMenu.contains(e.target) && e.target !== moreBtn) {
    moreMenu.classList.add("hidden");
  }
});

document.getElementById("btnFeed").addEventListener("click", feed);
document.getElementById("btnDrink").addEventListener("click", drink);
document.getElementById("btnWash").addEventListener("click", wash);
document.getElementById("btnPlay").addEventListener("click", openGameOverlay);
document.getElementById("btnWork").addEventListener("click", startWork);
document.getElementById("btnSleep").addEventListener("click", toggleManualSleep);
document.getElementById("btnKiss").addEventListener("click", giveKiss);
document.getElementById("btnSniff").addEventListener("click", sniffBear);
el.bearSvg.addEventListener("click", petBear);

document.getElementById("overlayClose").addEventListener("click", closeGameOverlay);
document.getElementById("resultBack").addEventListener("click", showMenu);
document.getElementById("resultAgain").addEventListener("click", () =>
  startGame(currentGameKey)
);

document.querySelectorAll(".game-card").forEach((card) => {
  card.addEventListener("click", () => startGame(card.dataset.game));
});

const infoOverlay = document.getElementById("infoOverlay");
document.getElementById("infoBtn").addEventListener("click", () => {
  infoOverlay.classList.remove("hidden");
});
document.getElementById("infoClose").addEventListener("click", () => {
  infoOverlay.classList.add("hidden");
});

/* ---------------------------------------------------------------------
   11) SERVICE WORKER & "ALS APP INSTALLIEREN"
   Der Service Worker macht die App offline-fähig und ist Voraussetzung
   dafür, dass Handys/Desktop-Browser "Zum Startbildschirm hinzufügen"
   bzw. "App installieren" anbieten. sw.js selbst arbeitet mit einer
   Netzwerk-zuerst-Strategie, damit Updates trotzdem sofort ankommen.
--------------------------------------------------------------------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("Service-Worker-Registrierung fehlgeschlagen:", err);
    });
  });
}

function isStandaloneDisplay() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}
function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

const installBtn = document.getElementById("installBtn");
const installOverlay = document.getElementById("installOverlay");
let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (!isStandaloneDisplay()) installBtn.classList.remove("hidden");
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  installBtn.classList.add("hidden");
  showToast("🎉 SummiCare wurde installiert!");
});

function openInstallOverlay() {
  const ios = isIOSDevice();
  document.getElementById("installIosSteps").classList.toggle("hidden", !ios);
  document.getElementById("installGenericHint").classList.toggle("hidden", ios);
  document.getElementById("installNowBtn").classList.toggle("hidden", !deferredInstallPrompt);
  installOverlay.classList.remove("hidden");
}

function handleInstallClick() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.finally(() => {
      deferredInstallPrompt = null;
    });
    return;
  }
  openInstallOverlay();
}

installBtn.addEventListener("click", handleInstallClick);
document.getElementById("installNowBtn").addEventListener("click", handleInstallClick);
document.getElementById("installClose").addEventListener("click", () => {
  installOverlay.classList.add("hidden");
});

// iOS bietet kein beforeinstallprompt-Ereignis – Button dort immer anzeigen,
// solange die App noch nicht als installierte PWA läuft.
if (isIOSDevice() && !isStandaloneDisplay()) {
  installBtn.classList.remove("hidden");
}

document.getElementById("reviveBtn").addEventListener("click", reviveSummi);

/* ---------------------------------------------------------------------
   12) INITIALISIERUNG
--------------------------------------------------------------------- */
document.getElementById("buildBadge").textContent = BUILD_ID;
console.log("Bärchen-Pflege gestartet –", BUILD_ID);

loadState();
renderAll();
renderAccessories();
saveState();
startTickLoop();
scheduleSpeech(true);
scheduleTV();
scheduleAfflictionCheck();
renderWheelSegments();
if (state.isSick) document.getElementById("sickPrompt").classList.remove("hidden");
checkAchievements();
document.getElementById("questBtn").classList.toggle("has-badge", canClaimDailyReward() || canSpinWheel());
if (state.isDead) {
  showDeathOverlay();
} else {
  scheduleSleep(IDLE_SLEEP_MS);
}
