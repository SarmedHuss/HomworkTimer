(() => {
  "use strict";

  /* =========================================================
     Hausaufgaben-Timer
     Elternmodus: Kinderprofile, Planung, Bewertung, Verlauf
     Kindmodus:   Bleistift-Timer
     Alle Daten bleiben im Browser (localStorage).
     ========================================================= */

  const DATA_KEY = "hwt.data.v2";
  const RUN_KEY = "hwt.run.v2";
  const OLD_KEYS = ["hwt.settings.v1", "hwt.session.v1"];

  // Startwerte je Klasse (vorsichtig gewählt, siehe Konzept)
  const GRADE_DEFAULTS = {
    1: { focus: "10", break: "3", rounds: "2" },
    2: { focus: "12", break: "3", rounds: "2" },
    3: { focus: "15", break: "4", rounds: "3" },
    4: { focus: "20", break: "5", rounds: "3" },
  };
  const PLAN_EXTRAS = { subject: "", showTime: "on", sound: "on" };

  // ?speed=60 lässt eine Minute in einer Sekunde ablaufen (zum Ausprobieren).
  const SPEED = Math.max(1, Number(new URLSearchParams(location.search).get("speed")) || 1);

  const $ = (id) => document.getElementById(id);
  const SCREENS = ["profile", "plan", "rate", "history", "timer", "switch", "done"];

  const el = {
    // Profil
    profileTitle: $("profile-title"),
    profileForm: $("profile-form"),
    profileName: $("profile-name"),
    profileGrade: $("profile-grade"),
    profileCancel: $("profile-cancel"),
    profileDelete: $("profile-delete"),
    // Planen
    kidList: $("kid-list"),
    kidAdd: $("kid-add"),
    kidEdit: $("kid-edit"),
    planHeading: $("plan-heading"),
    planForm: $("plan-form"),
    summary: $("summary"),
    openHistory: $("open-history"),
    installHint: $("install-hint"),
    // Bewertung
    rateHeading: $("rate-heading"),
    rateSub: $("rate-sub"),
    rateForm: $("rate-form"),
    rateNote: $("rate-note"),
    rateSkip: $("rate-skip"),
    // Verlauf
    historyBack: $("history-back"),
    historyHeading: $("history-heading"),
    historyStats: $("history-stats"),
    historyList: $("history-list"),
    historyEmpty: $("history-empty"),
    // Kindmodus
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
    handover: $("btn-handover"),
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
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* voll oder gesperrt */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch { /* egal */ }
    },
  };

  /* data = {
       profiles: [{ id, name, grade, plan: {subject, focus, break, rounds, showTime, sound} }],
       activeId,
       sessions: [{ id, profileId, subject, focus, break, roundsPlanned, roundsDone,
                    pauses, endedEarly, startedAt, endedAt, rating, note }]
     } */
  let data = store.get(DATA_KEY, null);
  if (!data || !Array.isArray(data.profiles)) data = { profiles: [], activeId: null, sessions: [] };
  for (const k of OLD_KEYS) store.remove(k);

  const saveData = () => store.set(DATA_KEY, data);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const activeProfile = () => data.profiles.find((p) => p.id === data.activeId) || data.profiles[0] || null;
  const profileById = (id) => data.profiles.find((p) => p.id === id) || null;

  /* run = laufende Sitzung im Kindmodus (übersteht Neuladen)
     { sessionId, profileId, plan, phase, round, view, duration, remaining, endAt, paused, pauses, startedAt } */
  let run = null;

  /* ---------- Bildschirm wechseln ---------- */

  function show(name) {
    for (const s of SCREENS) {
      const node = $("screen-" + s);
      if (s === name) node.setAttribute("data-active", "");
      else node.removeAttribute("data-active");
    }
    window.scrollTo(0, 0);
  }

  // Segment-Buttons: aria-pressed setzen
  function markPressed(container, value) {
    for (const btn of container.querySelectorAll("button")) {
      btn.setAttribute("aria-pressed", String(btn.value === String(value)));
    }
  }

  /* =========================================================
     ELTERNMODUS
     ========================================================= */

  /* ---------- Profil ---------- */

  let editingId = null; // null = neues Profil
  let profileGrade = "2";

  function openProfile(id) {
    editingId = id;
    const p = id ? profileById(id) : null;
    el.profileTitle.textContent = p ? "Profil bearbeiten" : (data.profiles.length ? "Neues Kind" : "Für wen ist die Lernzeit?");
    el.profileName.value = p ? p.name : "";
    profileGrade = p ? String(p.grade) : "2";
    markPressed(el.profileGrade, profileGrade);
    el.profileCancel.hidden = data.profiles.length === 0;
    el.profileDelete.hidden = !p;
    show("profile");
    if (!p) setTimeout(() => el.profileName.focus(), 50);
  }

  el.profileGrade.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    profileGrade = btn.value;
    markPressed(el.profileGrade, profileGrade);
  });

  el.profileForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = el.profileName.value.trim();
    if (!name) { el.profileName.focus(); return; }
    const grade = Number(profileGrade);
    if (editingId) {
      const p = profileById(editingId);
      if (p.grade !== grade) Object.assign(p.plan, GRADE_DEFAULTS[grade]);
      p.name = name;
      p.grade = grade;
    } else {
      const p = { id: uid(), name, grade, plan: { ...PLAN_EXTRAS, ...GRADE_DEFAULTS[grade] } };
      data.profiles.push(p);
      data.activeId = p.id;
    }
    saveData();
    openPlan();
  });

  el.profileCancel.addEventListener("click", openPlan);

  el.profileDelete.addEventListener("click", () => {
    const p = profileById(editingId);
    if (!p) return;
    const count = data.sessions.filter((s) => s.profileId === p.id).length;
    const msg = count
      ? `${p.name} und ${count} gespeicherte Sitzung${count === 1 ? "" : "en"} löschen? Das lässt sich nicht rückgängig machen.`
      : `${p.name} löschen?`;
    if (!confirm(msg)) return;
    data.profiles = data.profiles.filter((x) => x.id !== p.id);
    data.sessions = data.sessions.filter((s) => s.profileId !== p.id);
    data.activeId = data.profiles[0]?.id || null;
    saveData();
    if (data.profiles.length) openPlan(); else openProfile(null);
  });

  /* ---------- Planen ---------- */

  function openPlan() {
    const p = activeProfile();
    if (!p) { openProfile(null); return; }
    data.activeId = p.id;
    renderKids();
    renderPlan();
    show("plan");
  }

  function renderKids() {
    el.kidList.innerHTML = "";
    for (const p of data.profiles) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "kid-chip";
      b.textContent = p.name;
      b.setAttribute("aria-pressed", String(p.id === data.activeId));
      b.addEventListener("click", () => {
        data.activeId = p.id;
        saveData();
        openPlan();
      });
      el.kidList.appendChild(b);
    }
  }

  function renderPlan() {
    const p = activeProfile();
    const plan = p.plan;
    el.planHeading.textContent = `Lernzeit für ${p.name}`;
    for (const group of el.planForm.querySelectorAll("[data-name]")) {
      markPressed(group, plan[group.dataset.name]);
    }
    const r = Number(plan.rounds);
    const total = r * Number(plan.focus) + (r - 1) * Number(plan.break);
    const d = GRADE_DEFAULTS[p.grade];
    const isDefault = d.focus === plan.focus && d.break === plan.break && d.rounds === plan.rounds;
    const what = r === 1 ? `Eine Runde mit ${plan.focus} Minuten` : `${r} Runden, zusammen etwa ${total} Minuten`;
    el.summary.textContent = isDefault ? `${what}. Vorschlag für Klasse ${p.grade}.` : `${what}.`;
    const count = data.sessions.filter((s) => s.profileId === p.id).length;
    el.openHistory.textContent = count ? `Verlauf ansehen (${count})` : "Verlauf ansehen";
  }

  el.planForm.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-name] button");
    if (!btn) return;
    const p = activeProfile();
    const name = btn.parentElement.dataset.name;
    // Fach lässt sich durch erneutes Antippen wieder abwählen
    p.plan[name] = name === "subject" && p.plan.subject === btn.value ? "" : btn.value;
    saveData();
    renderPlan();
  });

  el.planForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const p = activeProfile();
    unlockAudio(p.plan.sound);
    run = {
      sessionId: uid(),
      profileId: p.id,
      plan: { ...p.plan },
      round: 1,
      pauses: 0,
      startedAt: Date.now(),
    };
    startPhase("focus");
  });

  el.kidAdd.addEventListener("click", () => openProfile(null));
  el.kidEdit.addEventListener("click", () => openProfile(data.activeId));
  el.openHistory.addEventListener("click", openHistory);

  /* ---------- Bewertung ---------- */

  let rating = {};
  let ratingSessionId = null;

  function openRate(sessionId) {
    const s = data.sessions.find((x) => x.id === sessionId);
    if (!s) { openPlan(); return; }
    ratingSessionId = sessionId;
    rating = {};
    el.rateNote.value = "";
    for (const group of el.rateForm.querySelectorAll("[data-name]")) markPressed(group, null);
    const p = profileById(s.profileId);
    const name = p ? p.name : "dein Kind";
    for (const n of el.rateForm.querySelectorAll(".kid-name")) n.textContent = name;
    el.rateHeading.textContent = `Wie lief's bei ${name}?`;
    el.rateSub.textContent = describeSession(s);
    show("rate");
  }

  el.rateForm.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-name] button");
    if (!btn) return;
    const name = btn.parentElement.dataset.name;
    rating[name] = btn.value;
    markPressed(btn.parentElement, btn.value);
  });

  el.rateForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const s = data.sessions.find((x) => x.id === ratingSessionId);
    if (s) {
      const r = {};
      for (const k of ["focus", "help", "childMood", "parentMood"]) if (rating[k]) r[k] = Number(rating[k]);
      if (rating.difficulty) r.difficulty = rating.difficulty;
      s.rating = Object.keys(r).length ? r : null;
      s.note = el.rateNote.value.trim();
      saveData();
    }
    finishRating();
  });

  el.rateSkip.addEventListener("click", finishRating);

  function finishRating() {
    store.remove(RUN_KEY);
    run = null;
    ratingSessionId = null;
    openPlan();
  }

  /* ---------- Verlauf ---------- */

  const WORDS = {
    focus: { 5: "sehr gut", 4: "gut", 3: "mittel", 2: "wenig", 1: "kaum" },
    help: { 5: "nichts", 4: "wenig", 3: "etwas", 2: "viel", 1: "ständig" },
    childMood: { 3: "😊 gut", 2: "😐 gemischt", 1: "😣 frustriert" },
    parentMood: { 3: "😌 entspannt", 2: "😬 angespannt", 1: "😤 genervt" },
    difficulty: { easy: "zu leicht", ok: "passend", hard: "zu schwer" },
  };

  const dateFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "numeric" });
  const timeFmt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

  function describeSession(s) {
    const subject = s.subject || "Hausaufgaben";
    const rounds = `${s.roundsDone} von ${s.roundsPlanned} Runde${s.roundsPlanned === 1 ? "" : "n"}`;
    return `${subject} · ${rounds} à ${s.focus} Min${s.endedEarly ? " · vorzeitig beendet" : ""}`;
  }

  function openHistory() {
    const p = activeProfile();
    el.historyHeading.textContent = `Verlauf von ${p.name}`;
    const list = data.sessions
      .filter((s) => s.profileId === p.id)
      .sort((a, b) => b.startedAt - a.startedAt);

    el.historyList.innerHTML = "";
    el.historyEmpty.hidden = list.length > 0;

    const week = list.filter((s) => Date.now() - s.startedAt < 7 * 864e5);
    const pencils = week.reduce((n, s) => n + s.roundsDone, 0);
    el.historyStats.textContent = list.length
      ? `Diese Woche: ${week.length} Sitzung${week.length === 1 ? "" : "en"}, ${pencils} Bleistift${pencils === 1 ? "" : "e"} verbraucht.`
      : "";

    for (const s of list) {
      const li = document.createElement("li");
      li.className = "h-item";

      const top = document.createElement("div");
      top.className = "h-top";
      const subj = document.createElement("span");
      subj.textContent = s.subject || "Hausaufgaben";
      const when = document.createElement("span");
      when.className = "h-date";
      const d = new Date(s.startedAt);
      when.textContent = `${dateFmt.format(d)}, ${timeFmt.format(d)}`;
      top.append(subj, when);

      const meta = document.createElement("div");
      meta.className = "h-meta";
      const parts = [`${s.roundsDone} von ${s.roundsPlanned} Runden à ${s.focus} Min`];
      if (s.pauses) parts.push(`${s.pauses}× angehalten`);
      if (s.endedEarly) parts.push("vorzeitig beendet");
      meta.textContent = parts.join(" · ");

      li.append(top, meta);

      if (s.rating) {
        const tags = document.createElement("div");
        tags.className = "h-tags";
        const add = (label) => {
          const t = document.createElement("span");
          t.className = "h-tag";
          t.textContent = label;
          tags.appendChild(t);
        };
        const r = s.rating;
        if (r.focus) add(`Fokus: ${WORDS.focus[r.focus]}`);
        if (r.help) add(`Hilfe: ${WORDS.help[r.help]}`);
        if (r.childMood) add(`Kind: ${WORDS.childMood[r.childMood]}`);
        if (r.parentMood) add(`Du: ${WORDS.parentMood[r.parentMood]}`);
        if (r.difficulty) add(WORDS.difficulty[r.difficulty]);
        li.appendChild(tags);
      } else {
        const un = document.createElement("div");
        un.className = "h-unrated";
        un.textContent = "nicht bewertet";
        li.appendChild(un);
      }

      if (s.note) {
        const note = document.createElement("p");
        note.className = "h-note";
        note.textContent = s.note;
        li.appendChild(note);
      }
      el.historyList.appendChild(li);
    }
    show("history");
  }

  el.historyBack.addEventListener("click", openPlan);

  /* =========================================================
     KINDMODUS
     ========================================================= */

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
    const total = Number(run.plan.rounds);
    const done = doneRounds();
    list.innerHTML = "";
    for (let i = 1; i <= total; i++) {
      const li = document.createElement("li");
      const pencil = buildPencil(document.createElement("div"));
      pencil.className = "pencil";
      let p = 1;
      if (i <= done) { li.className = "done"; p = 0; }
      else if (i === run.round && run.view === "timer") li.className = "current";
      pencil.style.setProperty("--p", String(p));
      li.appendChild(pencil);
      list.appendChild(li);
    }
    list.setAttribute("aria-label", `${done} von ${total} Bleistiften verbraucht`);
  }

  function animateLastDone(list) {
    const pencil = list.children[doneRounds() - 1]?.firstChild;
    if (!pencil) return;
    pencil.style.setProperty("--p", "1");
    requestAnimationFrame(() => requestAnimationFrame(() => pencil.style.setProperty("--p", "0")));
  }

  function doneRounds() {
    if (!run) return 0;
    const finishedCurrent = run.phase === "break" || run.view !== "timer";
    return run.round - 1 + (finishedCurrent ? 1 : 0);
  }

  /* ---------- Timer ---------- */

  let raf = 0;

  function startPhase(phase) {
    const minutes = Number(phase === "focus" ? run.plan.focus : run.plan.break);
    const duration = (minutes * 60000) / SPEED;
    Object.assign(run, {
      phase,
      view: "timer",
      duration,
      remaining: duration,
      endAt: Date.now() + duration,
      paused: false,
    });
    saveRun();
    showTimer();
  }

  function phaseLabel() {
    if (run.paused) return "Angehalten";
    if (run.phase === "break") return "Pause";
    return run.plan.subject ? `${run.plan.subject} · Lernzeit` : "Lernzeit";
  }

  function showTimer() {
    el.timer.dataset.phase = run.phase;
    if (run.plan.showTime === "off") el.timer.setAttribute("data-hide-time", "");
    else el.timer.removeAttribute("data-hide-time");
    renderRounds(el.rounds);
    lastSecond = -1;
    renderPaused();
    show("timer");
    requestWakeLock();
    loop();
  }

  function remainingNow() {
    return run.paused ? run.remaining : Math.max(0, run.endAt - Date.now());
  }

  function loop() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (!run || run.view !== "timer") return;
      const rem = remainingNow();
      drawPencil(rem / run.duration);
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
    if (run.phase === "focus") {
      el.rounds.querySelector("li.current .pencil")?.style.setProperty("--p", value);
    }
    const secs = Math.ceil((p * run.duration * SPEED) / 1000);
    if (secs !== lastSecond) {
      lastSecond = secs;
      const m = Math.floor(secs / 60);
      el.time.textContent = `${m}:${String(secs % 60).padStart(2, "0")}`;
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
    if (run.paused) el.timer.setAttribute("data-paused", "");
    else el.timer.removeAttribute("data-paused");
    el.toggle.textContent = run.paused ? "Weiter" : "Anhalten";
    el.phaseTitle.textContent = phaseLabel();
  }

  el.toggle.addEventListener("click", () => {
    if (!run) return;
    if (run.paused) {
      run.paused = false;
      run.endAt = Date.now() + run.remaining;
      requestWakeLock();
    } else {
      run.remaining = remainingNow();
      run.paused = true;
      run.pauses += 1;
    }
    saveRun();
    renderPaused();
    loop();
  });

  function phaseEnded(withSound) {
    cancelAnimationFrame(raf);
    releaseWakeLock();
    if (withSound) chime();

    const total = Number(run.plan.rounds);
    if (run.phase === "focus") {
      if (run.round >= total) {
        run.view = "done";
        recordSession(false);
        saveRun();
        renderRounds(el.roundsDone);
        if (withSound) animateLastDone(el.roundsDone);
        el.doneText.textContent = total === 1
          ? "Der Bleistift ist aufgebraucht. Du hast dich toll konzentriert."
          : `Alle ${total} Bleistifte sind aufgebraucht. Du hast dich toll konzentriert.`;
        show("done");
        return;
      }
      run.view = "switch";
      el.switchTitle.textContent = "Super gemacht!";
      el.switchText.textContent = "Ein Bleistift ist aufgebraucht. Zeit für eine kleine Pause.";
      el.next.textContent = "Pause starten";
    } else {
      run.view = "switch";
      el.switchTitle.textContent = "Weiter geht's!";
      el.switchText.textContent = "Die Pause ist vorbei. Jetzt kommt die nächste Lernzeit.";
      el.next.textContent = "Lernzeit starten";
    }
    saveRun();
    renderRounds(el.roundsSwitch);
    if (withSound && run.phase === "focus") animateLastDone(el.roundsSwitch);
    show("switch");
  }

  el.next.addEventListener("click", () => {
    unlockAudio(run.plan.sound);
    if (run.phase === "focus") {
      startPhase("break");
    } else {
      run.round += 1;
      startPhase("focus");
    }
  });

  el.handover.addEventListener("click", () => {
    run.view = "rate";
    saveRun();
    openRate(run.sessionId);
  });

  // Sitzung in den Verlauf schreiben (einmal, beim Ende oder Abbruch)
  function recordSession(endedEarly) {
    if (data.sessions.some((s) => s.id === run.sessionId)) return;
    const roundsDone = endedEarly ? doneRounds() : Number(run.plan.rounds);
    data.sessions.push({
      id: run.sessionId,
      profileId: run.profileId,
      subject: run.plan.subject,
      focus: Number(run.plan.focus),
      break: Number(run.plan.break),
      roundsPlanned: Number(run.plan.rounds),
      roundsDone,
      pauses: run.pauses,
      endedEarly,
      startedAt: run.startedAt,
      endedAt: Date.now(),
      rating: null,
      note: "",
    });
    saveData();
  }

  function endEarly() {
    cancelAnimationFrame(raf);
    releaseWakeLock();
    if (!run) { openPlan(); return; }
    // Wer noch keine Minute gelernt hat, will meist nur abbrechen: dann nichts speichern.
    const learnedMs = (Date.now() - run.startedAt) * SPEED;
    if (doneRounds() === 0 && learnedMs < 60000) {
      store.remove(RUN_KEY);
      run = null;
      openPlan();
      return;
    }
    recordSession(true);
    run.view = "rate";
    saveRun();
    openRate(run.sessionId);
  }

  /* ---------- Beenden: gedrückt halten ---------- */

  const HOLD_MS = 1200;
  let holdTimer = 0;

  function holdStart(e) {
    if (e.button !== undefined && e.button !== 0) return;
    el.stop.classList.add("holding");
    holdTimer = setTimeout(() => {
      el.stop.classList.remove("holding");
      endEarly();
    }, HOLD_MS);
  }
  function holdCancel() {
    clearTimeout(holdTimer);
    el.stop.classList.remove("holding");
  }
  el.stop.addEventListener("pointerdown", holdStart);
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) el.stop.addEventListener(ev, holdCancel);
  el.stop.addEventListener("contextmenu", (e) => e.preventDefault());
  el.stop.addEventListener("click", (e) => {
    if (e.detail === 0 && confirm("Timer beenden?")) endEarly();
  });

  /* ---------- Laufende Sitzung speichern & fortsetzen ---------- */

  function saveRun() {
    if (run) store.set(RUN_KEY, { ...run, speed: SPEED });
  }

  function resumeRun() {
    const saved = store.get(RUN_KEY, null);
    if (!saved || saved.speed !== SPEED || !saved.duration || !profileById(saved.profileId)) {
      store.remove(RUN_KEY);
      return false;
    }
    run = saved;
    if (run.view === "rate") {
      openRate(run.sessionId);
    } else if (run.view === "timer" && (run.paused || run.endAt > Date.now())) {
      showTimer();
    } else {
      run.view = "timer";
      phaseEnded(false);
    }
    return true;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && run && run.view === "timer") {
      if (!run.paused) requestWakeLock();
      loop();
    }
  });

  /* ---------- Bildschirm wach halten ---------- */

  let wakeLock = null;
  async function requestWakeLock() {
    if (!("wakeLock" in navigator) || wakeLock || run?.paused) return;
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
  function unlockAudio(sound) {
    if (sound !== "on") return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const buf = audio.createBuffer(1, 1, 22050);
      const src = audio.createBufferSource();
      src.buffer = buf;
      src.connect(audio.destination);
      src.start(0);
    } catch { audio = null; }
  }

  function chime() {
    if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate([120, 80, 120]);
    if (run?.plan.sound !== "on" || !audio) return;
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
  if (!resumeRun()) openPlan();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    // Bei einer neuen Version die Seite einmal neu laden, damit sie sofort sichtbar ist.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloaded || run) return;
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
      .then((reg) => {
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  }
})();
