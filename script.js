// =====================================================================
// Bärchen-Pflege – script.js
// Enthält: Zustand & Speicherung, Bär-Rendering, Pflege-Aktionen,
// Sprechblasen, sowie drei Minispiele (Sternenfang, Seifenblasen, Hüpf-Lauf)
// =====================================================================

// Build-Kennung zur Cache-Diagnose: taucht oben rechts in der App auf.
// Wenn du nach einem Update immer noch eine ALTE Nummer siehst, wurde die
// neue Version noch nicht geladen (Cache-Problem) statt eines echten Bugs.
const BUILD_ID = "build-13";

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
  hunger: 100 / (8 * 60),  // 8 Minuten
  clean:  100 / (10 * 60), // 10 Minuten
  fun:    100 / (8 * 60),  // 8 Minuten – jetzt ungefähr im gleichen Tempo wie Hunger
};

const MAX_CATCHUP_SECONDS = 3 * 60 * 60; // max. 3h "Abwesenheits-Verfall" nachholen
const REVIVE_COST = 10; // so viele 🍓 werden zum Wiederbeleben gebraucht
const PHOTO_COUNT = 19; // Anzahl der Fotos im Album

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
  toys: { piglet: 0, cowboy: 0, plush: 0 }, // gekauftes Spielzeug-Inventar
  carePoints: 0, // Basis für Level & Alter
  isDead: false,
  unlockedPhotos: new Array(PHOTO_COUNT).fill(false),
  lastSave: Date.now(),
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      state = { ...state, ...saved };
      // Absicherung: falls das Array aus einem älteren Speicherstand kürzer
      // ist (z. B. wurden später neue Fotos hinzugefügt), auffüllen.
      if (!Array.isArray(state.unlockedPhotos)) state.unlockedPhotos = [];
      while (state.unlockedPhotos.length < PHOTO_COUNT) state.unlockedPhotos.push(false);
      if (!state.toys) state.toys = { piglet: 0, cowboy: 0, plush: 0 };
      for (const key of ["piglet", "cowboy", "plush"]) {
        if (typeof state.toys[key] !== "number") state.toys[key] = 0;
      }
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
};

const MOUTHS = {
  happy: "M 128 152 Q 150 175 172 152",
  neutral: "M 134 160 L 166 160",
  sad: "M 130 168 Q 150 150 170 168",
  verySad: "M 128 165 Q 150 145 172 165",
  crying: "M 132 170 Q 150 148 168 170",
  sleeping: "", // Schlafmund wird separat als offenes Oval + Sabbertropfen angezeigt
  dead: "M 136 162 Q 150 156 164 162 Q 150 168 136 162",
};

// WEINEN: wenn Hunger ODER Spaß unter die kritische Schwelle fallen.
const CRY_THRESHOLD = 20;

function computeMood() {
  if (state.isDead) return "dead";
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
  el.bearWrap.classList.toggle("crying", mood === "crying");
  el.comfortButtons.classList.toggle("show", mood === "crying");
  if (mood === lastMood) return; // nur bei Änderung neu zeichnen
  lastMood = mood;

  el.eyeLeft.setAttribute("transform", "translate(120,110)");
  el.eyeRight.setAttribute("transform", "translate(180,110)");
  el.eyeLeft.innerHTML = EYES[mood];
  el.eyeRight.innerHTML = EYES[mood];
  el.mouth.setAttribute("d", MOUTHS[mood]);
  const showTear = mood === "verySad" || mood === "crying";
  el.tear.style.opacity = showTear ? "1" : "0";
  el.tear.setAttribute("d", "M 118 118 q -4 10 0 16 q 4 -6 0 -16 Z");
  el.tear2.style.opacity = mood === "crying" ? "1" : "0";
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
  const lockMost = state.isDead || isSleeping || isWorking;
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
  showToast("🍓🍞 Lecker, Toast mit Erdbeermarmelade!");
  spawnParticles("🍓", 4);
  wiggleBear();
  registerInteraction();
  renderAll();
  saveState();
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
  registerInteraction();
  renderAll();
  saveState();
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
  if (!overlay.classList.contains("hidden") || isWorking) {
    // Während eines Minispiels oder der Arbeit nicht einschlafen, aber später erneut prüfen
    scheduleSleep(5000);
    return;
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
  showToast("💼 Feierabend! +" + earned + " Coins verdient!");
  registerInteraction();
  renderAll();
  saveState();
}

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
   7c) FOTO-ALBUM: Diashow mit gestaffelten Preisen & seltenen Spezial-Fotos
--------------------------------------------------------------------- */
// Jedes Foto hat einen eigenen Preis (steigt an) und kann optional als
// "special: true" markiert werden (seltenes, teures Bonusbild).
//
// EIGENE BILDER ERGÄNZEN: einfach weitere Einträge unten anhängen, z. B.:
//   { src: "photos/photo20.jpg", cost: 45 },
// oder als seltenes Spezial-Bild:
//   { src: "photos/special-urlaub.jpg", cost: 80, special: true },
const PHOTOS = Array.from({ length: PHOTO_COUNT }, (_, i) => ({
  src: `photos/photo${i + 1}.jpg`,
  cost: 4 + i * 3, // steigender Preis: Foto 1 = 4 🍓, Foto 19 = 58 🍓
  special: false,
}));
// Die letzten beiden Fotos als seltene, besonders teure "Spezial-Bilder" markieren:
PHOTOS[PHOTOS.length - 2].cost = 55;
PHOTOS[PHOTOS.length - 2].special = true;
PHOTOS[PHOTOS.length - 1].cost = 70;
PHOTOS[PHOTOS.length - 1].special = true;

