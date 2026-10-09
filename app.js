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
  // Standardfächer (übersetzt); eigene Fächer haben IDs "c_…" und einen festen Namen
  const BUILTIN_SUBJECTS = ["math", "language", "science", "foreign", "reading", "other"];
  const defaultSubjects = () => BUILTIN_SUBJECTS.map((id) => ({ id }));

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

  // Fächer werden sprachneutral gespeichert; alte deutsche Werte umschreiben
  const OLD_SUBJECTS = { Mathe: "math", Deutsch: "language", Sachunterricht: "science", Englisch: "foreign", Lesen: "reading", Anderes: "other" };
  for (const p of data.profiles) if (OLD_SUBJECTS[p.plan?.subject]) p.plan.subject = OLD_SUBJECTS[p.plan.subject];
  for (const x of data.sessions) if (OLD_SUBJECTS[x.subject]) x.subject = OLD_SUBJECTS[x.subject];
  for (const p of data.profiles) if (!Array.isArray(p.subjects)) p.subjects = defaultSubjects();

  const saveData = () => store.set(DATA_KEY, data);

  /* ---------- Sprache ---------- */

  const LANGS = ["de", "en"];
  if (!LANGS.includes(data.lang)) {
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language || "de";
    data.lang = nav.toLowerCase().startsWith("de") ? "de" : "en";
  }

  // t("key", ...args): Text holen; {name}/{v} ersetzen oder Funktion aufrufen
  // Ohne Texte nicht starten: dann zeigt index.html den Hinweis „Neu laden“
  if (!window.I18N) throw new Error("i18n.js nicht geladen");
  const I18N = window.I18N;
  function t(key, ...args) {
    const entry = (I18N[data.lang] && I18N[data.lang][key]) ?? (I18N.de && I18N.de[key]) ?? key;
    if (typeof entry === "function") return entry(...args);
    const vars = args[0] || {};
    return entry.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  }

  // Name eines Fachs: Standardfach übersetzt, eigenes Fach mit gespeichertem Namen
  function subjectName(key, label) {
    if (!key) return t("subj.none");
    if (BUILTIN_SUBJECTS.includes(key)) return t("subj." + key);
    for (const p of data.profiles) {
      const s = (p.subjects || []).find((x) => x.id === key);
      if (s && s.name) return s.name;
    }
    return label || "–";
  }

  let dateFmt, timeFmt;
  function applyLanguage() {
    document.documentElement.lang = data.lang;
    document.title = t("app.title");
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content", t("app.short"));
    for (const n of document.querySelectorAll("[data-i18n]")) n.textContent = t(n.dataset.i18n);
    for (const n of document.querySelectorAll("[data-i18n-ph]")) n.placeholder = t(n.dataset.i18nPh);
    for (const n of document.querySelectorAll("[data-i18n-aria]")) n.setAttribute("aria-label", t(n.dataset.i18nAria));
    for (const b of document.querySelectorAll("[data-lang]")) b.setAttribute("aria-pressed", String(b.dataset.lang === data.lang));
    const locale = data.lang === "de" ? "de-DE" : "en-US";
    dateFmt = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "numeric" });
    timeFmt = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lang]");
    if (!b || b.dataset.lang === data.lang) return;
    data.lang = b.dataset.lang;
    saveData();
    applyLanguage();
    // aktuellen Elternbildschirm neu aufbauen
    const active = document.querySelector(".screen[data-active]")?.id;
    if (active === "screen-plan") openPlan();
    else if (active === "screen-profile") openProfile(editingId);
  });
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
    el.profileTitle.textContent = t(p ? "profile.titleEdit" : (data.profiles.length ? "profile.titleNew" : "profile.titleFirst"));
    el.profileName.value = p ? p.name : "";
    profileGrade = p ? String(p.grade) : "2";
    markPressed(el.profileGrade, profileGrade);
    el.profileCancel.hidden = data.profiles.length === 0;
    el.profileDelete.hidden = !p;
    // Fächer nur beim Bearbeiten zeigen; Änderungen gelten erst mit „Speichern“
    editSubjects = p ? p.subjects.map((x) => ({ ...x })) : null;
    $("profile-subjects-wrap").hidden = !p;
    renderProfileSubjects();
    show("profile");
    if (!p) setTimeout(() => el.profileName.focus(), 50);
  }

  let editSubjects = null;

  function renderProfileSubjects() {
    const box = $("profile-subjects");
    box.innerHTML = "";
    if (!editSubjects) return;
    if (!editSubjects.length) {
      const e = document.createElement("p");
      e.className = "empty";
      e.textContent = t("profile.noSubjects");
      box.appendChild(e);
    }
    for (const s of editSubjects) {
      const b = document.createElement("button");
      b.type = "button";
      b.value = s.id;
      b.textContent = subjectName(s.id);
      b.setAttribute("aria-label", t("profile.removeSubject", { name: subjectName(s.id) }));
      box.appendChild(b);
    }
  }

  $("profile-subjects").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || !editSubjects) return;
    editSubjects = editSubjects.filter((x) => x.id !== b.value);
    renderProfileSubjects();
  });

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
      if (editSubjects) {
        p.subjects = editSubjects;
        if (!p.subjects.some((x) => x.id === p.plan.subject)) p.plan.subject = "";
      }
    } else {
      const p = { id: uid(), name, grade, subjects: defaultSubjects(), plan: { ...PLAN_EXTRAS, ...GRADE_DEFAULTS[grade] } };
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
    if (!confirm(t("profile.confirmDelete", p.name, count))) return;
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
    showSubjectAdd(false);
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
    el.planHeading.textContent = t("plan.heading", { name: p.name });
    renderSubjectChips(p);
    for (const group of el.planForm.querySelectorAll("[data-name]")) {
      markPressed(group, plan[group.dataset.name]);
    }
    const r = Number(plan.rounds);
    const total = r * Number(plan.focus) + (r - 1) * Number(plan.break);
    const d = GRADE_DEFAULTS[p.grade];
    const isDefault = d.focus === plan.focus && d.break === plan.break && d.rounds === plan.rounds;
    el.summary.textContent = t("plan.summary", r, plan.focus, total, p.grade, isDefault);
    const count = data.sessions.filter((s) => s.profileId === p.id).length;
    el.openHistory.textContent = t("plan.history", count);
  }

  function renderSubjectChips(p) {
    const box = $("subject-chips");
    box.innerHTML = "";
    if (p.plan.subject && !p.subjects.some((x) => x.id === p.plan.subject)) p.plan.subject = "";
    for (const s of p.subjects) {
      const b = document.createElement("button");
      b.type = "button";
      b.value = s.id;
      b.textContent = subjectName(s.id);
      box.appendChild(b);
    }
    const add = document.createElement("button");
    add.type = "button";
    add.className = "chip-add";
    add.value = "__add";
    add.textContent = t("plan.addSubject");
    box.appendChild(add);
  }

  function showSubjectAdd(open) {
    $("subject-add").hidden = !open;
    $("subject-input").value = "";
    if (open) setTimeout(() => $("subject-input").focus(), 30);
  }

  function saveSubject() {
    const name = $("subject-input").value.trim().replace(/\s+/g, " ");
    const p = activeProfile();
    if (name) {
      const existing = p.subjects.find((x) => subjectName(x.id).toLowerCase() === name.toLowerCase());
      if (existing) {
        p.plan.subject = existing.id;
      } else {
        const s = { id: "c_" + uid(), name };
        p.subjects.push(s);
        p.plan.subject = s.id;
      }
      saveData();
    }
    showSubjectAdd(false);
    renderPlan();
  }

  $("subject-save").addEventListener("click", saveSubject);
  $("subject-input").addEventListener("keydown", (e) => {
    // Enter würde sonst das Planungsformular abschicken und den Timer starten
    if (e.key === "Enter") { e.preventDefault(); saveSubject(); }
    if (e.key === "Escape") { e.preventDefault(); showSubjectAdd(false); }
  });

  el.planForm.addEventListener("click", (e) => {
    if (e.target.closest(".chip-add")) { showSubjectAdd($("subject-add").hidden); return; }
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
    const name = p ? p.name : t("rate.kidFallback");
    $("q-focus").textContent = t("rate.focusQ", { name });
    $("q-child").textContent = t("rate.childQ", { name });
    el.rateHeading.textContent = t("rate.heading", { name });
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

  const CHILD_FACE = { 3: "😊", 2: "😐", 1: "😣" };
  const PARENT_FACE = { 3: "😌", 2: "😬", 1: "😤" };

  function describeSession(s) {
    const parts = [subjectName(s.subject, s.subjectLabel), t("history.rounds", s.roundsDone, s.roundsPlanned, s.focus)];
    if (s.endedEarly) parts.push(t("history.early"));
    return parts.join(" · ");
  }

  function openHistory() {
    const p = activeProfile();
    el.historyHeading.textContent = t("history.heading", { name: p.name });
    const list = data.sessions
      .filter((s) => s.profileId === p.id)
      .sort((a, b) => b.startedAt - a.startedAt);

    el.historyList.innerHTML = "";
    el.historyEmpty.hidden = list.length > 0;

    const week = list.filter((s) => Date.now() - s.startedAt < 7 * 864e5);
    const pencils = week.reduce((n, s) => n + s.roundsDone, 0);
    el.historyStats.textContent = list.length ? t("history.stats", week.length, pencils) : "";

    for (const s of list) {
      const li = document.createElement("li");
      li.className = "h-item";

      const top = document.createElement("div");
      top.className = "h-top";
      const subj = document.createElement("span");
      subj.textContent = subjectName(s.subject, s.subjectLabel);
      const when = document.createElement("span");
      when.className = "h-date";
      const d = new Date(s.startedAt);
      when.textContent = `${dateFmt.format(d)}, ${timeFmt.format(d)}`;
      top.append(subj, when);

      const meta = document.createElement("div");
      meta.className = "h-meta";
      const parts = [t("history.rounds", s.roundsDone, s.roundsPlanned, s.focus)];
      if (s.pauses) parts.push(t("history.paused", s.pauses));
      if (s.endedEarly) parts.push(t("history.early"));
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
        if (r.focus) add(t("tag.focus", { v: t("rate.focus." + r.focus) }));
        if (r.help) add(t("tag.help", { v: t("rate.help." + r.help) }));
        if (r.childMood) add(t("tag.child", { v: `${CHILD_FACE[r.childMood]} ${t("rate.child." + r.childMood)}` }));
        if (r.parentMood) add(t("tag.parent", { v: `${PARENT_FACE[r.parentMood]} ${t("rate.parent." + r.parentMood)}` }));
        if (r.difficulty) add(t("rate.diff." + r.difficulty));
        li.appendChild(tags);
      } else {
        const un = document.createElement("div");
        un.className = "h-unrated";
        un.textContent = t("history.unrated");
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
    list.setAttribute("aria-label", t("rounds.aria", done, total));
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
    if (run.paused) return t("timer.paused");
    if (run.phase === "break") return t("timer.break");
    return run.plan.subject ? `${subjectName(run.plan.subject)} · ${t("timer.focus")}` : t("timer.focus");
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
      el.time.setAttribute("aria-label", t("timer.left", m, secs % 60));
    }
    const text =
      p > 0.75 ? t("timer.p1") :
      p > 0.4 ? t("timer.p2") :
      p > 0.15 ? t("timer.p3") : t("timer.p4");
    if (text !== lastText) {
      lastText = text;
      el.pencil.setAttribute("aria-valuetext", text);
    }
    el.pencil.setAttribute("aria-valuenow", String(Math.round(p * 100)));
  }

  function renderPaused() {
    if (run.paused) el.timer.setAttribute("data-paused", "");
    else el.timer.removeAttribute("data-paused");
    el.toggle.textContent = t(run.paused ? "timer.resume" : "timer.pause");
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
        el.doneText.textContent = t("done.text", total);
        show("done");
        return;
      }
      run.view = "switch";
      el.switchTitle.textContent = t("switch.doneTitle");
      el.switchText.textContent = t("switch.doneText");
      el.next.textContent = t("switch.startBreak");
    } else {
      run.view = "switch";
      el.switchTitle.textContent = t("switch.breakTitle");
      el.switchText.textContent = t("switch.breakText");
      el.next.textContent = t("switch.startFocus");
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
      subjectLabel: run.plan.subject ? subjectName(run.plan.subject) : "",
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
    if (e.detail === 0 && confirm(t("timer.confirmStop"))) endEarly();
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

  applyLanguage();
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
