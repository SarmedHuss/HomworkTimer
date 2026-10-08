(() => {
  "use strict";

  const SETTINGS_KEY = "hwt.settings.v1";
  const SESSION_KEY = "hwt.session.v1";
  const DEFAULTS = { focus: "15", break: "3", rounds: "3", sound: "on" };

  // ?speed=60 lässt eine Minute in einer Sekunde ablaufen (zum Ausprobieren).
  const SPEED = Math.max(1, Number(new URLSearchParams(location.search).get("speed")) || 1);

  const $ = (id) => document.getElementById(id);
  const screens = ["setup", "timer", "switch", "done"];

  const el = {
    form: $("setup-form"),
    summary: $("summary"),
    installHint: $("install-hint"),
    timer: $("screen-timer"),
    phaseTitle: $("phase-title"),
    pencil: $("pencil"),
    time: $("time"),
    rounds: $("rounds"),
    roundsSwitch: $("rounds-switch"),
    roundsDone: $("rounds-done"),
    doneText: $("done-text"),
    toggle: $("btn-toggle"),
    stop: $("btn-stop"),
    switchTitle: $("switch-title"),
    switchText: $("switch-text"),
    next: $("btn-next"),
    again: $("btn-again"),
    home: $("btn-home"),
  };

  /* ---------- Speicher ---------- */

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* egal */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch { /* egal */ }
    },
  };

  let settings = { ...DEFAULTS, ...store.get(SETTINGS_KEY, {}) };

  /* Sitzung:
     phase: "focus" | "break"
     round: aktuelle Runde (1-basiert)
     view: "timer" | "switch" | "done"
     duration, remaining (ms), endAt (Zeitstempel), paused */
  let session = null;

  /* ---------- Bildschirm wechseln ---------- */

  function show(name) {
    for (const s of screens) {
      const node = $("screen-" + s);
      if (s === name) node.setAttribute("data-active", "");
      else node.removeAttribute("data-active");
    }
    window.scrollTo(0, 0);
  }

  /* ---------- Einstellungen ---------- */

  function renderSettings() {
    for (const group of el.form.querySelectorAll(".options")) {
      const name = group.dataset.name;
      for (const btn of group.querySelectorAll("button")) {
        btn.setAttribute("aria-pressed", String(btn.value === settings[name]));
      }
    }
    const r = Number(settings.rounds);
    const total = r * Number(settings.focus) + (r - 1) * Number(settings.break);
    el.summary.textContent = r === 1
      ? `Eine Runde mit ${settings.focus} Minuten Lernzeit.`
      : `${r} Runden, insgesamt etwa ${total} Minuten.`;
  }

  el.form.addEventListener("click", (e) => {
    const btn = e.target.closest(".options button");
    if (!btn) return;
    settings[btn.parentElement.dataset.name] = btn.value;
    store.set(SETTINGS_KEY, settings);
    renderSettings();
  });

  el.form.addEventListener("submit", (e) => {
    e.preventDefault();
    unlockAudio();
    session = { phase: "focus", round: 1, view: "timer" };
    startPhase("focus");
  });

  /* ---------- Bleistifte ---------- */

  const PENCIL_PARTS =
    '<div class="pc-eraser"></div><div class="pc-ferrule"></div><div class="pc-body"></div>' +
    '<div class="pc-cone"><div class="pc-lead"></div></div>';

  function buildPencil(node) {
    node.innerHTML =
      '<div class="pc-shape pc-ghost" aria-hidden="true">' + PENCIL_PARTS + "</div>" +
      '<div class="pc-shape pc-live" aria-hidden="true">' + PENCIL_PARTS + "</div>";
    return node;
  }

  // Ein kleiner Bleistift pro Runde: verbraucht = Stummel, aktuell = schrumpft mit, offen = neu.
  function renderRounds(list) {
    const total = Number(settings.rounds);
    const done = doneRounds();
    list.innerHTML = "";
    for (let i = 1; i <= total; i++) {
      const li = document.createElement("li");
      const pencil = buildPencil(document.createElement("div"));
      pencil.className = "pencil";
      let p = 1;
      if (i <= done) { li.className = "done"; p = 0; }
      else if (session && i === session.round && session.view === "timer") li.className = "current";
      pencil.style.setProperty("--p", String(p));
      li.appendChild(pencil);
      list.appendChild(li);
    }
    list.setAttribute("aria-label", `${done} von ${total} Bleistiften verbraucht`);
  }

  // Runden-Bleistift, der gerade als verbraucht markiert wird, sanft schrumpfen lassen.
  function animateLastDone(list) {
    const done = doneRounds();
    const pencil = list.children[done - 1]?.firstChild;
    if (!pencil) return;
    pencil.style.setProperty("--p", "1");
    requestAnimationFrame(() => requestAnimationFrame(() => pencil.style.setProperty("--p", "0")));
  }

  function doneRounds() {
    if (!session) return 0;
    // Nach Ende einer Lernzeit zählt die Runde als geschafft.
    const finishedCurrent = session.phase === "break" || session.view !== "timer";
    return session.round - 1 + (finishedCurrent ? 1 : 0);
  }

  /* ---------- Timer ---------- */

  let raf = 0;

  function startPhase(phase) {
    const minutes = Number(phase === "focus" ? settings.focus : settings.break);
    const duration = (minutes * 60000) / SPEED;
    Object.assign(session, {
      phase,
      view: "timer",
      duration,
      remaining: duration,
      endAt: Date.now() + duration,
      paused: false,
    });
    saveSession();
    showTimer();
  }

  function showTimer() {
    el.timer.dataset.phase = session.phase;
    el.phaseTitle.textContent = session.phase === "focus" ? "Lernzeit" : "Pause";
    renderRounds(el.rounds);
    lastSecond = -1;
    renderPaused();
    show("timer");
    requestWakeLock();
    loop();
  }

  function remainingNow() {
    return session.paused ? session.remaining : Math.max(0, session.endAt - Date.now());
  }

  function loop() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (!session || session.view !== "timer") return;
      const rem = remainingNow();
      drawPencil(rem / session.duration);
      if (rem <= 0) { phaseEnded(true); return; }
      raf = requestAnimationFrame(step);
    };
    step();
  }

  let lastText = "";
  let lastSecond = -1;
  function drawPencil(fraction) {
    const p = Math.min(1, Math.max(0, fraction));
    const value = p.toFixed(4);
    el.pencil.style.setProperty("--p", value);
    if (session.phase === "focus") {
      el.rounds.querySelector("li.current .pencil")?.style.setProperty("--p", value);
    }
    const secs = Math.ceil((p * session.duration * SPEED) / 1000);
    if (secs !== lastSecond) {
      lastSecond = secs;
      const m = Math.floor(secs / 60);
      const sec = String(secs % 60).padStart(2, "0");
      el.time.textContent = `${m}:${sec}`;
      el.time.setAttribute("aria-label", m > 0 ? `Noch ${m} Minuten ${secs % 60} Sekunden` : `Noch ${secs % 60} Sekunden`);
    }
    const text =
      p > 0.75 ? "Noch viel Zeit" :
      p > 0.4 ? "Noch etwa die Hälfte" :
      p > 0.15 ? "Nicht mehr viel Zeit" : "Gleich geschafft";
    if (text !== lastText) {
      lastText = text;
      el.pencil.setAttribute("aria-valuetext", text);
    }
    el.pencil.setAttribute("aria-valuenow", String(Math.round(p * 100)));
  }

  function renderPaused() {
    if (session.paused) el.timer.setAttribute("data-paused", "");
    else el.timer.removeAttribute("data-paused");
    el.toggle.textContent = session.paused ? "Weiter" : "Anhalten";
    el.phaseTitle.textContent = session.paused ? "Angehalten" : (session.phase === "focus" ? "Lernzeit" : "Pause");
  }

  el.toggle.addEventListener("click", () => {
    if (!session) return;
    if (session.paused) {
      session.paused = false;
      session.endAt = Date.now() + session.remaining;
      requestWakeLock();
    } else {
      session.remaining = remainingNow();
      session.paused = true;
    }
    saveSession();
    renderPaused();
    loop();
  });

  function phaseEnded(withSound) {
    cancelAnimationFrame(raf);
    releaseWakeLock();
    if (withSound) chime();

    const total = Number(settings.rounds);
    if (session.phase === "focus") {
      if (session.round >= total) {
        session.view = "done";
        saveSession();
        renderRounds(el.roundsDone);
        if (withSound) animateLastDone(el.roundsDone);
        el.doneText.textContent = total === 1
          ? "Der Bleistift ist aufgebraucht. Du hast dich toll konzentriert."
          : `Alle ${total} Bleistifte sind aufgebraucht. Du hast dich toll konzentriert.`;
        show("done");
        return;
      }
      session.view = "switch";
      el.switchTitle.textContent = "Super gemacht!";
      el.switchText.textContent = "Ein Bleistift ist aufgebraucht. Zeit für eine kleine Pause.";
      el.next.textContent = "Pause starten";
    } else {
      session.view = "switch";
      el.switchTitle.textContent = "Weiter geht's!";
      el.switchText.textContent = "Die Pause ist vorbei. Jetzt kommt die nächste Lernzeit.";
      el.next.textContent = "Lernzeit starten";
    }
    saveSession();
    renderRounds(el.roundsSwitch);
    if (withSound && session.phase === "focus") animateLastDone(el.roundsSwitch);
    show("switch");
  }

  el.next.addEventListener("click", () => {
    unlockAudio();
    if (session.phase === "focus") {
      startPhase("break");
    } else {
      session.round += 1;
      startPhase("focus");
    }
  });

  el.again.addEventListener("click", () => {
    unlockAudio();
    session = { phase: "focus", round: 1, view: "timer" };
    startPhase("focus");
  });

  el.home.addEventListener("click", goHome);

  function goHome() {
    cancelAnimationFrame(raf);
    releaseWakeLock();
    session = null;
    store.remove(SESSION_KEY);
    renderSettings();
    show("setup");
  }

  /* ---------- Beenden: gedrückt halten ---------- */

  const HOLD_MS = 1200;
  let holdTimer = 0;

  function holdStart(e) {
    if (e.button !== undefined && e.button !== 0) return;
    el.stop.classList.add("holding");
    holdTimer = setTimeout(() => {
      el.stop.classList.remove("holding");
      goHome();
    }, HOLD_MS);
  }
  function holdCancel() {
    clearTimeout(holdTimer);
    el.stop.classList.remove("holding");
  }
  el.stop.addEventListener("pointerdown", holdStart);
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) el.stop.addEventListener(ev, holdCancel);
  el.stop.addEventListener("contextmenu", (e) => e.preventDefault());
  // Tastatur: mit Enter/Leertaste ausgelöst → kurz nachfragen
  el.stop.addEventListener("click", (e) => {
    if (e.detail === 0 && confirm("Timer beenden?")) goHome();
  });

  /* ---------- Sitzung speichern & fortsetzen ---------- */

  function saveSession() {
    if (session) store.set(SESSION_KEY, { ...session, speed: SPEED });
  }

  function resumeSession() {
    const saved = store.get(SESSION_KEY, null);
    if (!saved || saved.speed !== SPEED || !saved.duration) return false;
    session = saved;
    if (session.view === "timer") {
      if (!session.paused && session.endAt <= Date.now()) {
        phaseEnded(false);
      } else {
        showTimer();
      }
    } else if (session.view === "switch") {
      session.view = "timer";
      phaseEnded(false);
    } else if (session.view === "done") {
      session.view = "timer";
      phaseEnded(false);
    }
    return true;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && session && session.view === "timer") {
      if (!session.paused) requestWakeLock();
      loop();
    }
  });

  /* ---------- Bildschirm wach halten ---------- */

  let wakeLock = null;
  async function requestWakeLock() {
    if (!("wakeLock" in navigator) || wakeLock || session?.paused) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } catch { wakeLock = null; }
  }
  function releaseWakeLock() {
    if (wakeLock) wakeLock.release().catch(() => {});
    wakeLock = null;
  }

  /* ---------- Ton ---------- */

  let audio = null;
  function unlockAudio() {
    if (settings.sound !== "on") return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      // stummer Ton schaltet Audio auf iOS frei
      const buf = audio.createBuffer(1, 1, 22050);
      const src = audio.createBufferSource();
      src.buffer = buf;
      src.connect(audio.destination);
      src.start(0);
    } catch { audio = null; }
  }

  function chime() {
    if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
    if (settings.sound !== "on" || !audio) return;
    const notes = [659.25, 783.99, 1046.5]; // E5, G5, C6
    const t0 = audio.currentTime + 0.05;
    notes.forEach((freq, i) => {
      const t = t0 + i * 0.22;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 1);
    });
  }

  /* ---------- Start ---------- */

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  el.installHint.hidden = !(isIOS && !isStandalone);

  buildPencil(el.pencil);
  renderSettings();
  if (!resumeSession()) show("setup");

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    // Bei einer neuen Version die Seite einmal neu laden, damit sie sofort sichtbar ist.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
      .then((reg) => {
        // Beim Zurückkehren in die App nach Updates schauen
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  }
})();