// // Beispiel, wie man eigene weitere Spezial-Bilder ergänzen kann:
// PHOTOS.push({ src: "photos/special-geburtstag.jpg", cost: 90, special: true });

const albumOverlay = document.getElementById("albumOverlay");
const slideFrame = document.getElementById("slideFrame");
const slidePrev = document.getElementById("slidePrev");
const slideNext = document.getElementById("slideNext");
const slideCounter = document.getElementById("slideCounter");
let albumIndex = 0;

function openAlbum() {
  albumOverlay.classList.remove("hidden");
  albumIndex = 0;
  renderSlide();
}

function closeAlbum() {
  albumOverlay.classList.add("hidden");
}

function renderSlide() {
  const photo = PHOTOS[albumIndex];
  slideCounter.textContent = albumIndex + 1 + " / " + PHOTOS.length;
  slidePrev.disabled = albumIndex === 0;
  slideNext.disabled = albumIndex === PHOTOS.length - 1;

  if (state.unlockedPhotos[albumIndex]) {
    slideFrame.innerHTML = `<img src="${photo.src}" alt="Summi Erinnerungsfoto ${albumIndex + 1}">`;
    return;
  }

  const badge = photo.special ? '<span class="slide-special-badge">✨ Seltenes Bild</span>' : "";
  slideFrame.innerHTML = `
    <div class="slide-locked ${photo.special ? "special" : ""}">
      <span class="lock-emoji">🔒</span>
      ${badge}
      <span class="slide-cost">${photo.cost} 🍓 zum Freischalten</span>
      <button class="primary-btn" id="unlockCurrentPhoto">Freischalten</button>
    </div>`;
  document.getElementById("unlockCurrentPhoto").addEventListener("click", () => unlockPhoto(albumIndex));
}

function unlockPhoto(idx) {
  if (state.unlockedPhotos[idx]) return;
  const cost = PHOTOS[idx].cost;
  if (state.strawberries < cost) {
    showToast("Noch nicht genug 🍓 gesammelt! Brauchst " + cost + ".");
    return;
  }
  state.strawberries -= cost;
  state.unlockedPhotos[idx] = true;
  renderAll();
  saveState();
  renderSlide();
  showToast("📸 Neues Erinnerungsfoto freigeschaltet!");
}

slidePrev.addEventListener("click", () => {
  if (albumIndex > 0) {
    albumIndex--;
    renderSlide();
  }
});
slideNext.addEventListener("click", () => {
  if (albumIndex < PHOTOS.length - 1) {
    albumIndex++;
    renderSlide();
  }
});

document.getElementById("albumBtn").addEventListener("click", openAlbum);
document.getElementById("albumClose").addEventListener("click", closeAlbum);

/* ---------------------------------------------------------------------
   7e) SPIELZEUG-SHOP (mit Coins) & INVENTAR
--------------------------------------------------------------------- */
// Generische Spielzeuge (bewusst KEINE geschützten Marken/Figuren verwendet).
const TOYS = [
  { id: "piglet", emoji: "🐷", name: "Kuscheltier-Ferkel", desc: "Süßes kleines Ferkel zum Kuscheln", cost: 30, funGain: 15 },
  { id: "cowboy", emoji: "🤠", name: "Cowboy-Figur", desc: "Mutige Spielzeug-Figur für Abenteuer", cost: 60, funGain: 25 },
  { id: "plush", emoji: "🧸", name: "XXL-Kuscheltier", desc: "Riesiges, flauschiges Kuscheltier", cost: 120, funGain: 40 },
];

const shopOverlay = document.getElementById("shopOverlay");
const shopList = document.getElementById("shopList");
const inventoryList = document.getElementById("inventoryList");

function openShop() {
  shopOverlay.classList.remove("hidden");
  renderShop();
}

function closeShop() {
  shopOverlay.classList.add("hidden");
}

function renderShop() {
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

  renderInventory();
}

function renderInventory() {
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
        <button class="inventory-play-btn" data-toy="${t.id}" title="Summi freut sich, wenn du das Spielzeug neben ihn legst!">▶️</button>
      </span>`
    )
    .join("");
  inventoryList.querySelectorAll(".inventory-play-btn").forEach((btn) => {
    btn.addEventListener("click", () => playWithToy(btn.dataset.toy));
  });
}

// Spielzeug "neben den Bären legen": löst eine kurze Freude-Animation aus.
// Das Spielzeug selbst wird dabei nicht verändert/verbraucht, nur als Auslöser genutzt.
function playWithToy(id) {
  const toy = TOYS.find((t) => t.id === id);
  if (!toy || !state.toys[id]) return;
  state.fun = clamp(state.fun + 6);
  state.love = clamp(state.love + 2);
  addCarePoints(CARE_POINTS.play * 0.5);
  el.bearWrap.classList.remove("joy-pop");
  void el.bearWrap.offsetWidth;
  el.bearWrap.classList.add("joy-pop");
  spawnParticles(toy.emoji, 4);
  spawnParticles("✨", 3);
  if (id === "cowboy") {
    showToast("🤠 Da bist du ja! Summi hat seinen Cowboy-Freund so vermisst!");
  } else {
    showToast(toy.emoji + " Summi freut sich über " + toy.name + "!");
  }
  renderAll();
  saveState();
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
  showToast(toy.emoji + " " + toy.name + " gekauft – Summi freut sich!");
  renderAll();
  saveState();
  renderShop();
}

document.getElementById("shopBtn").addEventListener("click", openShop);
document.getElementById("shopClose").addEventListener("click", closeShop);

function startTickLoop() {
  setInterval(() => {
    applyDecay(1);
    renderAll();
  }, 1000);

  setInterval(saveState, 5000);
}

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
  registerInteraction();
  overlay.classList.remove("hidden");
  showMenu();
}

function closeGameOverlay() {
  stopGameLoop();
  stopHarvestGame();
  stopChaseGame();
  overlayPanel.classList.remove("no-scroll");
  overlay.classList.add("hidden");
}

function showMenu() {
  stopGameLoop();
  stopHarvestGame();
  stopChaseGame();
  overlayPanel.classList.remove("no-scroll");
  gameMenu.classList.remove("hidden");
  gameScreen.classList.add("hidden");
  gameResult.classList.add("hidden");
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

  if (key === "figures") {
    canvas.classList.add("hidden");
    memoryGrid.classList.remove("hidden");
    harvestGrid.classList.add("hidden");
    chaseArea.classList.add("hidden");
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
    jumpBtn.classList.add("hidden");
    gasBtn.classList.add("hidden");
    gameTitleEl.textContent = "🍓 Erdbeer-Jagd";
    gameHintEl.textContent = "Fang die wild hüpfende Erdbeere so oft wie möglich!";
    startChaseGame();
    return;
  }

  memoryGrid.classList.add("hidden");
  harvestGrid.classList.add("hidden");
  chaseArea.classList.add("hidden");
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
  state.strawberries += strawberryGain;
  addCarePoints(CARE_POINTS.play);

  // Gestaffelter Coin-Bonus abhängig vom Abschneiden im Minispiel
  const scoreRatio = Math.min(1, funGain / 30);
  const bonusCoins = rollBonusCoins(scoreRatio);
  state.coins += bonusCoins;

  registerInteraction(true); // müde vom Spielen -> schläft bald ein
  renderAll();
  saveState();

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

// Kleine, allgemein nutzbare "Trefferringe" für Tipp-Feedback in Canvas-Spielen.
// Zeigt SOFORT sichtbar, ob ein Tipp ankommt (grün = getroffen, grau = daneben).
function addTapEffect(effectsArray, x, y, hit) {
  effectsArray.push({ x, y, hit, life: 1 });
}
function updateTapEffects(effectsArray, dt) {
  for (const fx of effectsArray) fx.life -= dt * 2.2;
  return effectsArray.filter((fx) => fx.life > 0);
}
function drawTapEffects(c, effectsArray) {
  for (const fx of effectsArray) {
    const r = 30 * (1 - fx.life) + 10;
    c.beginPath();
    c.arc(fx.x, fx.y, r, 0, Math.PI * 2);
    c.strokeStyle = fx.hit
      ? `rgba(120, 200, 140, ${fx.life})`
      : `rgba(150, 150, 150, ${fx.life * 0.6})`;
    c.lineWidth = 3;
    c.stroke();
  }
}

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
  state.strawberries += 1; // sofort im Erdbeer-Inventar gutschreiben
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
   11) SERVICE WORKER (PWA) – VORÜBERGEHEND DEAKTIVIERT
   Zur Fehlersuche wird der Service Worker komplett entfernt (alte
   Registrierungen abgemeldet, alte Caches gelöscht). So laden wir
   garantiert immer die neueste Version direkt vom Server, ohne dass ein
   alter Cache dazwischenfunken kann. Sobald alles zuverlässig läuft,
   kann die PWA-Installierbarkeit wieder aktiviert werden.
--------------------------------------------------------------------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => reg.unregister());
  });
}
if ("caches" in window) {
  caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
}

document.getElementById("reviveBtn").addEventListener("click", reviveSummi);

/* ---------------------------------------------------------------------
   12) INITIALISIERUNG
--------------------------------------------------------------------- */
document.getElementById("buildBadge").textContent = BUILD_ID;
console.log("Bärchen-Pflege gestartet –", BUILD_ID);

loadState();
renderAll();
saveState();
startTickLoop();
scheduleSpeech(true);
scheduleTV();
if (state.isDead) {
  showDeathOverlay();
} else {
  scheduleSleep(IDLE_SLEEP_MS);
}
