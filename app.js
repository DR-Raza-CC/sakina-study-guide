/* Sakina Study Guide — app */
(function () {
  "use strict";

  // ---------------- basics ----------------
  var $app = document.getElementById("app");
  var S = {
    token: lsGet("ssg_token"),
    role: null,
    child: null,
    prog: null,
    bookQuiz: false,
    lastSync: 0
  };
  var ORDER = window.buildWordOrder();
  var ORDER_MAP = {};
  ORDER.forEach(function (o) { ORDER_MAP[o.word.toLowerCase()] = o; });
  var INTERVALS = [1, 1, 2, 4, 7, 14, 30, 60]; // days until next test, by box
  var MASTERED = 6;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(sel) { return $app.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call($app.querySelectorAll(sel)); }
  function on(sel, ev, fn) { var el = $(sel); if (el) el.addEventListener(ev, fn); return el; }
  function rand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function today() { var d = new Date(); return ymd(d); }
  function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function addDays(dstr, n) { var p = dstr.split("-"); var d = new Date(+p[0], +p[1] - 1, +p[2]); d.setDate(d.getDate() + n); return ymd(d); }
  function niceDate(dstr) { var p = dstr.split("-"); var d = new Date(+p[0], +p[1] - 1, +p[2]); return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); }
  function scrollTop() { window.scrollTo(0, 0); }

  var toastTimer;
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { "content-type": "application/json" };
    if (S.token) headers.authorization = "Bearer " + S.token;
    return fetch("/api" + path, { method: opts.method || "GET", headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) {
            var e = new Error(data.error || ("Something went wrong (" + r.status + ")"));
            e.status = r.status; throw e;
          }
          return data;
        });
      });
  }

  // ---------------- speech ----------------
  var voice = null;
  function pickVoice() {
    if (!("speechSynthesis" in window)) return;
    var vs = speechSynthesis.getVoices();
    voice = vs.find(function (v) { return /en-GB/i.test(v.lang) && /female|serena|kate|martha|libby|sonia|google uk english female/i.test(v.name); }) ||
            vs.find(function (v) { return /en-GB/i.test(v.lang); }) ||
            vs.find(function (v) { return /^en/i.test(v.lang); }) || null;
  }
  if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function speak(text, rate) {
    if (!("speechSynthesis" in window)) { toast("Sorry, this device can't read out loud."); return; }
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : "en-GB";
    u.rate = rate || 0.85;
    speechSynthesis.speak(u);
  }
  function speakWord(item) { speak(item.word + ". . " + (item.sentence || "") + " . . " + item.word + "."); }

  // ---------------- progress ----------------
  function blankProgress() {
    return { v: 1, words: {}, days: {}, stars: 0, best: 0, books: [], maths: {}, school: [], schoolVersion: 0, settings: {} };
  }
  function normaliseProgress(p) {
    var b = blankProgress();
    p = p || {};
    Object.keys(b).forEach(function (k) { if (p[k] == null) p[k] = b[k]; });
    ["add", "mult"].forEach(function (k) { if (!p.maths[k]) p.maths[k] = { level: 0, unlocked: 0, passes: {}, history: [] }; });
    return p;
  }
  function settings() {
    var s = S.prog.settings || {};
    return { newPerDay: s.newPerDay || 3, testLen: s.testLen || 10, startWeek: s.startWeek || "" };
  }
  function dayRec(d) { var r = S.prog.days[d || today()]; if (!r) { r = S.prog.days[d || today()] = {}; } return r; }

  var saveTimer = null, saving = false, dirty = false;
  function save(now) {
    dirty = true;
    lsSet("ssg_cache_" + (S.child && S.child.id), JSON.stringify(S.prog));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, now ? 0 : 1500);
  }
  function flush() {
    if (saving || !dirty || S.role !== "child") return;
    saving = true; dirty = false;
    api("/progress", { method: "PUT", body: { progress: S.prog } })
      .then(function (r) {
        S.prog.settings = r.settings || S.prog.settings;
        applySchool(r.school, r.schoolVersion);
      })
      .catch(function (e) { dirty = true; if (e.status === 401) return signOut(); })
      .then(function () { saving = false; if (dirty) saveTimer = setTimeout(flush, 4000); });
  }
  function applySchool(list, version) {
    if (!Array.isArray(list)) return;
    S.prog.school = list;
    S.prog.schoolVersion = version || 0;
  }
  window.addEventListener("pagehide", function () { if (dirty) flush(); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && dirty) flush();
  });

  function streak() {
    var d = today();
    if (!(S.prog.days[d] && S.prog.days[d].spell)) d = addDays(d, -1);
    var n = 0;
    while (S.prog.days[d] && S.prog.days[d].spell) { n++; d = addDays(d, -1); }
    return n;
  }

  // ---------------- spelling engine ----------------
  function wordKey(w) { return String(w).trim().toLowerCase(); }
  function schoolList() {
    var list = (S.prog.school || []).slice();
    activeHomework().forEach(function (hw) {
      (hw.missions || []).forEach(function (m) {
        if (m.type !== "spelling") return;
        m.words.forEach(function (w) { list.push({ word: w[0], sentence: w[1], unit: hw.id + ":" + m.id }); });
      });
    });
    return list;
  }
  function schoolMap() {
    var m = {};
    schoolList().forEach(function (s) { var k = wordKey(s.word); if (!m[k]) m[k] = s; });
    return m;
  }
  function activeHomework() {
    var t = today();
    return (window.HOMEWORK || []).filter(function (hw) { return !hw.done && t <= addDays(hw.due, 3); });
  }
  function wordInfo(key) {
    var sm = schoolMap();
    var o = ORDER_MAP[key];
    if (sm[key]) {
      return { word: sm[key].word, sentence: sm[key].sentence || (o && o.sentence) || "", unit: sm[key].unit || "school" };
    }
    var hwW = HW_WORDS()[key];
    if (hwW) return { word: hwW.word, sentence: hwW.sentence, unit: hwW.unit };
    if (o) return o;
    var e = S.prog.words[key];
    return { word: e ? e.w : key, sentence: e && e.sen || "", unit: "tricky" };
  }
  function newWordQueue() {
    var q = [];
    schoolList().forEach(function (s) {
      var k = wordKey(s.word);
      if (!S.prog.words[k] && q.indexOf(k) < 0) q.push(k);
    });
    var schoolNew = q.length;
    // start from the chosen week, then loop back to the earlier weeks
    var start = 0, sw = settings().startWeek;
    if (sw) { var idx = ORDER.findIndex(function (o) { return o.unit === sw; }); if (idx > 0) start = idx; }
    ORDER.slice(start).concat(ORDER.slice(0, start)).forEach(function (o) {
      var k = wordKey(o.word);
      if (!S.prog.words[k] && q.indexOf(k) < 0) q.push(k);
    });
    return { queue: q, schoolNew: schoolNew };
  }
  function buildDailyTest() {
    var st = settings(), t = today(), sm = schoolMap();
    var nq = newWordQueue();
    var newCount = nq.schoolNew ? Math.min(5, Math.max(st.newPerDay, nq.schoolNew)) : st.newPerDay;
    var news = nq.queue.slice(0, newCount);
    var len = Math.max(st.testLen, news.length + 4);
    var entries = Object.keys(S.prog.words).map(function (k) { return { k: k, e: S.prog.words[k] }; });
    // school words keep coming back every day until they are well known
    var due = entries.filter(function (x) { return x.e.due <= t || (sm[x.k] && x.e.b < 4); });
    due.sort(function (a, b) { return (a.e.due < b.e.due ? -1 : a.e.due > b.e.due ? 1 : a.e.b - b.e.b); });
    var picks = due.slice(0, len - news.length).map(function (x) { return x.k; });
    if (picks.length + news.length < len) {
      var extra = entries.filter(function (x) { return picks.indexOf(x.k) < 0 && x.e.b < MASTERED; })
        .sort(function (a, b) { return a.e.b - b.e.b || (a.e.last < b.e.last ? -1 : 1); });
      extra.slice(0, len - news.length - picks.length).forEach(function (x) { picks.push(x.k); });
    }
    return { news: news, items: shuffle(picks.concat(news)) };
  }
  function record(key, correct) {
    var t = today();
    var info = wordInfo(key);
    var e = S.prog.words[key] || { w: info.word, b: 0, r: 0, x: 0, first: t };
    if (info.unit === "school" || HW_WORDS()[key]) { e.s = 1; if (info.sentence) e.sen = info.sentence; }
    if (correct) { e.b = Math.min(e.b + 1, 7); e.r++; }
    else { e.b = 0; e.x++; }
    e.last = t;
    e.due = addDays(t, e.s && e.b < MASTERED ? Math.min(INTERVALS[e.b], 7) : INTERVALS[e.b]);
    S.prog.words[key] = e;
  }
  function sameWord(typed, word) {
    var a = String(typed || "").trim().replace(/[‘’]/g, "'");
    return a.toLowerCase() === String(word).toLowerCase();
  }
  function blankSentence(sentence, word) {
    if (!sentence) return "";
    var re = new RegExp("\\b" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi");
    return esc(sentence).replace(re, '<span class="blank">&nbsp;</span>');
  }
  function diffLetters(typed, word) {
    typed = String(typed || "").trim().toLowerCase();
    return word.split("").map(function (ch, i) {
      return typed[i] === ch.toLowerCase() ? esc(ch) : '<span class="x">' + esc(ch) + "</span>";
    }).join("");
  }

  // ---------------- router ----------------
  function go(view, arg) { scrollTop(); if ("speechSynthesis" in window) speechSynthesis.cancel(); VIEWS[view](arg); }

  function boot() {
    $app.innerHTML = '<div class="loader"></div>';
    api("/state").then(function (st) {
      S.bookQuiz = st.bookQuiz;
      if (!st.setup) return go("setup");
      if (!S.token) return go("welcome");
      return api("/me").then(function (me) {
        S.role = me.role;
        if (me.role === "child") {
          S.child = me.child;
          S.prog = normaliseProgress(me.progress);
          if (seedPastHomework()) save();
          S.lastSync = Date.now();
          go("home");
        } else go("parent");
      });
    }).catch(function (e) {
      if (e.status === 401) { S.token = null; lsSet("ssg_token", null); return go("welcome"); }
      if (e.status === 503) { $app.innerHTML = '<div class="card center"><h2>Almost there!</h2><p>' + esc(e.message) + "</p></div>"; return; }
      $app.innerHTML = '<div class="card center"><h2>Can\'t connect</h2><p class="muted">' + esc(e.message) + '</p><button class="btn block" id="retry">Try again</button></div>';
      on("#retry", "click", boot);
    });
  }
  function signOut() {
    flush();
    if (S.token) api("/logout", { method: "POST" }).catch(function () {});
    S.token = null; S.role = null; S.child = null; S.prog = null;
    lsSet("ssg_token", null);
    go("welcome");
  }
  function topbar(title, back) {
    return '<div class="topbar">' + (back ? '<button class="iconbtn" id="back" aria-label="Back">←</button>' : "") +
      '<div class="title">' + esc(title) + "</div></div>";
  }
  function wireBack(fn) { on("#back", "click", fn); }

  var VIEWS = {};

  // ---------------- setup & sign in ----------------
  VIEWS.setup = function () {
    $app.innerHTML =
      '<div class="center" style="margin:20px 0"><div style="font-size:64px">📚</div><h1>Set up your family</h1>' +
      '<p class="muted">Do this once. The first person to open the app sets it up.</p></div>' +
      '<div class="card"><form id="f">' +
      '<label>Family code (6+ letters or numbers)</label><input id="code" autocomplete="off" autocapitalize="off" placeholder="e.g. husain2026">' +
      '<label>Parent PIN (4–8 numbers)</label><input id="ppin" inputmode="numeric" type="password" autocomplete="new-password">' +
      '<label>Child\'s name</label><input id="cname" value="Sakina">' +
      '<label>Child\'s PIN (4–8 numbers)</label><input id="cpin" inputmode="numeric" type="password" autocomplete="new-password">' +
      '<div class="err" id="err"></div><div style="height:14px"></div>' +
      '<button class="btn block" type="submit">Create</button></form></div>';
    on("#f", "submit", function (ev) {
      ev.preventDefault();
      var body = { familyCode: $("#code").value, parentPin: $("#ppin").value, childName: $("#cname").value, childPin: $("#cpin").value };
      api("/setup", { method: "POST", body: body }).then(function () {
        lsSet("ssg_code", body.familyCode.trim());
        toast("All set! Now sign in.");
        go("welcome");
      }).catch(function (e) { $("#err").textContent = e.message; });
    });
  };

  VIEWS.welcome = function () {
    $app.innerHTML =
      '<div class="center" style="margin:30px 0 24px"><div style="font-size:72px">🌟</div><h1>Study Guide</h1><p class="muted">Spellings, books and number families</p></div>' +
      '<button class="tile" id="kid"><div class="emoji bg-sun">🧒</div><div><div class="t">I\'m a learner</div><div class="s">Let\'s practise!</div></div></button>' +
      '<button class="tile" id="par"><div class="emoji bg-plum">👨‍👩‍👧</div><div><div class="t">I\'m a parent</div><div class="s">See progress and settings</div></div></button>';
    on("#kid", "click", function () { go("codeEntry", "child"); });
    on("#par", "click", function () { go("codeEntry", "parent"); });
  };

  VIEWS.codeEntry = function (role) {
    $app.innerHTML = topbar(role === "parent" ? "Parent sign in" : "Hello!", true) +
      '<div class="card"><form id="f"><label>Family code</label><input id="code" autocomplete="off" autocapitalize="off" value="' + esc(lsGet("ssg_code") || "") + '">' +
      (role === "parent" ? '<label>Parent PIN</label><input id="pin" type="password" inputmode="numeric">' : "") +
      '<div class="err" id="err"></div><div style="height:14px"></div><button class="btn block" type="submit">Next</button></form></div>';
    wireBack(function () { go("welcome"); });
    on("#f", "submit", function (ev) {
      ev.preventDefault();
      var code = $("#code").value.trim();
      if (role === "parent") {
        api("/login", { method: "POST", body: { familyCode: code, role: "parent", pin: $("#pin").value } }).then(function (r) {
          lsSet("ssg_code", code); S.token = r.token; lsSet("ssg_token", r.token); S.role = "parent"; go("parent");
        }).catch(function (e) { $("#err").textContent = e.message; });
      } else {
        api("/children", { method: "POST", body: { familyCode: code } }).then(function (r) {
          lsSet("ssg_code", code); go("pickName", { code: code, children: r.children });
        }).catch(function (e) { $("#err").textContent = e.message; });
      }
    });
  };

  VIEWS.pickName = function (ctx) {
    var faces = ["🦊", "🐼", "🦄", "🐯", "🐸", "🐨", "🦁", "🐰"];
    $app.innerHTML = topbar("Who are you?", true) + '<div class="names">' +
      ctx.children.map(function (c, i) { return '<button class="namebtn" data-id="' + esc(c.id) + '"><span class="e">' + faces[i % faces.length] + "</span>" + esc(c.name) + "</button>"; }).join("") + "</div>";
    wireBack(function () { go("codeEntry", "child"); });
    $$(".namebtn").forEach(function (b) {
      b.addEventListener("click", function () {
        var c = ctx.children.find(function (x) { return x.id === b.getAttribute("data-id"); });
        go("pin", { code: ctx.code, child: c, children: ctx.children });
      });
    });
  };

  VIEWS.pin = function (ctx) {
    var pin = "";
    $app.innerHTML = topbar("Hi " + ctx.child.name + "!", true) +
      '<p class="center">Type your secret PIN</p><div class="pindots" id="dots"></div><div class="err center" id="err"></div>' +
      '<div class="pinpad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, "⌫", 0, "✓"].map(function (k) { return '<button data-k="' + k + '">' + k + "</button>"; }).join("") + "</div>";
    wireBack(function () { go("pickName", ctx); });
    function dots() {
      var n = Math.max(4, pin.length);
      $("#dots").innerHTML = Array.from({ length: n }, function (_, i) { return '<span class="' + (i < pin.length ? "on" : "") + '"></span>'; }).join("");
    }
    function submit() {
      if (pin.length < 4) return;
      api("/login", { method: "POST", body: { familyCode: ctx.code, role: "child", childId: ctx.child.id, pin: pin } }).then(function (r) {
        S.token = r.token; lsSet("ssg_token", r.token); boot();
      }).catch(function (e) { $("#err").textContent = e.message; pin = ""; dots(); });
    }
    $$(".pinpad button").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-k");
        if (k === "⌫") pin = pin.slice(0, -1);
        else if (k === "✓") return submit();
        else if (pin.length < 8) pin += k;
        $("#err").textContent = "";
        dots();
      });
    });
    dots();
  };

  // ---------------- child home ----------------
  function syncFromServer() {
    if (Date.now() - S.lastSync < 60000 || dirty || saving) return;
    S.lastSync = Date.now();
    api("/me").then(function (me) {
      if (me.role !== "child" || dirty || saving) return;
      var p = me.progress || {};
      if (p.settings) S.prog.settings = p.settings;
      applySchool(p.school, p.schoolVersion);
    }).catch(function () {});
  }

  VIEWS.home = function () {
    syncFromServer();
    var t = today(), done = !!(S.prog.days[t] && S.prog.days[t].spell);
    var st = streak();
    var mastered = Object.keys(S.prog.words).filter(function (k) { return S.prog.words[k].b >= MASTERED; }).length;
    var tricky = Object.keys(S.prog.words).filter(function (k) { var e = S.prog.words[k]; return e.x > 0 && e.b < 3; }).length;
    var monday = (function () { var d = new Date(); var day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return ymd(d); })();
    var week = ["M", "T", "W", "T", "F", "S", "S"].map(function (l, i) {
      var d = addDays(monday, i), on = S.prog.days[d] && S.prog.days[d].spell;
      return '<div class="d">' + l + '<div class="dot ' + (on ? "on" : "") + (d === t ? " today" : "") + '">' + (on ? "🔥" : "") + "</div></div>";
    }).join("");
    var add = S.prog.maths.add, mult = S.prog.maths.mult;
    var school = (S.prog.school || []).length;
    $app.innerHTML =
      '<div class="hello"><div class="avatar">🦊</div><div><h1>Hi ' + esc(S.child.name) + '!</h1><div class="muted">' + greeting() + '</div></div><div class="spacer"></div><button class="iconbtn" id="out" aria-label="Sign out">⏻</button></div>' +
      '<div class="stats"><div class="stat"><div class="big">🔥 ' + st + '</div><div class="lbl">day streak' + (S.prog.best > st ? " · best " + S.prog.best : "") + '</div></div>' +
      '<div class="stat"><div class="big">⭐ ' + (S.prog.stars || 0) + '</div><div class="lbl">stars</div></div></div>' +
      '<div class="card" style="margin-bottom:16px"><h3>This week</h3><div class="week">' + week + "</div></div>" +
      homeworkTiles() +
      '<button class="tile" id="spell"><div class="emoji bg-teal">✏️</div><div><div class="t">Today\'s spellings</div><div class="s">' +
      (done ? "Done today! Come back tomorrow." : "Keep your streak going!") + (school ? " · " + school + " school words" : "") + "</div></div>" +
      (done ? '<span class="badge">✓ Done</span>' : "") + "</button>" +
      (tricky ? '<button class="tile" id="tricky"><div class="emoji bg-coral">🎯</div><div><div class="t">Tricky words</div><div class="s">' + tricky + " words to practise" + (streakFor("tricky") ? " · 🔥 " + streakFor("tricky") : "") + "</div></div></button>" : "") +
      '<button class="tile" id="book"><div class="emoji bg-sun">📖</div><div><div class="t">My book quiz</div><div class="s">Take a photo, answer 10 questions</div></div></button>' +
      '<button class="tile" id="nums"><div class="emoji bg-sky">🔢</div><div><div class="t">Number families</div><div class="s">➕ Level ' + (add.level + 1) + " · ✖️ Level " + (mult.level + 1) + (streakFor("nums") ? " · 🔥 " + streakFor("nums") : "") + "</div></div></button>" +
      '<button class="tile" id="stk"><div class="emoji bg-sun">📒</div><div><div class="t">My sticker book</div><div class="s">' + Object.keys(S.prog.stickers || {}).length + " stickers · keep a streak to win more!</div></div></button>" +
      petsStrip() +
      '<p class="muted center">' + mastered + " words mastered so far 🏆</p>";
    on("#out", "click", function () { if (confirm("Sign out?")) signOut(); });
    on("#spell", "click", function () { go(done ? "spellDone" : "spellStart"); });
    on("#tricky", "click", function () { go("trickyStart"); });
    on("#book", "click", function () { go("book"); });
    on("#nums", "click", function () { go("numbers"); });
    wirePetsStrip();
    on("#stk", "click", function () { go("stickers", { back: function () { go("home"); } }); });
    $$("[data-hw]").forEach(function (b) { b.addEventListener("click", function () { go("hwHub", b.getAttribute("data-hw")); }); });
  };
  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? "Good morning! ☀️" : h < 17 ? "Good afternoon! 🌈" : "Good evening! 🌙";
  }

  // ---------------- spelling: flow ----------------
  var SP = null; // current spelling session

  VIEWS.spellDone = function () {
    var r = S.prog.days[today()].spell;
    $app.innerHTML = topbar("Today's spellings", true) +
      '<div class="card center"><div class="celebrate">🎉</div><h2>You did it today!</h2><p>You scored ' + r.score + " out of " + r.total + '.</p><p class="muted">Your next test is ready tomorrow. Words come back again and again until you know them really well.</p>' +
      '<button class="btn block sun" id="again">Practise again (just for fun)</button></div>';
    wireBack(function () { go("home"); });
    on("#again", "click", function () {
      var keys = Object.keys(S.prog.words).filter(function (k) { return S.prog.words[k].last === today(); });
      startSession({ mode: "practice", news: [], items: shuffle(keys) });
    });
  };

  VIEWS.spellStart = function () {
    var plan = buildDailyTest();
    if (!plan.items.length) {
      $app.innerHTML = topbar("Today's spellings", true) + '<div class="card center"><div class="celebrate">🏆</div><h2>Wow!</h2><p>You have learned every word. Ask a grown-up to add your school spellings.</p></div>';
      return wireBack(function () { go("home"); });
    }
    $app.innerHTML = topbar("Today's spellings", true) +
      '<div class="card center"><div style="font-size:64px">✏️</div><h2>' + plan.items.length + " words today</h2>" +
      (plan.news.length ? "<p>" + plan.news.length + " new word" + (plan.news.length > 1 ? "s" : "") + " to learn first, then the test.</p>" : "<p>All words you have met before. Let's see what you remember!</p>") +
      '<p class="muted">Tap 🔊 to hear each word. Turn your sound on!</p>' +
      '<button class="btn block" id="go">Let\'s go!</button></div>';
    wireBack(function () { go("home"); });
    on("#go", "click", function () { startSession({ mode: "daily", news: plan.news, items: plan.items }); });
  };

  VIEWS.trickyStart = function () {
    var keys = Object.keys(S.prog.words).filter(function (k) { var e = S.prog.words[k]; return e.x > 0 && e.b < 3; })
      .sort(function (a, b) { return S.prog.words[b].x - S.prog.words[a].x; }).slice(0, 8);
    startSession({ mode: "practice", news: keys.slice(), items: shuffle(keys), tricky: true });
  };

  function startSession(plan) {
    SP = { mode: plan.mode, news: plan.news.slice(), learnIndex: 0, queue: plan.items.slice(), total: plan.items.length,
           pos: 0, score: 0, firstTry: {}, retries: {}, wrongWords: [], answered: 0, lastUnit: null, tricky: plan.tricky, hw: plan.hw };
    if (SP.news.length) go("learn"); else go("test");
  }

  // Look, say, cover, write, check — for new (or tricky) words
  VIEWS.learn = function () {
    var key = SP.news[SP.learnIndex];
    var item = wordInfo(key);
    var unit = window.UNIT_INFO[item.unit] || window.UNIT_INFO.tricky;
    var showTip = SP.lastUnit !== item.unit;
    SP.lastUnit = item.unit;
    var stage = "look";
    function render() {
      $app.innerHTML = topbar(SP.tricky ? "Tricky word " + (SP.learnIndex + 1) + " of " + SP.news.length : "New word " + (SP.learnIndex + 1) + " of " + SP.news.length, true) +
        (showTip ? '<div class="tipbox" style="margin-bottom:14px"><b>' + esc(unit.title) + "</b><br>" + esc(unit.tip) + "</div>" : "") +
        '<div class="card center">' +
        '<p class="muted" style="margin:0">' + (stage === "look" ? "👀 Look and say it" : "✍️ Now write it from memory") + "</p>" +
        '<div class="bigword ' + (stage === "write" ? "covered" : "") + '">' + esc(item.word) + "</div>" +
        '<button class="speak" id="say" aria-label="Hear the word">🔊</button>' +
        (item.sentence ? '<p class="sentence">' + (stage === "write" ? blankSentence(item.sentence, item.word) : esc(item.sentence)) + "</p>" : "") +
        (stage === "look"
          ? '<button class="btn block" id="cover">Cover it 🙈</button>'
          : '<input class="spellinput" id="inp" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="type it here"><div id="fb"></div><div style="height:12px"></div><button class="btn block" id="check">Check ✓</button>') +
        "</div>";
      wireBack(function () { if (SP.hw) go("job", SP.hw.ctx); else go("home"); });
      on("#say", "click", function () { speakWord(item); });
      if (stage === "look") {
        on("#cover", "click", function () { stage = "write"; render(); setTimeout(function () { var i = $("#inp"); if (i) i.focus(); }, 50); });
      } else {
        var check = function () {
          var v = $("#inp").value;
          if (!v.trim()) return;
          if (sameWord(v, item.word)) {
            $("#fb").innerHTML = '<div class="feedback good">Brilliant! ⭐</div>';
            setTimeout(next, 900);
          } else {
            $("#fb").innerHTML = '<div class="feedback bad">Nearly! Look again:<div class="letters">' + diffLetters(v, item.word) + "</div></div>";
            stage = "look";
            setTimeout(function () { var b = $("#check"); if (b) { b.textContent = "Look again 👀"; b.onclick = function () { render(); }; } }, 10);
          }
        };
        on("#check", "click", check);
        on("#inp", "keydown", function (e) { if (e.key === "Enter") check(); });
      }
    }
    function next() {
      SP.learnIndex++;
      if (SP.learnIndex < SP.news.length) go("learn"); else go("testIntro");
    }
    render();
    if (stage === "look") setTimeout(function () { speakWord(item); }, 250);
  };

  VIEWS.testIntro = function () {
    $app.innerHTML = topbar("Ready?", false) +
      '<div class="card center"><div style="font-size:64px">🎧</div><h2>Test time!</h2><p>Listen to each word, then type it. No peeking!</p><button class="btn block" id="go">Start the test</button></div>';
    on("#go", "click", function () { go("test"); });
  };

  VIEWS.test = function () {
    if (!SP.queue.length) return go("spellResult");
    var key = SP.queue[0];
    var item = wordInfo(key);
    var isRetry = SP.retries[key] > 0;
    var done = Object.keys(SP.firstTry).length;
    $app.innerHTML = topbar((SP.mode === "daily" ? "Spelling test" : SP.hw ? "Grown-up test" : "Practice") + " · " + Math.min(done + 1, SP.total) + " of " + SP.total, true) +
      '<div class="progressbar"><div style="width:' + Math.round(done / SP.total * 100) + '%"></div></div>' +
      '<div class="card center">' + (isRetry ? '<p class="muted">Let\'s try this one again 💪</p>' : "") +
      '<button class="speak" id="say" aria-label="Hear the word">🔊</button>' +
      (item.sentence ? '<p class="sentence">' + blankSentence(item.sentence, item.word) + "</p>" : '<p class="sentence">Spell the word you hear.</p>') +
      '<input class="spellinput" id="inp" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="type the word">' +
      '<div id="fb"></div><div style="height:12px"></div><button class="btn block" id="check">Check ✓</button></div>';
    wireBack(function () { if (confirm("Stop the test? Your answers so far are saved.")) { save(true); if (SP.hw) go("job", SP.hw.ctx); else go("home"); } });
    on("#say", "click", function () { speakWord(item); setTimeout(function () { var i = $("#inp"); if (i) i.focus(); }, 50); });
    setTimeout(function () { speakWord(item); var i = $("#inp"); if (i) i.focus(); }, 300);

    var answered = false;
    function check() {
      var v = $("#inp").value;
      if (!v.trim() || answered) return;
      answered = true;
      var ok = sameWord(v, item.word);
      var first = !(key in SP.firstTry);
      if (first) {
        SP.firstTry[key] = ok;
        if (ok) { SP.score++; if (SP.mode === "daily") S.prog.stars = (S.prog.stars || 0) + 1; }
        else SP.wrongWords.push(key);
        if (SP.mode === "daily" || SP.hw) { record(key, ok); save(); }
      }
      SP.queue.shift();
      if (ok) {
        var capNote = v.trim() !== item.word && item.word[0] === item.word[0].toUpperCase() ? "<br><small>Remember the capital letter: " + esc(item.word) + "</small>" : "";
        $("#fb").innerHTML = '<div class="feedback good">' + pick(["Yes! ⭐", "Super! 🌟", "Correct! 🎉", "Amazing! ✨", "Well done! 👏"]) + capNote + "</div>";
        $("#check").textContent = "Next →";
        $("#check").onclick = function () { go("test"); };
      } else {
        // copy it correctly while it is shown, then it comes back later
        SP.retries[key] = (SP.retries[key] || 0) + 1;
        if (SP.retries[key] <= 2) SP.queue.splice(Math.min(SP.queue.length, 3), 0, key);
        $("#fb").innerHTML = '<div class="feedback bad">Not quite. It\'s spelt:<div class="letters">' + diffLetters(v, item.word) + "</div>Type it while you look 👀</div>";
        $("#inp").value = ""; $("#inp").placeholder = item.word; $("#inp").focus();
        $("#check").textContent = "I copied it ✓";
        $("#check").onclick = function () {
          if (sameWord($("#inp").value, item.word)) go("test");
          else { $("#inp").value = ""; toast("Copy it carefully, letter by letter."); }
        };
      }
    }
    on("#check", "click", check);
    on("#inp", "keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); $("#check").click(); } });
  };

  VIEWS.spellResult = function () {
    if (SP.hw) return go("hwSpellDone");
    var total = SP.total, score = SP.score;
    var t = today();
    var newBest = false;
    if (SP.mode === "daily") {
      var d = dayRec(t);
      d.spell = { score: score, total: total, wrong: SP.wrongWords.map(function (k) { return wordInfo(k).word; }) };
      S.prog.stars = (S.prog.stars || 0) + 5;
      var st = streak();
      if (st > (S.prog.best || 0)) { S.prog.best = st; newBest = st > 1; }
      save(true);
    }
    var gift = SP.mode === "daily" ? giftCheck("spell") : SP.tricky ? giftCheck("tricky") : null;
    var st2 = streak();
    var pct = total ? score / total : 0;
    var badge = [30, 14, 7, 3].find(function (n) { return st2 === n; });
    $app.innerHTML = topbar("Finished!", false) +
      '<div class="card center"><div class="celebrate">' + (pct === 1 ? "🏆" : pct >= 0.7 ? "🌟" : "💪") + "</div>" +
      '<div class="score">' + score + " / " + total + "</div>" +
      "<p>" + (pct === 1 ? "Perfect! Every word right first time!" : pct >= 0.7 ? "Great spelling!" : "Good try! Practice makes progress.") + "</p>" +
      (SP.mode === "daily" ? '<p><b>🔥 ' + st2 + " day streak!</b>" + (newBest ? " That's your best ever!" : "") + "</p>" : "") +
      (SP.tricky ? '<p><b>🔥 ' + streakFor("tricky") + " day tricky words streak!</b></p>" : "") +
      (badge && SP.mode === "daily" ? '<div class="tipbox">🏅 You earned the <b>' + badge + "-day streak</b> badge!</div>" : "") +
      (SP.wrongWords.length ? '<p style="margin-top:14px">These words will come back tomorrow:</p><div class="chips" style="justify-content:center">' +
        SP.wrongWords.map(function (k) { return '<span class="chip bad">' + esc(wordInfo(k).word) + "</span>"; }).join("") + "</div>" : "") +
      giftButton(gift) +
      '<div style="height:12px"></div><button class="btn block' + (gift && !gift.none ? " ghost" : "") + '" id="home">Back home</button></div>';
    on("#home", "click", function () { go("home"); });
    wireGift(gift, function () { go("home"); });
  };

  // ---------------- book quiz ----------------
  var BK = { photos: [], title: "", quiz: null, i: 0, score: 0 };

  function shrinkImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var max = 1280, w = img.naturalWidth, h = img.naturalHeight;
        var s = Math.min(1, max / Math.max(w, h));
        var c = document.createElement("canvas");
        c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Couldn't open that photo.")); };
      img.src = url;
    });
  }

  VIEWS.book = function () {
    var past = (S.prog.books || []).slice(-3).reverse();
    $app.innerHTML = topbar("My book quiz", true) +
      (S.bookQuiz ? "" : '<div class="tipbox" style="margin-bottom:14px">The book quiz needs a grown-up to switch it on first (see the setup guide).</div>') +
      '<div class="card"><h2>📷 Snap your book</h2><p>Take a photo of the <b>cover</b>. For the best quiz, also snap <b>2 or 3 pages</b> you have read.</p>' +
      '<div class="thumbs" id="thumbs"></div>' +
      '<label class="btn block sun filebtn" style="margin:0">📷 Take a photo<input type="file" id="file" accept="image/*" capture="environment"></label>' +
      '<label class="btn block ghost filebtn" style="margin-top:10px">🖼️ Choose photos<input type="file" id="files" accept="image/*" multiple></label>' +
      '<label for="title">Book name (if you know it)</label><input id="title" value="' + esc(BK.title) + '" placeholder="e.g. The Owl Who Was Afraid of the Dark">' +
      '<div class="err" id="err"></div><div style="height:14px"></div><button class="btn block" id="make">Make my quiz ✨</button></div>' +
      (past.length ? '<div class="card"><h3>My last quizzes</h3>' + past.map(function (b) { return "<p>📘 <b>" + esc(b.title || "My book") + "</b> — " + b.score + "/" + b.total + ' <span class="muted">' + niceDate(b.date) + "</span></p>"; }).join("") + "</div>" : "");
    wireBack(function () { go("home"); });
    function drawThumbs() {
      $("#thumbs").innerHTML = BK.photos.map(function (p, i) { return '<div class="thumb"><img src="' + p + '" alt="Photo ' + (i + 1) + '"><button data-i="' + i + '" aria-label="Remove photo">×</button></div>'; }).join("");
      $$("#thumbs button").forEach(function (b) { b.addEventListener("click", function () { BK.photos.splice(+b.getAttribute("data-i"), 1); drawThumbs(); }); });
    }
    function addFiles(list) {
      var files = Array.prototype.slice.call(list || []);
      var room = 4 - BK.photos.length;
      if (room <= 0) return toast("You can use up to 4 photos.");
      Promise.all(files.slice(0, room).map(shrinkImage)).then(function (urls) {
        BK.photos = BK.photos.concat(urls); drawThumbs();
      }).catch(function (e) { toast(e.message); });
    }
    on("#file", "change", function (e) { addFiles(e.target.files); e.target.value = ""; });
    on("#files", "change", function (e) { addFiles(e.target.files); e.target.value = ""; });
    on("#title", "input", function (e) { BK.title = e.target.value; });
    on("#make", "click", function () {
      if (!BK.photos.length) { $("#err").textContent = "Take a photo of your book first!"; return; }
      $app.innerHTML = topbar("My book quiz", false) + '<div class="card center"><div class="loader"></div><h2>Reading your book…</h2><p class="muted">This takes about 20 seconds.</p></div>';
      api("/book-quiz", { method: "POST", body: { images: BK.photos, title: BK.title } }).then(function (q) {
        if (q.needPages || !q.questions.length) {
          go("book");
          $("#err").textContent = "I don't know this book yet. Please add photos of 2 or 3 pages you've read.";
          return;
        }
        BK.quiz = q; BK.i = 0; BK.score = 0;
        go("bookQ");
      }).catch(function (e) { go("book"); $("#err").textContent = e.message; });
    });
    drawThumbs();
  };

  VIEWS.bookQ = function () {
    var q = BK.quiz, item = q.questions[BK.i];
    var typeLabel = { retrieval: "🔍 Find it", vocabulary: "📖 Word meaning", inference: "🤔 Think about it", prediction: "🔮 Predict", summary: "📝 Sum it up" }[item.type] || "❓ Question";
    $app.innerHTML = topbar((q.title || "My book") + " · " + (BK.i + 1) + "/" + q.questions.length, true) +
      '<div class="progressbar"><div style="width:' + Math.round(BK.i / q.questions.length * 100) + '%"></div></div>' +
      '<div class="card"><div class="row"><span class="chip">' + typeLabel + '</span><div class="spacer"></div><button class="iconbtn" id="say" aria-label="Read it to me">🔊</button></div>' +
      '<h2 style="margin-top:14px">' + esc(item.q) + "</h2>" +
      item.options.map(function (o, i) { return '<button class="choice" data-i="' + i + '">' + esc(o) + "</button>"; }).join("") +
      '<div id="fb"></div></div>';
    wireBack(function () { if (confirm("Stop the quiz?")) go("home"); });
    on("#say", "click", function () { speak(item.q + ". " + item.options.map(function (o, i) { return "Answer " + (i + 1) + ": " + o; }).join(". "), 0.9); });
    $$(".choice").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = +b.getAttribute("data-i");
        var ok = i === item.answer;
        if (ok) BK.score++;
        $$(".choice").forEach(function (c, j) { c.disabled = true; if (j === item.answer) c.classList.add("right"); else if (j === i) c.classList.add("wrong"); });
        $("#fb").innerHTML = '<div class="feedback ' + (ok ? "good" : "bad") + '">' + (ok ? "Yes! ⭐ " : "Not quite. ") + esc(item.explain || "") + "</div>" +
          '<button class="btn block" id="next">' + (BK.i + 1 < q.questions.length ? "Next →" : "See my score") + "</button>";
        on("#next", "click", function () { BK.i++; if (BK.i < q.questions.length) go("bookQ"); else go("bookResult"); });
      });
    });
  };

  VIEWS.bookResult = function () {
    var q = BK.quiz, total = q.questions.length;
    S.prog.books.push({ date: today(), title: q.title || BK.title || "My book", author: q.author || "", score: BK.score, total: total });
    if (S.prog.books.length > 100) S.prog.books = S.prog.books.slice(-100);
    S.prog.stars = (S.prog.stars || 0) + BK.score;
    var d = dayRec(); d.books = (d.books || 0) + 1;
    save(true);
    var pct = BK.score / total;
    $app.innerHTML = topbar("Quiz finished!", false) +
      '<div class="card center"><div class="celebrate">' + (pct >= 0.9 ? "🏆" : pct >= 0.6 ? "📚" : "💪") + '</div><div class="score">' + BK.score + " / " + total + "</div>" +
      "<p>" + (pct >= 0.9 ? "You really understood that book!" : pct >= 0.6 ? "Great reading!" : "Good try! Maybe read it again and have another go.") + "</p>" +
      '<p class="muted">+' + BK.score + ' stars</p><button class="btn block" id="home">Back home</button></div>';
    BK = { photos: [], title: "", quiz: null, i: 0, score: 0 };
    on("#home", "click", function () { go("home"); });
  };

  // ---------------- number families ----------------
  var LEVELS = {
    add: [
      { name: "Bonds to 10", gen: function () { var a = rand(1, 9); return [a, 10 - a, 10]; } },
      { name: "Bonds to 20", gen: function () { var c = rand(11, 20), a = rand(2, c - 2); return [a, c - a, c]; } },
      { name: "Adding tens", gen: function () { var a = rand(1, 8), b = rand(1, 9 - a); return [a * 10, b * 10, (a + b) * 10]; } },
      { name: "Tens and ones", gen: function () { var a; do { a = rand(12, 89); } while (a % 10 === 0); var b = rand(2, Math.min(9, 99 - a)); return [a, b, a + b]; } },
      { name: "Two-digit numbers", gen: function () { var a = rand(11, 78), b = rand(11, 99 - a); return [a, b, a + b]; } }
    ],
    mult: [
      { name: "2, 5 and 10", tables: [2, 5, 10] },
      { name: "3 times table", tables: [3] },
      { name: "4 times table", tables: [4] },
      { name: "8 times table", tables: [8] },
      { name: "All Year 3 tables", tables: [2, 3, 4, 5, 8, 10] }
    ]
  };
  function genFamily(kind, level) {
    if (kind === "add") return LEVELS.add[level].gen();
    var t = pick(LEVELS.mult[level].tables), b = rand(2, 12);
    return Math.random() < 0.5 ? [t, b, t * b] : [b, t, t * b];
  }
  var OPS = { add: ["+", "−"], mult: ["×", "÷"] };
  function factsOf(kind, f) {
    var a = f[0], b = f[1], c = f[2], p = OPS[kind][0], m = OPS[kind][1];
    return [[a, p, b, c], [b, p, a, c], [c, m, a, b], [c, m, b, a]];
  }
  function factText(x) { return x[0] + " " + x[1] + " " + x[2] + " = " + x[3]; }

  function familySvg(kind, f) {
    var c1 = kind === "add" ? "#ff7a59" : "#7b5ea7";
    return '<svg class="family-svg" viewBox="0 0 300 232" role="img" aria-label="Number family ' + f.join(", ") + '">' +
      '<line x1="150" y1="58" x2="70" y2="160" stroke="#d9cbb3" stroke-width="6"/><line x1="150" y1="58" x2="230" y2="160" stroke="#d9cbb3" stroke-width="6"/><line x1="70" y1="160" x2="230" y2="160" stroke="#d9cbb3" stroke-width="6" stroke-dasharray="8 8"/>' +
      '<circle cx="150" cy="52" r="42" fill="' + c1 + '"/><text x="150" y="64" text-anchor="middle" font-family="Lexend" font-weight="800" font-size="' + (f[2] > 99 ? 28 : 34) + '" fill="#fff">' + f[2] + "</text>" +
      '<circle cx="70" cy="160" r="38" fill="#2a9d8f"/><text x="70" y="171" text-anchor="middle" font-family="Lexend" font-weight="800" font-size="30" fill="#fff">' + f[0] + "</text>" +
      '<circle cx="230" cy="160" r="38" fill="#4ea8de"/><text x="230" y="171" text-anchor="middle" font-family="Lexend" font-weight="800" font-size="30" fill="#fff">' + f[1] + "</text>" +
      '<text x="150" y="226" text-anchor="middle" font-family="Lexend" font-size="13" fill="#6b7680">' + (kind === "add" ? "top = the whole · bottom = the parts" : "top = the total · bottom = the two numbers we multiply") + "</text></svg>";
  }
  function pictureSvg(kind, f) {
    if (kind === "add") {
      var W = 300, wa = Math.max(40, Math.round(W * f[0] / f[2])), wb = W - wa;
      return '<svg class="family-svg" viewBox="0 0 300 110" role="img" aria-label="Bar model">' +
        '<rect x="0" y="4" width="300" height="44" rx="10" fill="#ffe1d8" stroke="#ff7a59" stroke-width="3"/><text x="150" y="34" text-anchor="middle" font-family="Lexend" font-weight="800" font-size="22" fill="#23303b">' + f[2] + "</text>" +
        '<rect x="0" y="58" width="' + (wa - 3) + '" height="44" rx="10" fill="#d9f2ee" stroke="#2a9d8f" stroke-width="3"/><text x="' + (wa / 2) + '" y="88" text-anchor="middle" font-family="Lexend" font-weight="800" font-size="22" fill="#23303b">' + f[0] + "</text>" +
        '<rect x="' + (wa + 3) + '" y="58" width="' + (wb - 3) + '" height="44" rx="10" fill="#ddeefa" stroke="#4ea8de" stroke-width="3"/><text x="' + (wa + wb / 2) + '" y="88" text-anchor="middle" font-family="Lexend" font-weight="800" font-size="22" fill="#23303b">' + f[1] + "</text></svg>";
    }
    var rows = f[0], cols = f[1], gap = Math.min(24, Math.floor(290 / Math.max(cols, 1))), r = Math.max(4, gap / 2 - 2);
    var h = rows * gap + 10, dots = "";
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) dots += '<circle cx="' + (10 + x * gap + gap / 2) + '" cy="' + (5 + y * gap + gap / 2) + '" r="' + r + '" fill="' + (y % 2 ? "#7b5ea7" : "#2a9d8f") + '"/>';
    return '<svg class="family-svg" viewBox="0 0 ' + (cols * gap + 20) + " " + h + '" role="img" aria-label="' + rows + " rows of " + cols + '">' + dots + "</svg>" +
      '<p class="muted center">' + rows + " rows of " + cols + " = " + f[2] + " dots. Turn it sideways: " + cols + " rows of " + rows + ".</p>";
  }

  VIEWS.numbers = function () {
    var a = S.prog.maths.add, m = S.prog.maths.mult;
    $app.innerHTML = topbar("Number families", true) +
      '<div class="tipbox" style="margin-bottom:14px">A <b>number family</b> is 3 numbers that belong together. Know one fact and you know <b>four</b>!</div>' +
      familyCard("add", "➕➖", "Add & take away families", a) + familyCard("mult", "✖️➗", "Times & share families", m);
    wireBack(function () { go("home"); });
    $$("[data-learn]").forEach(function (b) { b.addEventListener("click", function () { go("famLearn", b.getAttribute("data-learn")); }); });
    $$("[data-test]").forEach(function (b) { b.addEventListener("click", function () { go("famTest", b.getAttribute("data-test")); }); });
    $$(".lvl").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-k"), l = +b.getAttribute("data-l");
        S.prog.maths[k].level = l; save(); go("numbers");
      });
    });
  };
  function familyCard(kind, emoji, title, m) {
    var last = m.history.filter(function (h) { return h.level === m.level; }).slice(-1)[0];
    return '<div class="card"><h2>' + emoji + " " + title + "</h2>" +
      '<div class="levels">' + LEVELS[kind].map(function (L, i) {
        return '<button class="lvl ' + (i === m.level ? "on" : "") + '" data-k="' + kind + '" data-l="' + i + '" ' + (i > m.unlocked ? "disabled" : "") + ">" + (i > m.unlocked ? "🔒 " : "") + (i + 1) + ". " + L.name + "</button>";
      }).join("") + "</div>" +
      (last ? '<p class="muted">Last test at this level: ' + last.score + "/" + last.total + "</p>" : '<p class="muted">Get 9 or 10 out of 10 twice to unlock the next level.</p>') +
      '<div class="row"><button class="btn ghost" data-learn="' + kind + '" style="flex:1">💡 Learn</button><button class="btn" data-test="' + kind + '" style="flex:1">✏️ Test</button></div></div>';
  }

  VIEWS.famLearn = function (kind) {
    var m = S.prog.maths[kind];
    var f = genFamily(kind, m.level);
    var shown = 0;
    var facts = factsOf(kind, f);
    var intro = kind === "add"
      ? "<p>The <b>two parts</b> join together to make the <b>whole</b>.</p><p>➕ Part + part = whole. You can add them either way round!</p><p>➖ Whole − one part = the other part.</p>"
      : "<p>Two numbers <b>multiply</b> to make the <b>total</b>.</p><p>✖️ You can multiply either way round!</p><p>➗ Total ÷ one number = the other number. Dividing means sharing into equal groups.</p>";
    function render() {
      $app.innerHTML = topbar(kind === "add" ? "Add & take away families" : "Times & share families", true) +
        '<div class="card">' + intro + "</div>" +
        '<div class="card center"><h3>The ' + f.join(", ") + " family</h3>" + familySvg(kind, f) +
        '<div class="facts">' + facts.map(function (x, i) { return '<div class="fact ' + (i < shown ? "show" : "") + '">' + factText(x) + "</div>"; }).join("") + "</div>" +
        (shown < 4 ? '<button class="btn block sun" id="more">Show fact ' + (shown + 1) + " of 4</button>" : '<p><b>4 facts from 1 family! 🎉</b></p>') +
        '<div style="height:14px"></div>' + pictureSvg(kind, f) +
        '<div style="height:10px"></div><div class="row"><button class="btn ghost" id="new" style="flex:1">🔄 New family</button><button class="btn" id="test" style="flex:1">I\'m ready ✏️</button></div></div>';
      wireBack(function () { go("numbers"); });
      on("#more", "click", function () { var fx = facts[shown]; shown++; render(); speak(sayFact(kind, fx), 0.9); });
      on("#new", "click", function () { f = genFamily(kind, m.level); facts = factsOf(kind, f); shown = 0; render(); });
      on("#test", "click", function () { go("famTest", kind); });
    }
    render();
  };
  function sayFact(kind, x) {
    var w = { "+": "add", "−": "take away", "×": "times", "÷": "divided by" };
    return x[0] + " " + w[x[1]] + " " + x[2] + " equals " + x[3];
  }

  function makeQuestions(kind, level) {
    var qs = [], used = {};
    var types = shuffle(["miss", "miss", "miss", "miss", "miss", "miss", "if", "if", "not", "not"]);
    types.forEach(function (type) {
      var f, tries = 0;
      do { f = genFamily(kind, level); tries++; } while (used[f.slice().sort().join(",")] && tries < 20);
      used[f.slice().sort().join(",")] = 1;
      var facts = factsOf(kind, f);
      if (type === "miss") {
        var fx = pick(facts), hide = pick([0, 2, 3]);
        qs.push({ type: type, f: f, fact: fx, hide: hide, answer: fx[hide] });
      } else if (type === "if") {
        var given = pick(facts.slice(0, 2)), ask = pick(facts.slice(2));
        qs.push({ type: type, f: f, given: given, ask: ask, answer: ask[3] });
      } else {
        var wrong = Math.random() < 0.5
          ? [f[2], OPS[kind][0], f[0], f[1]]
          : (function () { var x = pick(facts).slice(); var d = kind === "add" ? pick([1, 2, 10]) : pick([1, 2]); x[3] = x[3] + (Math.random() < 0.5 && x[3] > d ? -d : d); return x; })();
        var opts = shuffle(shuffle(facts).slice(0, 3).concat([wrong]));
        qs.push({ type: type, f: f, options: opts, answer: opts.indexOf(wrong) });
      }
    });
    return qs;
  }

  var FT = null;
  VIEWS.famTest = function (kind) {
    var m = S.prog.maths[kind];
    FT = { kind: kind, level: m.level, qs: makeQuestions(kind, m.level), i: 0, score: 0 };
    go("famQ");
  };
  VIEWS.famQ = function () {
    var q = FT.qs[FT.i], kind = FT.kind;
    var body;
    if (q.type === "miss") {
      body = '<p class="muted center">Find the missing number</p><div class="eq">' + q.fact.map(function (x, i) {
        var tok = i === q.hide ? '<span class="box">?</span>' : esc(x);
        return i === 2 ? tok + " =" : tok;
      }).join(" ") + "</div>";
    } else if (q.type === "if") {
      body = '<p class="center">If you know</p><div class="eq" style="font-size:28px">' + esc(factText(q.given)) + '</div><p class="center">then what is</p><div class="eq">' + esc(q.ask[0] + " " + q.ask[1] + " " + q.ask[2]) + ' = <span class="box">?</span></div>';
    } else {
      body = '<p class="center">Which fact is <b>NOT</b> in the <b>' + q.f.join(", ") + "</b> family?</p>" +
        q.options.map(function (o, i) { return '<button class="choice center" data-i="' + i + '" style="font-size:22px;font-weight:700">' + esc(factText(o)) + "</button>"; }).join("");
    }
    $app.innerHTML = topbar((kind === "add" ? "➕➖ " : "✖️➗ ") + "Question " + (FT.i + 1) + " of 10", true) +
      '<div class="progressbar"><div style="width:' + (FT.i * 10) + '%"></div></div><div class="card">' + body +
      (q.type !== "not" ? '<input id="ans" class="spellinput" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="?"><div style="height:12px"></div><button class="btn block" id="check">Check ✓</button>' : "") +
      '<div id="fb"></div></div>';
    wireBack(function () { if (confirm("Stop the test?")) go("numbers"); });
    function done(ok, shown) {
      if (ok) { FT.score++; S.prog.stars = (S.prog.stars || 0) + 1; }
      var expl = "The family is " + q.f.join(", ") + ". " + factsOf(kind, q.f).map(factText).join(" · ");
      $("#fb").innerHTML = '<div class="feedback ' + (ok ? "good" : "bad") + '">' + (ok ? pick(["Correct! ⭐", "Brilliant! 🌟", "Yes! 🎉"]) : "The answer is " + esc(shown) + ".") +
        '<br><small style="font-weight:500">' + esc(expl) + "</small></div>" +
        '<button class="btn block" id="next">' + (FT.i < 9 ? "Next →" : "See my score") + "</button>";
      var c = $("#check"); if (c) c.remove();
      on("#next", "click", function () { FT.i++; if (FT.i < FT.qs.length) go("famQ"); else go("famResult"); });
      $("#next").focus();
    }
    if (q.type === "not") {
      $$(".choice").forEach(function (b) {
        b.addEventListener("click", function () {
          var i = +b.getAttribute("data-i");
          $$(".choice").forEach(function (c, j) { c.disabled = true; if (j === q.answer) c.classList.add("right"); else if (j === i) c.classList.add("wrong"); });
          done(i === q.answer, factText(q.options[q.answer]));
        });
      });
    } else {
      setTimeout(function () { var a = $("#ans"); if (a) a.focus(); }, 50);
      var check = function () {
        var v = $("#ans").value.trim();
        if (v === "") return;
        $("#ans").disabled = true;
        done(parseInt(v, 10) === q.answer, String(q.answer));
      };
      on("#check", "click", check);
      on("#ans", "keydown", function (e) { if (e.key === "Enter") check(); });
    }
  };
  VIEWS.famResult = function () {
    var kind = FT.kind, m = S.prog.maths[kind];
    m.history.push({ date: today(), level: FT.level, score: FT.score, total: 10 });
    if (m.history.length > 200) m.history = m.history.slice(-200);
    var unlocked = false;
    if (FT.score >= 9) {
      m.passes[FT.level] = (m.passes[FT.level] || 0) + 1;
      if (m.passes[FT.level] >= 2 && FT.level === m.unlocked && m.unlocked < LEVELS[kind].length - 1) {
        m.unlocked++; m.level = m.unlocked; unlocked = true;
      }
    }
    var d = dayRec(); d.maths = (d.maths || []).concat([{ kind: kind, level: FT.level, score: FT.score }]);
    save(true);
    var gift = giftCheck("nums");
    var need = FT.score >= 9 && !unlocked && FT.level === m.unlocked && m.unlocked < LEVELS[kind].length - 1 ? 2 - (m.passes[FT.level] || 0) : 0;
    $app.innerHTML = topbar("Finished!", false) +
      '<div class="card center"><div class="celebrate">' + (unlocked ? "🔓" : FT.score >= 9 ? "🌟" : FT.score >= 6 ? "👍" : "💪") + '</div><div class="score">' + FT.score + " / 10</div>" +
      (unlocked ? "<p><b>New level unlocked: " + esc(LEVELS[kind][m.level].name) + "!</b></p>" : "") +
      (need > 0 ? "<p>One more score of 9 or 10 to unlock the next level!</p>" : "") +
      (FT.score < 6 ? "<p>Try the 💡 Learn page, then have another go.</p>" : "") +
      '<p><b>🔥 ' + streakFor("nums") + " day number families streak!</b></p>" + giftButton(gift) + '<div style="height:12px"></div>' +
      '<div class="row"><button class="btn ghost" id="again" style="flex:1">Again</button><button class="btn" id="back2" style="flex:1">Done</button></div></div>';
    on("#again", "click", function () { go("famTest", kind); });
    on("#back2", "click", function () { go("numbers"); });
    wireGift(gift, function () { go("numbers"); });
  };

  // ---------------- parent ----------------
  var PD = { children: [] };
  VIEWS.parent = function () {
    $app.innerHTML = topbar("Parent dashboard", false) + '<div class="loader"></div>';
    api("/dashboard").then(function (r) {
      PD.children = r.children.map(function (c) { c.progress = normaliseProgressCopy(c.progress); return c; });
      renderParent();
    }).catch(function (e) { if (e.status === 401) return signOut(); $app.innerHTML = '<div class="card">' + esc(e.message) + "</div>"; });
  };
  function normaliseProgressCopy(p) { return normaliseProgress(JSON.parse(JSON.stringify(p || {}))); }
  function childStreak(p) {
    var d = today();
    if (!(p.days[d] && p.days[d].spell)) d = addDays(d, -1);
    var n = 0; while (p.days[d] && p.days[d].spell) { n++; d = addDays(d, -1); }
    return n;
  }
  function lastActive(p) {
    var ds = Object.keys(p.days).sort();
    return ds.length ? ds[ds.length - 1] : null;
  }
  function renderParent() {
    $app.innerHTML = '<div class="topbar"><div class="title">Parent dashboard</div><button class="iconbtn" id="out" aria-label="Sign out">⏻</button></div>' +
      PD.children.map(function (c) {
        var p = c.progress, st = childStreak(p), la = lastActive(p);
        var words = Object.keys(p.words), mastered = words.filter(function (k) { return p.words[k].b >= MASTERED; }).length;
        var doneToday = p.days[today()] && p.days[today()].spell;
        return '<button class="tile" data-id="' + esc(c.id) + '"><div class="emoji bg-sun">🦊</div><div><div class="t">' + esc(c.name) + "</div>" +
          '<div class="s">🔥 ' + st + " day streak · " + mastered + " mastered · " + words.length + " started<br>" +
          (la ? "Last active " + (la === today() ? "today" : niceDate(la)) : "Not started yet") + "</div></div>" +
          (doneToday ? '<span class="badge">✓ Today</span>' : '<span class="badge" style="background:#fff1c7;color:#8a6a00">Not yet</span>') + "</button>";
      }).join("") +
      '<div class="card"><h3>Family</h3><div class="row wrap"><button class="btn small" id="addc">➕ Add a child</button><button class="btn small ghost" id="ppin">Change parent PIN</button></div></div>';
    on("#out", "click", function () { signOut(); });
    $$(".tile[data-id]").forEach(function (b) { b.addEventListener("click", function () { go("parentChild", b.getAttribute("data-id")); }); });
    on("#addc", "click", function () {
      var name = prompt("Child's name?"); if (!name) return;
      var pin = prompt("Choose a PIN for " + name + " (4–8 numbers)"); if (!pin) return;
      api("/parent/child", { method: "POST", body: { name: name, pin: pin } }).then(function () { toast("Added " + name); go("parent"); }).catch(function (e) { alert(e.message); });
    });
    on("#ppin", "click", function () {
      var pin = prompt("New parent PIN (4–8 numbers)"); if (!pin) return;
      api("/parent/pin", { method: "PUT", body: { pin: pin } }).then(function () { toast("Parent PIN changed"); }).catch(function (e) { alert(e.message); });
    });
  }

  VIEWS.parentChild = function (id) {
    var c = PD.children.find(function (x) { return x.id === id; });
    if (!c) return go("parent");
    var p = c.progress, words = Object.keys(p.words);
    var boxes = [0, 0, 0]; // learning, getting there, mastered
    words.forEach(function (k) { var b = p.words[k].b; boxes[b >= MASTERED ? 2 : b >= 3 ? 1 : 0]++; });
    var notStarted = Math.max(0, ORDER.length - words.filter(function (k) { return ORDER_MAP[k]; }).length);
    var totalBar = words.length + notStarted || 1;
    var cal = ""; for (var i = 13; i >= 0; i--) { var d = addDays(today(), -i); cal += '<div class="' + (p.days[d] && p.days[d].spell ? "on" : "") + '" title="' + d + '"></div>'; }
    var trickiest = words.filter(function (k) { return p.words[k].x > 0; }).sort(function (a, b) { return p.words[b].x - p.words[a].x; }).slice(0, 10);
    var tests = Object.keys(p.days).filter(function (d) { return p.days[d].spell; }).sort().reverse().slice(0, 7);
    var cs = p.settings || {};
    var schoolText = (p.school || []).map(function (s) { return s.word + (s.sentence ? " | " + s.sentence : ""); }).join("\n");
    var mathRow = function (k, label) {
      var m = p.maths[k], last = m.history.slice(-3).reverse();
      return "<tr><td>" + label + "</td><td>Level " + (m.level + 1) + ": " + esc(LEVELS[k][m.level].name) + "</td><td>" + (last.length ? last.map(function (h) { return h.score + "/10"; }).join(", ") : "—") + "</td></tr>";
    };
    $app.innerHTML = topbar(c.name, true) +
      '<div class="stats"><div class="stat"><div class="big">🔥 ' + childStreak(p) + '</div><div class="lbl">day streak · best ' + (p.best || 0) + '</div></div><div class="stat"><div class="big">⭐ ' + (p.stars || 0) + '</div><div class="lbl">stars</div></div></div>' +
      '<div class="card"><h3>✏️ Spellings</h3><p class="muted">Last 14 days</p><div class="cal">' + cal + "</div>" +
      '<div class="boxbar" style="margin-top:14px"><span style="width:' + (boxes[2] / totalBar * 100) + '%;background:#2bb673"></span><span style="width:' + (boxes[1] / totalBar * 100) + '%;background:#ffc93c"></span><span style="width:' + (boxes[0] / totalBar * 100) + '%;background:#ff7a59"></span></div>' +
      '<div class="legend"><span><i style="background:#2bb673"></i>Mastered ' + boxes[2] + '</span><span><i style="background:#ffc93c"></i>Getting there ' + boxes[1] + '</span><span><i style="background:#ff7a59"></i>Learning ' + boxes[0] + '</span><span><i style="background:#f1e8d8"></i>Not started ' + notStarted + "</span></div>" +
      (tests.length ? '<table style="margin-top:12px"><tr><th>Day</th><th>Score</th><th>Missed</th></tr>' + tests.map(function (d) { var r = p.days[d].spell; return "<tr><td>" + niceDate(d) + "</td><td>" + r.score + "/" + r.total + "</td><td>" + esc((r.wrong || []).join(", ")) + "</td></tr>"; }).join("") + "</table>" : '<p class="muted" style="margin-top:12px">No tests yet.</p>') +
      (trickiest.length ? '<p style="margin-top:12px"><b>Trickiest words</b></p><div class="chips">' + trickiest.map(function (k) { return '<span class="chip bad">' + esc(p.words[k].w) + " ✗" + p.words[k].x + "</span>"; }).join("") + "</div>" : "") +
      "</div>" +
      '<div class="card"><h3>🏫 This week\'s school spellings</h3><p class="muted">Type the words from Heathland\'s homework sheet, one per line. These are taught first and tested every day until known. Add a sentence after a | if you like.</p>' +
      '<textarea id="school" placeholder="neighbour | Our neighbour has a fluffy dog.&#10;weight&#10;eight">' + esc(schoolText) + "</textarea>" +
      '<div style="height:10px"></div><button class="btn block" id="saveSchool">Save school spellings</button></div>' +
      '<div class="card"><h3>⚙️ Daily test</h3><div class="row"><div style="flex:1"><label>New words a day</label><select id="npd">' +
      [1, 2, 3, 4, 5, 6].map(function (n) { return "<option " + ((cs.newPerDay || 3) === n ? "selected" : "") + ">" + n + "</option>"; }).join("") + '</select></div><div style="flex:1"><label>Words per test</label><select id="tl">' +
      [6, 8, 10, 12, 15, 20].map(function (n) { return "<option " + ((cs.testLen || 10) === n ? "selected" : "") + ">" + n + "</option>"; }).join("") + "</select></div></div>" +
      '<label>Start new words from</label><select id="sw"><option value="">Autumn 1 · Week 1 (the beginning)</option>' +
      window.SPELLING_WEEKS.map(function (wk) { return '<option value="' + wk.id + '" ' + (cs.startWeek === wk.id ? "selected" : "") + ">" + esc(wk.term + " · Week " + wk.week + ": " + wk.title) + "</option>"; }).join("") +
      '</select><p class="muted" style="margin-top:6px">Earlier weeks are still taught afterwards.</p>' +
      '<div style="height:10px"></div><button class="btn block ghost" id="saveSet">Save</button></div>' +
      '<div class="card"><h3>📖 Book quizzes</h3>' + (p.books.length ? "<table><tr><th>Date</th><th>Book</th><th>Score</th></tr>" + p.books.slice(-10).reverse().map(function (b) { return "<tr><td>" + niceDate(b.date) + "</td><td>" + esc(b.title) + "</td><td>" + b.score + "/" + b.total + "</td></tr>"; }).join("") + "</table>" : '<p class="muted">No book quizzes yet.</p>') + "</div>" +
      parentHomework(p) +
      '<div class="card"><h3>🔢 Number families</h3><table><tr><th></th><th>Level</th><th>Recent</th></tr>' + mathRow("add", "➕➖") + mathRow("mult", "✖️➗") + "</table></div>" +
      '<div class="card"><h3>Manage</h3><div class="row wrap"><button class="btn small ghost" id="rename">Rename</button><button class="btn small ghost" id="pin">Reset PIN</button><button class="btn small ghost" id="reset">Reset progress</button><button class="btn small danger" id="del">Remove</button></div></div>';
    wireBack(function () { go("parent"); });
    var put = function (body, msg) {
      return api("/parent/child/" + id, { method: "PUT", body: body }).then(function () { toast(msg); go("parent"); }).catch(function (e) { alert(e.message); });
    };
    on("#saveSchool", "click", function () {
      var list = $("#school").value.split(/\n|,/).map(function (line) {
        var parts = line.split("|");
        return { word: (parts[0] || "").trim(), sentence: (parts[1] || "").trim() };
      }).filter(function (x) { return x.word; });
      put({ school: list }, "School spellings saved");
    });
    on("#saveSet", "click", function () { put({ settings: { newPerDay: +$("#npd").value, testLen: +$("#tl").value, startWeek: $("#sw").value } }, "Saved"); });
    on("#rename", "click", function () { var n = prompt("New name", c.name); if (n) put({ name: n }, "Renamed"); });
    on("#pin", "click", function () { var n = prompt("New PIN for " + c.name + " (4–8 numbers)"); if (n) put({ pin: n }, "PIN changed"); });
    on("#reset", "click", function () { if (confirm("Reset all of " + c.name + "'s progress? This can't be undone.")) put({ resetProgress: true }, "Progress reset"); });
    on("#del", "click", function () {
      if (!confirm("Remove " + c.name + " and all their progress?")) return;
      api("/parent/child/" + id, { method: "DELETE" }).then(function () { toast("Removed"); go("parent"); }).catch(function (e) { alert(e.message); });
    });
  };

  // ---------------- homework ----------------
  (window.HOMEWORK || []).forEach(function (hw) {
    (hw.missions || []).forEach(function (m) {
      if (m.type === "spelling") window.UNIT_INFO[hw.id + ":" + m.id] = { title: m.title, tip: m.tip };
    });
    if (hw.spelling) window.UNIT_INFO[hw.id + ":spell"] = { title: "Spellings from " + niceDate(hw.due), tip: hw.spelling.tip };
  });
  var COLOURS = { teal: ["#d9f2ee", "#2a9d8f"], sky: ["#ddeefa", "#3b8fc4"], coral: ["#ffe1d8", "#ff7a59"], plum: ["#ebe3f6", "#7b5ea7"], sun: ["#fff1c7", "#d9a61f"] };
  function hwById(id) { return (window.HOMEWORK || []).find(function (h) { return h.id === id; }); }
  function hwState(hwId) { S.prog.hw = S.prog.hw || {}; return S.prog.hw[hwId] || (S.prog.hw[hwId] = {}); }
  function mState(hwId, mId) { var h = hwState(hwId); return h[mId] || (h[mId] = {}); }
  // A homework job has two steps: practise in the app (ms.done) and do it on paper (ms.paper).
  // The job only counts as finished once it is done on paper.
  // Weeks handed in before the paper step existed count as done on paper once practised.
  function onPaper(hw, ms) { return !!(ms && (ms.paper || (ms.done && hw.due < "2026-11-22"))); }
  function hwDoneCount(hw, st) { return hwMissions(hw).filter(function (m) { return st && onPaper(hw, st[m.id]); }).length; }
  function daysUntil(d) { return Math.round((new Date(d + "T12:00") - new Date(today() + "T12:00")) / 86400000); }
  function dueText(due) {
    var n = daysUntil(due);
    return n > 1 ? "Hand in " + niceDate(due) + " · " + n + " days to go" : n === 1 ? "Hand in tomorrow!" : n === 0 ? "Hand in today!" : "Handed in " + niceDate(due);
  }
  function homeworkTiles() {
    return activeHomework().map(function (hw) {
      var st = (S.prog.hw || {})[hw.id], d = hwDoneCount(hw, st), n = hwMissions(hw).length;
      return '<button class="tile hwtile" data-hw="' + esc(hw.id) + '"><div class="emoji bg-plum">📝</div><div style="flex:1"><div class="t">Homework: ' + esc(hw.title) + '</div><div class="s">' + dueText(hw.due) + "</div>" +
        '<div class="hwdots">' + hwMissions(hw).map(function (m) { return '<span class="' + (st && onPaper(hw, st[m.id]) ? "on" : "") + '">' + m.emoji + "</span>"; }).join("") + "</div></div>" +
        (d === n ? '<span class="badge">⭐ Done</span>' : '<span class="badge" style="background:#ebe3f6;color:#5d4583">' + d + "/" + n + "</span>") + "</button>";
    }).join("");
  }

  VIEWS.hwHub = function (hwId) {
    var hw = hwById(hwId); if (!hw) return go("home");
    var st = hwState(hwId), d = hwDoneCount(hw, st), n = hwMissions(hw).length;
    var nextId = (hwMissions(hw).find(function (m) { return !(st[m.id] && st[m.id].paper); }) || {}).id;
    var bonus = hwBonus(hw);
    $app.innerHTML = topbar("My homework", true) +
      '<div class="hwhead"><div class="t">📝 ' + esc(hw.title) + "</div><div>" + dueText(hw.due) + "</div>" +
      '<div class="progressbar light"><div style="width:' + Math.round(d / n * 100) + '%"></div></div><div class="small">' + d + " of " + n + " jobs done on paper" + (d === n ? " 🎉" : "") + "</div></div>" +
      eggCard(hw, st, d, n) +
      (d === n ? '<div class="tipbox" style="margin-bottom:14px">🏆 <b>Homework hero!</b> Pack your homework book in your bag.</div>' : "") +
      hwMissions(hw).map(function (m, i) {
        var c = COLOURS[m.colour] || COLOURS.teal, ms = st[m.id] || {}, isNext = m.id === nextId;
        return '<button class="job ' + (ms.paper ? "done " : "") + (isNext ? "next" : "") + '" data-m="' + esc(m.id) + '" style="--mc:' + c[1] + ";--mb:" + c[0] + '">' +
          (isNext ? '<div class="ribbon">Start here 👉</div>' : "") +
          '<div class="jtop"><div class="jnum">' + (ms.paper ? "⭐" : i + 1) + '</div><div class="memoji">' + m.emoji + '</div><div style="flex:1"><div class="t">' + esc(m.title) + '</div><div class="s">15 minutes</div></div></div>' +
          '<div class="jsteps"><span class="' + (ms.done ? "on" : "") + '">' + (ms.done ? "✓" : "📱") + " Practise</span><span class=\"" + (ms.paper ? "on" : "") + '">' + (ms.paper ? "✓" : "✏️") + " On paper</span></div></button>";
      }).join("") +
      (bonus ? '<button class="job bonusjob" data-bonus="1"><div class="jtop"><div class="memoji">' + bonus.emoji + '</div><div style="flex:1"><div class="t">Bonus: ' + bonus.title + '</div><div class="s">Not homework · just for extra stars</div></div><div class="mgo">›</div></div></button>' : "");
    wireBack(function () { go("home"); });
    on("#hatch", "click", function () { go("hatch", hwId); });
    on("#play", "click", function () { go("petGame", { pet: petFor(hwId).id, name: (st.pet && st.pet.name) || "My pet", back: function () { go("hwHub", hwId); } }); });
    on("[data-bonus]", "click", function () { go("hw_review", { hw: hw, m: bonus }); });
    $$("[data-m]").forEach(function (b) {
      b.addEventListener("click", function () { go("job", { hw: hw, m: hwMissions(hw).find(function (x) { return x.id === b.getAttribute("data-m"); }) }); });
    });
  };
  function realMission(ctx) { return hwMissions(ctx.hw).find(function (x) { return x.id === ctx.m.id; }) || ctx.m; }
  function paperDetail(m) {
    var h = "";
    if (m.type === "spelling") h += '<div class="chips paperwords">' + m.words.map(function (w) { return '<span class="chip">' + esc(w[0]) + "</span>"; }).join("") + "</div>";
    if (m.type === "colsub" || m.type === "coladd") h += '<div class="papersums">' + m.sums.map(function (x, i) { return "<span><small>" + (i + 1) + ".</small> " + x[0] + (m.type === "coladd" ? " + " : " − ") + x[1] + " =</span>"; }).join("") + "</div>";
    if (m.type === "handwriting") h += '<p class="paperpara">' + esc(m.paragraph) + "</p>";
    return h;
  }
  VIEWS.job = function (ctx) {
    ctx = { hw: ctx.hw, m: realMission(ctx) };
    var m = ctx.m, ms = mState(ctx.hw.id, m.id);
    $app.innerHTML = topbar(m.emoji + " " + m.title, true) +
      '<p class="center muted" style="margin:-6px 0 12px">About 15 minutes · 2 steps</p>' +
      '<div class="stepcard s1 ' + (ms.done ? "done" : "") + '"><div class="sh"><span class="sn">1</span><div><b>📱 Practise here</b><small>about 5 minutes</small></div>' + (ms.done ? '<span class="sok">✓ Done</span>' : "") + "</div>" +
      "<p>" + esc(m.practice || m.sub) + "</p>" +
      '<button class="btn block ' + (ms.done ? "ghost" : "") + '" id="prac">' + (ms.done ? "Practise again ↻" : "Start practising ▶") + "</button></div>" +
      '<div class="stepdown">⬇️</div>' +
      '<div class="stepcard s2 ' + (ms.paper ? "done" : "") + '"><div class="sh"><span class="sn">2</span><div><b>✏️ Now do it on paper</b><small>about 10 minutes · in your homework book</small></div>' + (ms.paper ? '<span class="sok">✓ Done</span>' : "") + "</div>" +
      "<p><b>" + esc(m.paper || "Do this part of your homework in your book.") + "</b></p>" + paperDetail(m) +
      '<p class="muted">When you have finished, show a grown-up.</p>' +
      (ms.paper ? '<button class="btn block ghost" id="unpaper">Oops, not finished yet</button>'
        : (!ms.done ? '<p class="nudge">Tip: do step 1 first, so you are ready!</p>' : "") + '<button class="btn block sun" id="paper">I\'ve done it on paper ✓</button>') +
      "</div>";
    wireBack(function () { go("hwHub", ctx.hw.id); });
    on("#prac", "click", function () { go("hw_" + m.type, ctx); });
    on("#paper", "click", function () {
      ms.paper = true; ms.paperDate = today();
      S.prog.stars = (S.prog.stars || 0) + 3; save(true);
      var st = hwState(ctx.hw.id), d = hwDoneCount(ctx.hw, st), n = hwMissions(ctx.hw).length;
      $app.innerHTML = topbar("Well done! ⭐", false) + '<div class="card center"><div class="celebrate">✏️</div><h2>Brilliant work!</h2><p><b>' + esc(m.title) + "</b> is finished. +3 stars ⭐</p>" +
        '<p class="big2">' + (d === n ? "That's all your homework! Your egg is ready to hatch! 🥚" : d + " of " + n + " jobs done. Your egg grew! 🥚") + "</p>" +
        '<button class="btn block sun" id="hub">' + (d === n ? "Hatch my egg 🐣" : "Next job →") + "</button></div>";
      speak("Brilliant work!", 0.95);
      on("#hub", "click", function () { go("hwHub", ctx.hw.id); });
    });
    on("#unpaper", "click", function () { ms.paper = false; save(true); go("job", ctx); });
  };
  function finishMission(ctx, data, stars) {
    var ms = mState(ctx.hw.id, ctx.m.id);
    var first = !ms.done;
    Object.keys(data || {}).forEach(function (k) { ms[k] = data[k]; });
    ms.done = true; ms.date = today();
    if (first && stars) S.prog.stars = (S.prog.stars || 0) + stars;
    var d = dayRec(); d.hw = (d.hw || 0) + 1;
    save(true);
  }
  function missionDone(ctx, html) {
    var bonus = ctx.m.type === "review";
    $app.innerHTML = topbar(bonus ? "Bonus done! ⭐" : "Practice done! ⭐", false) +
      '<div class="card center"><div class="celebrate">' + ctx.m.emoji + "</div>" + html +
      (bonus ? '<div style="height:14px"></div><button class="btn block" id="hub">Back to my homework</button>'
        : '<div class="paper big">✏️ <b>Step 2:</b> now do it on paper in your homework book.</div><div style="height:12px"></div><button class="btn block sun" id="hub">Go to step 2 ✏️</button>') + "</div>";
    on("#hub", "click", function () { if (bonus) go("hwHub", ctx.hw.id); else go("job", ctx); });
  }
  function mTop(ctx, extra) { return topbar(ctx.m.emoji + " " + (extra || ctx.m.title), true); }
  function backToHub(ctx) { wireBack(function () { if (ctx.m.type === "review") go("hwHub", ctx.hw.id); else go("job", ctx); }); }
  function focusSoon(sel) { setTimeout(function () { var i = $(sel); if (i) i.focus(); }, 60); }

  // ----- spelling mission -----
  VIEWS.hw_spelling = function (ctx) {
    var ms = mState(ctx.hw.id, ctx.m.id);
    $app.innerHTML = mTop(ctx, "Practise") +
      '<div class="tipbox" style="margin-bottom:14px">💡 ' + esc(ctx.m.tip) + "</div>" +
      '<div class="card center"><p><b>Your ' + ctx.m.words.length + ' words.</b> Tap one to hear it.</p><div class="chips" style="justify-content:center">' + ctx.m.words.map(function (w) {
        return '<button class="chip big say" data-w="' + esc(w[0]) + '">' + (ctx.m.mark ? esc(w[0]).replace(ctx.m.mark, "<u>" + ctx.m.mark + "</u>") : esc(w[0])) + "</button>";
      }).join("") + "</div>" +
      '<div style="height:16px"></div><button class="btn block" id="test">Spelling test 🎧 (' + ctx.m.words.length + " words)</button>" +
      (ms.score != null ? '<p class="muted" style="margin-top:8px">Best so far: ' + (ms.best || ms.score) + " / " + ms.total + "</p>" : "") + "</div>" +
      (ctx.m.pairs ? '<button class="mission small" id="pairs" style="--mc:#7b5ea7;--mb:#ebe3f6"><div class="memoji">🤔</div><div style="flex:1"><div class="t">Bonus game: Which one?</div><div class="s">Sound-alike words' + (ms.pairs != null ? " · best " + ms.pairs : "") + '</div></div><div class="mgo">›</div></button>' : "");
    backToHub(ctx);
    on("#pairs", "click", function () { go("pairGame", { ctx: ctx }); });
    $$(".say").forEach(function (b) { b.addEventListener("click", function () { speak(b.getAttribute("data-w")); }); });
    var keys = ctx.m.words.map(function (w) { return wordKey(w[0]); });
    on("#test", "click", function () { startSession({ mode: "hw", news: [], items: shuffle(keys), hw: { hwId: ctx.hw.id, ctx: ctx } }); });
  };
  VIEWS.hwSpellDone = function () {
    var ctx = SP.hw.ctx, score = SP.score, total = SP.total;
    var ms = mState(ctx.hw.id, ctx.m.id);
    finishMission(ctx, { score: score, total: total, best: Math.max(ms.best || 0, score), wrong: SP.wrongWords.map(function (k) { return wordInfo(k).word; }) }, score);
    missionDone(ctx, '<div class="score">' + score + " / " + total + "</div><p>" +
      (score === total ? "Perfect! You got every word right!" : score >= 7 ? "Great spelling!" : "Good try! Practise a bit more and try again.") + "</p>" +
      (SP.wrongWords.length ? '<div class="chips" style="justify-content:center">' + SP.wrongWords.map(function (k) { return '<span class="chip bad">' + esc(wordInfo(k).word) + "</span>"; }).join("") +
        '</div><p class="muted">These will come back in your daily spellings.</p>' : ""));
  };

  // ----- column subtraction mission -----
  var PLACE = ["ones", "tens", "hundreds"], PLACE1 = ["one", "ten", "hundred"];
  // Practise 3 sums in the app: the ones with the most exchanging or carrying.
  function practiceSums(m) {
    var all = m.allSums || m.sums, add = m.type === "coladd";
    var hard = function (x) {
      var a = x[0], b = x[1], n = 0;
      if (add) { if (a % 10 + b % 10 >= 10) n++; if (Math.floor(a / 10) % 10 + Math.floor(b / 10) % 10 + (a % 10 + b % 10 >= 10 ? 1 : 0) >= 10) n++; }
      else { if (a % 10 < b % 10) n++; if (Math.floor(a / 10) % 10 - (a % 10 < b % 10 ? 1 : 0) < Math.floor(b / 10) % 10) n++; if (Math.floor(a / 10) % 10 === 0) n++; }
      return n;
    };
    var idx = all.map(function (_, i) { return i; }).sort(function (i, j) { return hard(all[j]) - hard(all[i]) || i - j; }).slice(0, 3).sort(function (i, j) { return i - j; });
    return idx.map(function (i) { return all[i]; });
  }
  function sumsCtx(ctx) { var m = realMission(ctx); return { hw: ctx.hw, m: Object.assign({}, m, { allSums: m.sums, sums: practiceSums(m) }) }; }
  VIEWS.hw_colsub = function (ctx) {
    ctx = sumsCtx(ctx);
    var ms = mState(ctx.hw.id, ctx.m.id); ms.solved = ms.solved || {};
    var n = ctx.m.sums.length, solved = Object.keys(ms.solved).filter(function (k) { return k < n; }).length;
    $app.innerHTML = mTop(ctx, "Practise") +
      '<div class="card"><h3>💡 Exchanging</h3><div class="exch"><div class="rod">10</div><div class="arrow">→</div><div class="ones">' + new Array(11).join("<i></i>") + "</div></div>" +
      "<p>Top number too small? Take <b>1</b> from next door: <b>1 ten = 10 ones</b>. Always start with the <b>ones</b>.</p></div>" +
      '<div class="card"><h3>Practise these 3 sums · ' + solved + " done</h3><div class=\"sumgrid\">" +
      ctx.m.sums.map(function (s, i) {
        var d = ms.solved[i];
        return '<button class="sumbtn ' + (d ? "done" : "") + '" data-i="' + i + '"><small>' + (i + 1) + "</small>" + s[0] + " − " + s[1] + (d ? "<span>" + (d.stars ? "⭐" : "✓") + "</span>" : "") + "</button>";
      }).join("") + '</div><p class="muted" style="margin-top:10px">Then you\'ll do all ' + ctx.m.allSums.length + " on paper.</p></div>";
    backToHub(ctx);
    $$(".sumbtn").forEach(function (b) { b.addEventListener("click", function () { go("colsubDo", { ctx: ctx, i: +b.getAttribute("data-i") }); }); });
  };

  VIEWS.colsubDo = function (o) {
    var ctx = o.ctx, sum = ctx.m.sums[o.i];
    function digits(n) { return [n % 10, Math.floor(n / 10) % 10, Math.floor(n / 100) % 10]; }
    var top = digits(sum[0]), bot = digits(sum[1]);
    var cur = top.slice(), changed = [false, false, false], ans = [null, null, null];
    var p = 0, stage = "ask", need = null, mistakes = 0, msg = "", msgType = "";
    var ms = mState(ctx.hw.id, ctx.m.id); ms.solved = ms.solved || {};

    function nextIndex() {
      for (var k = 1; k <= ctx.m.sums.length; k++) { var j = (o.i + k) % ctx.m.sums.length; if (!ms.solved[j]) return j; }
      return null;
    }
    function render() {
      var cols = [2, 1, 0], prompt;
      if (stage === "ask") prompt = "Look at the <b>" + PLACE[p] + "</b>. Can we take away <b>" + bot[p] + "</b> from <b>" + cur[p] + "</b>?";
      else if (stage === "exchange") prompt = need === p + 2
        ? "Oh! There are <b>0 " + PLACE[p + 1] + "</b>. Tap the <b>" + PLACE[p + 2] + "</b> first, to swap 1 " + PLACE1[p + 2] + " for 10 " + PLACE[p + 1] + "."
        : "Not enough " + PLACE[p] + "! Tap the <b>" + PLACE[p + 1] + "</b> to swap 1 " + PLACE1[p + 1] + " for 10 " + PLACE[p] + ".";
      else if (stage === "answer") prompt = "Work out <b>" + cur[p] + " − " + bot[p] + "</b> and type it in the " + PLACE[p] + " box.";
      else prompt = "🎉 You did it! <b>" + sum[0] + " − " + sum[1] + " = " + (sum[0] - sum[1]) + "</b>";
      $app.innerHTML = mTop(ctx, "Sum " + (o.i + 1) + " of " + ctx.m.sums.length) +
        '<div class="bubble">' + prompt + "</div>" +
        (msg ? '<div class="feedback ' + msgType + '" style="margin-top:0">' + msg + "</div>" : "") +
        '<div class="card"><div class="colgrid">' +
        cols.map(function (c) { return '<div class="ch c' + c + '">' + "OTH"[c] + "</div>"; }).join("") +
        cols.map(function (c) { return '<div class="cex">' + (changed[c] ? cur[c] : "") + "</div>"; }).join("") +
        cols.map(function (c) {
          var cls = (changed[c] ? "crossed " : "") + (stage === "exchange" && c === need ? "hot " : "") + (c === p && stage !== "done" ? "cur" : "");
          return '<button class="ctop ' + cls + '" data-c="' + c + '" aria-label="' + PLACE[c] + " " + top[c] + '">' + top[c] + "</button>";
        }).join("") +
        cols.map(function (c, j) { return '<div class="cbot ' + (c === p && stage !== "done" ? "cur" : "") + '">' + (j === 0 ? '<span class="minus">−</span>' : "") + bot[c] + "</div>"; }).join("") +
        '<div class="cline"></div>' +
        cols.map(function (c) {
          if (c === p && stage === "answer") return '<input class="cans" id="cans" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" aria-label="' + PLACE[c] + ' answer">';
          return '<div class="cans ' + (ans[c] != null ? "filled" : "") + '">' + (ans[c] != null ? ans[c] : "") + "</div>";
        }).join("") +
        "</div>" +
        (stage === "ask" ? '<div class="row" style="margin-top:16px"><button class="btn" id="yes" style="flex:1">Yes 👍</button><button class="btn coral" id="no" style="flex:1">No, exchange 🔄</button></div>' : "") +
        (stage === "answer" ? '<div style="height:14px"></div><button class="btn block" id="ok">Check ✓</button>' : "") +
        (stage === "done" ? '<div class="paper" style="margin-top:14px">✍️ Write this in your book. Cross out and write the new numbers, just like here.</div><div style="height:12px"></div><button class="btn block" id="next">' + (nextIndex() != null ? "Next sum →" : "Finish ⭐") + "</button>" : "") +
        "</div>";
      wire();
    }
    function wire() {
      wireBack(function () { go("hw_colsub", ctx); });
      on("#yes", "click", function () {
        if (cur[p] >= bot[p]) { msg = ""; stage = "answer"; }
        else { mistakes++; msg = cur[p] + " is smaller than " + bot[p] + ", so we need to exchange!"; msgType = "bad"; stage = "exchange"; need = cur[p + 1] === 0 ? p + 2 : p + 1; }
        render(); focusSoon("#cans");
      });
      on("#no", "click", function () {
        if (cur[p] < bot[p]) { msg = "Good spotting! 🔍 " + cur[p] + " is smaller than " + bot[p] + "."; msgType = "good"; stage = "exchange"; need = cur[p + 1] === 0 ? p + 2 : p + 1; }
        else { mistakes++; msg = "We don't need to! " + cur[p] + " is not smaller than " + bot[p] + "."; msgType = "bad"; stage = "answer"; }
        render(); focusSoon("#cans");
      });
      $$(".ctop").forEach(function (b) {
        b.addEventListener("click", function () {
          if (stage !== "exchange") return;
          var c = +b.getAttribute("data-c");
          if (c !== need) { toast("Tap the " + PLACE[need] + " 👈"); return; }
          cur[c] -= 1; cur[c - 1] += 10; changed[c] = true; changed[c - 1] = true;
          msg = "Swapped! 1 " + PLACE1[c] + " → 10 " + PLACE[c - 1] + " ✨"; msgType = "good";
          if (c === p + 2) need = p + 1; else stage = "answer";
          render(); focusSoon("#cans");
        });
      });
      var check = function () {
        var v = $("#cans").value.trim(); if (v === "") return;
        if (parseInt(v, 10) === cur[p] - bot[p]) {
          ans[p] = cur[p] - bot[p]; msg = ""; p++;
          if (p > 2) { stage = "done"; complete(); }
          else stage = "ask";
          render();
        } else {
          mistakes++; msg = "Not quite! Try counting back " + bot[p] + " from " + cur[p] + "."; msgType = "bad";
          render(); focusSoon("#cans");
        }
      };
      on("#ok", "click", check);
      on("#cans", "keydown", function (e) { if (e.key === "Enter") check(); });
      on("#next", "click", function () {
        var nx = nextIndex();
        if (nx != null) return go("colsubDo", { ctx: ctx, i: nx });
        var stars = Object.keys(ms.solved).filter(function (k) { return ms.solved[k].stars; }).length;
        finishMission(ctx, {}, 5);
        missionDone(ctx, "<h2>Practice sums done!</h2><p>" + stars + " of " + ctx.m.sums.length + " right first time ⭐</p>");
      });
    }
    function complete() {
      var stars = mistakes === 0 ? 1 : 0;
      if (!ms.solved[o.i]) { ms.solved[o.i] = { stars: stars }; S.prog.stars = (S.prog.stars || 0) + 1 + stars; }
      save(true);
    }
    render();
  };

  // ----- prediction mission -----
  VIEWS.hw_predict = function (ctx) {
    var ms = mState(ctx.hw.id, ctx.m.id);
    $app.innerHTML = mTop(ctx) +
      '<div class="bookhead"><div class="bk">📕</div><div><div class="t">' + esc(ctx.m.book) + '</div><div class="s">by ' + esc(ctx.m.author) + "</div></div></div>" +
      '<div class="card"><h3>🔍 Clue detective</h3><p>A <b>prediction</b> is a clever guess about what will happen. There are no wrong answers, but good detectives use clues! Tap each clue word in the title.</p>' +
      '<div class="clues">' + ctx.m.clues.map(function (c, i) { return '<button class="clue" data-i="' + i + '"><div class="cw">' + c.emoji + " " + esc(c.word) + '</div><div class="ct">' + esc(c.text) + "</div></button>"; }).join("") + "</div></div>" +
      (ms.sentences ? '<div class="card"><h3>My predictions</h3>' + ms.sentences.map(function (t) { return '<p class="mysent">' + esc(t) + "</p>"; }).join("") + "</div>" : "") +
      '<button class="btn block coral" id="go">' + (ms.sentences ? "Write them again ✍️" : "Make my predictions ✍️") + "</button>";
    backToHub(ctx);
    $$(".clue").forEach(function (b) {
      b.addEventListener("click", function () { b.classList.add("open"); speak(ctx.m.clues[+b.getAttribute("data-i")].text, 0.9); });
    });
    on("#go", "click", function () { go("predictWrite", { ctx: ctx, i: 0, out: [], bonus: 0 }); });
  };
  VIEWS.predictWrite = function (o) {
    var ctx = o.ctx, s = ctx.m.sentences[o.i], askedWhy = false;
    $app.innerHTML = mTop(ctx, "Prediction " + (o.i + 1) + " of " + ctx.m.sentences.length) +
      '<div class="card"><p class="muted">Finish the sentence. Pick an idea, or use your own!</p>' +
      '<div class="starter">' + esc(s.start) + " …</div>" +
      '<div class="chips" style="margin-bottom:12px">' + s.ideas.map(function (t) { return '<button class="chip idea">' + esc(t) + "</button>"; }).join("") + "</div>" +
      '<textarea id="end" class="sentbox" rows="3" placeholder="…type the rest of your sentence here"></textarea>' +
      '<div id="fb"></div><div style="height:10px"></div><button class="btn block coral" id="ok">Check my sentence ✓</button></div>';
    wireBack(function () { go("hw_predict", ctx); });
    $$(".idea").forEach(function (b) { b.addEventListener("click", function () { $("#end").value = b.textContent; $("#end").focus(); }); });
    function accept(full, why) {
      o.out.push(full); if (why) o.bonus++;
      if (o.i + 1 < ctx.m.sentences.length) return go("predictWrite", { ctx: ctx, i: o.i + 1, out: o.out, bonus: o.bonus });
      finishMission(ctx, { sentences: o.out }, 3 + o.bonus);
      missionDone(ctx, "<h2>Super predictions!</h2>" + o.out.map(function (t) { return '<p class="mysent">' + esc(t) + "</p>"; }).join("") +
        (o.bonus ? '<p class="muted">+' + o.bonus + " bonus stars for explaining with <b>because</b> ⭐</p>" : ""));
    }
    function check() {
      var end = $("#end").value.trim().replace(/\s+/g, " ");
      var fb = $("#fb");
      if (end.split(" ").filter(Boolean).length < 2) { fb.innerHTML = '<div class="feedback bad">Add a few more words to finish your sentence.</div>'; return; }
      if (!/[.!]$/.test(end)) {
        fb.innerHTML = '<div class="feedback bad">Nearly! Every sentence ends with a <b>full stop</b>. <br><button class="btn small" id="stop" style="margin-top:8px">Add a full stop .</button></div>';
        on("#stop", "click", function () { $("#end").value = end + "."; fb.innerHTML = ""; });
        return;
      }
      var why = /\bbecause\b/i.test(end);
      var full = s.start + " " + end;
      if (!why && !askedWhy) {
        askedWhy = true;
        fb.innerHTML = '<div class="feedback good">Great sentence! 🌟<br>Can you <b>explain why</b>? Add <b>because…</b> for a bonus star.' +
          '<div class="row" style="margin-top:10px;justify-content:center"><button class="btn small" id="because">Add because</button><button class="btn small ghost" id="keep">Keep it</button></div></div>';
        on("#because", "click", function () { $("#end").value = end.replace(/[.!]$/, "") + " because "; fb.innerHTML = ""; $("#end").focus(); });
        on("#keep", "click", function () { accept(full, false); });
        return;
      }
      accept(full, why);
    }
    on("#ok", "click", check);
  };

  // ----- compass map mission -----
  var DIRS = [["N", "North", 0], ["NE", "North-East", 45], ["E", "East", 90], ["SE", "South-East", 135], ["S", "South", 180], ["SW", "South-West", 225], ["W", "West", 270], ["NW", "North-West", 315]];
  var HUNT = ["N", "S", "E", "W", "NW", "NE", "SE", "SW"];
  function dirInfo(code) { return DIRS.find(function (d) { return d[0] === code; }); }
  function mapPlaces() {
    var M = window.UK_MAP, out = [];
    Object.keys(M.places).forEach(function (n) { out.push({ name: n, x: M.places[n][0], y: M.places[n][1], sea: false }); });
    Object.keys(M.seas).forEach(function (n) { out.push({ name: n, x: M.seas[n][0], y: M.seas[n][1], sea: true }); });
    return out;
  }
  function placeByName(n) { return mapPlaces().find(function (p) { return p.name === n; }); }
  function angleBetween(a, b) { var ang = Math.atan2(b.x - a.x, a.y - b.y) * 180 / Math.PI; return (ang + 360) % 360; }
  function angDiff(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
  function sectorOf(ang) { return DIRS[Math.round(ang / 45) % 8]; }
  function fitsDir(m, p, code) { return (m.accept[code] || []).indexOf(p.name) >= 0; }
  function whereIs(m, p) {
    var order = ["NW", "NE", "SE", "SW", "N", "E", "S", "W"];
    for (var i = 0; i < order.length; i++) if (fitsDir(m, p, order[i])) return dirInfo(order[i])[1];
    return null;
  }
  var LABELS = { Cardiff: ["end", -7], Bristol: ["start", 7], London: ["end", -4], Liverpool: ["end", 0], Glasgow: ["end", 0], York: ["start", -2], Leeds: ["start", 3] };
  function ukMapSvg(hi) {
    var M = window.UK_MAP; hi = hi || {};
    var places = mapPlaces();
    var s = '<svg class="ukmap" viewBox="0 0 ' + M.w + " " + M.h + '" role="img" aria-label="Map of the United Kingdom">' +
      '<rect width="' + M.w + '" height="' + M.h + '" fill="#cfe9f7"/>' +
      '<path d="' + M.fr + '" fill="#ece6da"/><path d="' + M.ie + '" fill="#ece6da" stroke="#d3c9b6" stroke-width="0.8"/>' +
      '<path d="' + M.uk + '" fill="#bfe3b4" stroke="#6aa865" stroke-width="0.8"/>' +
      // compass rose, bottom-left in the sea
      '<g transform="translate(42 392)"><circle r="27" fill="#fff" opacity=".85"/>' +
      '<path d="M0 -24 L5 -5 L0 0 L-5 -5Z" fill="#e5484d"/><path d="M0 24 L5 5 L0 0 L-5 5Z" fill="#23303b"/><path d="M24 0 L5 5 L0 0 L5 -5Z" fill="#23303b"/><path d="M-24 0 L-5 5 L0 0 L-5 -5Z" fill="#23303b"/>' +
      '<text y="-28" text-anchor="middle" font-size="11" font-weight="800" fill="#e5484d">N</text><text y="38" text-anchor="middle" font-size="10" font-weight="700">S</text>' +
      '<text x="33" y="4" text-anchor="middle" font-size="10" font-weight="700">E</text><text x="-33" y="4" text-anchor="middle" font-size="10" font-weight="700">W</text></g>';
    places.forEach(function (p) {
      var on = hi[p.name], lb = LABELS[p.name] || [p.x > 225 ? "end" : "start", 0];
      var left = lb[0] === "end", ly = p.y + 3.5 + (lb[1] || 0);
      if (p.sea) {
        s += '<g class="pl sea' + (on ? " on " + on : "") + '" data-p="' + p.name + '"><rect x="' + (p.x - 48) + '" y="' + (p.y - 13) + '" width="96" height="24" rx="10" fill="transparent"/>' +
          '<text x="' + p.x + '" y="' + (p.y + 4) + '" text-anchor="middle" class="seatxt">' + p.name + "</text></g>";
        return;
      }
      s += '<g class="pl' + (on ? " on " + on : "") + '" data-p="' + p.name + '"><circle cx="' + p.x + '" cy="' + p.y + '" r="13" fill="transparent"/>' +
        '<circle class="dot" cx="' + p.x + '" cy="' + p.y + '" r="' + (on ? 6 : 4) + '"/>' +
        '<text x="' + (p.x + (left ? -7 : 7)) + '" y="' + ly + '" text-anchor="' + (left ? "end" : "start") + '">' + p.name + "</text></g>";
    });
    return s + "</svg>";
  }

  VIEWS.hw_compass = function (ctx) {
    var ms = mState(ctx.hw.id, ctx.m.id);
    var answers = ms.answers || {};
    var step = function (n, done, t, s, id) {
      return '<button class="mission small ' + (done ? "done" : "") + '" id="' + id + '" style="--mc:#7b5ea7;--mb:#ebe3f6"><div class="memoji">' + n + '</div><div style="flex:1"><div class="t">' + t + '</div><div class="s">' + s + '</div></div><div class="mgo">' + (done ? "✓" : "›") + "</div></button>";
    };
    $app.innerHTML = mTop(ctx) +
      step("🧭", ms.learnt, "1. Learn the compass", "Never Eat Shredded Wheat!", "s1") +
      step("🎯", ms.quiz != null, "2. Compass quiz", ms.quiz != null ? "Best score: " + ms.quiz + " / 8" : "8 map questions", "s2") +
      step("🗺️", ms.done, "3. Map hunt (your homework)", "Find a place for each direction", "s3") +
      (Object.keys(answers).length ? '<div class="card"><h3>My answers</h3>' + answerTable(answers) + "</div>" : "");
    backToHub(ctx);
    on("#s1", "click", function () { go("compassLearn", ctx); });
    on("#s2", "click", function () { go("compassQuiz", { ctx: ctx, qs: compassQuestions(), i: 0, score: 0 }); });
    on("#s3", "click", function () { go("compassHunt", { ctx: ctx, i: 0, answers: {} }); });
  };
  function answerTable(a) {
    return "<table>" + HUNT.filter(function (c) { return a[c]; }).map(function (c, i) {
      return (i === 4 ? '<tr><td colspan="2" style="padding-top:12px"><b>Challenge</b></td></tr>' : "") + "<tr><td><b>" + dirInfo(c)[1] + ":</b></td><td>" + esc(a[c]) + "</td></tr>";
    }).join("") + "</table>";
  }
  VIEWS.compassLearn = function (ctx) {
    var rose = '<svg viewBox="-110 -110 220 220" class="rose" role="img" aria-label="Compass">' +
      '<circle r="100" fill="#ebe3f6"/><circle r="70" fill="#fff"/>' +
      '<path d="M0 -66 L12 -12 L0 0 L-12 -12Z" fill="#e5484d"/><path d="M0 66 L12 12 L0 0 L-12 12Z" fill="#7b5ea7"/><path d="M66 0 L12 12 L0 0 L12 -12Z" fill="#7b5ea7"/><path d="M-66 0 L-12 12 L0 0 L-12 -12Z" fill="#7b5ea7"/>' +
      '<path d="M40 -40 L8 0 L0 0 L0 -8Z" fill="#c9b8e4"/><path d="M40 40 L8 0 L0 0 L0 8Z" fill="#c9b8e4"/><path d="M-40 40 L-8 0 L0 0 L0 8Z" fill="#c9b8e4"/><path d="M-40 -40 L-8 0 L0 0 L0 -8Z" fill="#c9b8e4"/>' +
      DIRS.map(function (d) {
        var r = d[0].length === 1 ? 85 : 84, a = d[2] * Math.PI / 180, x = Math.sin(a) * r, y = -Math.cos(a) * r;
        return '<g class="rl" data-d="' + d[1] + '"><circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="15" fill="' + (d[0] === "N" ? "#e5484d" : "#7b5ea7") + '"/><text x="' + x.toFixed(1) + '" y="' + (y + 4.5).toFixed(1) + '" text-anchor="middle" fill="#fff" font-weight="800" font-size="' + (d[0].length === 1 ? 14 : 10) + '">' + d[0] + "</text></g>";
      }).join("") + "</svg>";
    $app.innerHTML = mTop(ctx, "Learn the compass") +
      '<div class="card center">' + rose + '<p class="muted">Tap a letter to hear it</p>' +
      '<div class="rhyme">Go clockwise from the top:<br><b>N</b>ever <b>E</b>at <b>S</b>hredded <b>W</b>heat</div></div>' +
      '<div class="card"><h3>In-between directions</h3><p>Between North and East is <b>North-East</b>. North or South always comes first: <b>North</b>-West, <b>South</b>-East.</p>' +
      '<p>On a map, <b>North is at the top</b>. So the top of the UK (Scotland) is in the north, and the bottom is in the south.</p>' +
      '<button class="btn block plum" id="done">Got it! 👍</button></div>';
    wireBack(function () { go("hw_compass", ctx); });
    $$(".rl").forEach(function (g) { g.addEventListener("click", function () { speak(g.getAttribute("data-d")); }); });
    on("#done", "click", function () { mState(ctx.hw.id, ctx.m.id).learnt = true; save(); go("hw_compass", ctx); });
  };
  function compassQuestions() {
    var pl = mapPlaces().filter(function (p) { return !p.sea; }), qs = [];
    var axes = [["North", function (p) { return -p.y; }], ["South", function (p) { return p.y; }], ["East", function (p) { return p.x; }], ["West", function (p) { return -p.x; }]];
    shuffle(axes).forEach(function (ax) {
      for (var t = 0; t < 50; t++) {
        var opts = shuffle(pl).slice(0, 3), sc = opts.map(ax[1]).sort(function (a, b) { return b - a; });
        if (sc[0] - sc[1] < 30) continue;
        var best = opts.reduce(function (a, b) { return ax[1](a) > ax[1](b) ? a : b; });
        qs.push({ q: "Which place is furthest <b>" + ax[0] + "</b>?", opts: opts.map(function (p) { return p.name; }), answer: best.name, hi: opts.map(function (p) { return p.name; }) });
        break;
      }
    });
    var tries = 0;
    while (qs.length < 8 && tries++ < 400) {
      var two = shuffle(pl).slice(0, 2), a = two[0], b = two[1];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 60) continue;
      var ang = angleBetween(b, a), sec = sectorOf(ang);
      if (angDiff(ang, sec[2]) > 12) continue;
      if (qs.some(function (q) { return q.from === b.name || q.to === a.name; })) continue;
      var wrong = shuffle(DIRS.filter(function (d) { return d !== sec; })).slice(0, 3).map(function (d) { return d[1]; });
      qs.push({ q: "<b>" + a.name + "</b> is ___ of <b>" + b.name + "</b>.", opts: shuffle(wrong.concat([sec[1]])), answer: sec[1], hi: [a.name, b.name], to: a.name, from: b.name });
    }
    return shuffle(qs);
  }
  VIEWS.compassQuiz = function (o) {
    var ctx = o.ctx, q = o.qs[o.i], hi = {};
    q.hi.forEach(function (n) { hi[n] = "pick"; });
    $app.innerHTML = mTop(ctx, "Compass quiz · " + (o.i + 1) + " of " + o.qs.length) +
      '<div class="progressbar"><div style="width:' + (o.i / o.qs.length * 100) + '%"></div></div>' +
      '<div class="mapwrap">' + ukMapSvg(hi) + "</div>" +
      '<div class="card"><h3 style="margin-bottom:12px">' + q.q + "</h3>" +
      q.opts.map(function (t) { return '<button class="choice">' + esc(t) + "</button>"; }).join("") + '<div id="fb"></div></div>';
    wireBack(function () { go("hw_compass", ctx); });
    $$(".choice").forEach(function (b) {
      b.addEventListener("click", function () {
        var ok = b.textContent === q.answer;
        if (ok) o.score++;
        $$(".choice").forEach(function (c) { c.disabled = true; if (c.textContent === q.answer) c.classList.add("right"); else if (c === b) c.classList.add("wrong"); });
        $("#fb").innerHTML = '<div class="feedback ' + (ok ? "good" : "bad") + '">' + (ok ? pick(["Yes! 🧭", "Spot on! ⭐", "Brilliant! 🌟"]) : "The answer is " + esc(q.answer) + ". Look at the map!") + "</div>" +
          '<button class="btn block plum" id="next">' + (o.i + 1 < o.qs.length ? "Next →" : "See my score") + "</button>";
        on("#next", "click", function () {
          if (o.i + 1 < o.qs.length) return go("compassQuiz", { ctx: ctx, qs: o.qs, i: o.i + 1, score: o.score });
          var ms = mState(ctx.hw.id, ctx.m.id);
          if (ms.quiz == null) S.prog.stars = (S.prog.stars || 0) + o.score;
          ms.quiz = Math.max(ms.quiz || 0, o.score); save(true);
          $app.innerHTML = topbar("Quiz finished!", false) + '<div class="card center"><div class="celebrate">' + (o.score >= 7 ? "🧭" : "💪") + '</div><div class="score">' + o.score + ' / 8</div><p>' +
            (o.score >= 7 ? "You're a map master!" : "Good try! Remember: North is at the top.") + '</p><button class="btn block plum" id="b">Next: the map hunt →</button></div>';
          on("#b", "click", function () { go("compassHunt", { ctx: ctx, i: 0, answers: {} }); });
        });
      });
    });
  };
  VIEWS.compassHunt = function (o) {
    var ctx = o.ctx, code = HUNT[o.i], d = dirInfo(code), hi = {};
    Object.keys(o.answers).forEach(function (c) { hi[o.answers[c]] = "got"; });
    $app.innerHTML = mTop(ctx, "Map hunt · " + (o.i + 1) + " of " + HUNT.length) +
      (o.i === 4 ? '<div class="tipbox" style="margin-bottom:10px">⭐ <b>Challenge time!</b> Now the in-between directions.</div>' : "") +
      '<div class="bubble">Tap a place in the <b>' + d[1].toUpperCase() + '</b> of the map <span class="dirbadge">' + code + "</span></div>" +
      '<div id="fb"></div><div class="mapwrap">' + ukMapSvg(hi) + "</div>";
    wireBack(function () { go("hw_compass", ctx); });
    speak("Tap a place in the " + d[1] + " of the map", 0.9);
    $$(".pl").forEach(function (g) {
      g.addEventListener("click", function () {
        var p = placeByName(g.getAttribute("data-p"));
        var used = Object.keys(o.answers).some(function (c) { return o.answers[c] === p.name; });
        if (fitsDir(ctx.m, p, code) && !used) {
          o.answers[code] = p.name;
          g.classList.add("on", "got");
          $("#fb").innerHTML = '<div class="feedback good">Yes! <b>' + esc(p.name) + "</b> is in the " + d[1].toLowerCase() + ". ⭐</div>";
          $$(".pl").forEach(function (x) { x.style.pointerEvents = "none"; });
          setTimeout(function () {
            if (o.i + 1 < HUNT.length) return go("compassHunt", { ctx: ctx, i: o.i + 1, answers: o.answers });
            finishMission(ctx, { answers: o.answers }, 8);
            missionDone(ctx, "<h2>Map hunt complete!</h2><p>Copy these into your book:</p>" + answerTable(o.answers));
          }, 1300);
          return;
        }
        var w = whereIs(ctx.m, p);
        $("#fb").innerHTML = '<div class="feedback bad">' + (used ? esc(p.name) + " is already one of your answers. Pick a different place!"
          : !w ? esc(p.name) + " is near the middle of the map. Try one nearer the edge!"
          : esc(p.name) + " is more in the " + w.toLowerCase() + ". Try again!") + "</div>";
      });
    });
  };

  // ----- discussion mission -----
  VIEWS.hw_discuss = function (ctx) {
    var ms = mState(ctx.hw.id, ctx.m.id);
    if (!ms.warm) return go("discussWarm", { ctx: ctx, i: 0, score: 0, order: shuffle(ctx.m.warmup) });
    ms.talked = ms.talked || {}; ms.notes = ms.notes || {};
    var n = ctx.m.questions.length, t = Object.keys(ms.talked).length;
    var pal = ["#ffe1d8", "#ddeefa", "#d9f2ee", "#ebe3f6", "#fff1c7"];
    $app.innerHTML = mTop(ctx) +
      '<div class="tipbox" style="margin-bottom:14px">💬 Sit with a grown-up and talk about each question. Tap 💡 if you need ideas. Then tap <b>We talked!</b></div>' +
      '<p class="center muted">' + t + " of " + n + " talked about</p>" +
      ctx.m.questions.map(function (q, i) {
        var done = !!ms.talked[i];
        return '<div class="qcard ' + (done ? "done" : "") + '" style="background:' + pal[i % pal.length] + '"><div class="qn">' + (i + 1) + "</div><h3>" + esc(q.q) + "</h3>" +
          '<div class="ideas" id="id' + i + '" hidden><div class="chips">' + q.ideas.map(function (x) { return '<span class="chip">' + esc(x) + "</span>"; }).join("") + "</div></div>" +
          '<textarea class="note" data-i="' + i + '" rows="2" placeholder="My answer (if you want to write it)">' + esc(ms.notes[i] || "") + "</textarea>" +
          '<div class="row" style="margin-top:8px"><button class="btn small ghost" data-idea="' + i + '">💡 Ideas</button><div class="spacer"></div>' +
          '<button class="btn small ' + (done ? "" : "sun") + '" data-talk="' + i + '">' + (done ? "✓ Talked" : "We talked!") + "</button></div></div>";
      }).join("");
    backToHub(ctx);
    $$("[data-idea]").forEach(function (b) { b.addEventListener("click", function () { var el = $("#id" + b.getAttribute("data-idea")); el.hidden = !el.hidden; }); });
    $$(".note").forEach(function (t) { t.addEventListener("change", function () { ms.notes[t.getAttribute("data-i")] = t.value.trim().slice(0, 300); save(); }); });
    $$("[data-talk]").forEach(function (b) {
      b.addEventListener("click", function () {
        $$(".note").forEach(function (t) { ms.notes[t.getAttribute("data-i")] = t.value.trim().slice(0, 300); });
        var i = b.getAttribute("data-talk");
        if (ms.talked[i]) delete ms.talked[i]; else ms.talked[i] = 1;
        save();
        if (Object.keys(ms.talked).length === n && !ms.done) {
          finishMission(ctx, {}, 5);
          return missionDone(ctx, "<h2>Lovely talking!</h2><p>You know so much about being a good friend. 💛</p>");
        }
        var y = window.scrollY; go("hw_discuss", ctx); window.scrollTo(0, y);
      });
    });
  };
  VIEWS.discussWarm = function (o) {
    var ctx = o.ctx, item = o.order[o.i];
    $app.innerHTML = mTop(ctx, "Warm-up · " + (o.i + 1) + " of " + o.order.length) +
      '<div class="card center"><p class="muted">Is this kind or not kind?</p><div class="scenario">' + esc(item[0]) + "</div>" +
      '<div class="row"><button class="btn" id="k" style="flex:1">👍 Kind</button><button class="btn coral" id="nk" style="flex:1">👎 Not kind</button></div><div id="fb"></div></div>';
    wireBack(function () { go("hwHub", ctx.hw.id); });
    function answer(kind) {
      var ok = kind === item[1]; if (ok) o.score++;
      $("#fb").innerHTML = '<div class="feedback ' + (ok ? "good" : "bad") + '">' + (ok ? "That's right! " : "Hmm, think again. ") + (item[1] ? "That is a kind thing to do. 💛" : "That would make a friend feel sad.") + "</div>" +
        '<button class="btn block sun" id="next">Next →</button>';
      $("#k").disabled = $("#nk").disabled = true;
      on("#next", "click", function () {
        if (o.i + 1 < o.order.length) return go("discussWarm", { ctx: ctx, i: o.i + 1, score: o.score, order: o.order });
        mState(ctx.hw.id, ctx.m.id).warm = o.score; save(); go("hw_discuss", ctx);
      });
    }
    on("#k", "click", function () { answer(true); });
    on("#nk", "click", function () { answer(false); });
  };

  // ----- homophone "which one?" game (spelling missions with pairs) -----
  VIEWS.pairGame = function (o) {
    var ctx = o.ctx;
    if (!o.qs) {
      var qs = [];
      ctx.m.pairs.forEach(function (p) {
        p.forEach(function (w, i) {
          var row = ctx.m.words.find(function (x) { return x[0] === w; });
          if (row) qs.push({ word: w, other: p[1 - i], sentence: row[1] });
        });
      });
      o.qs = shuffle(qs); o.i = 0; o.score = 0;
    }
    var q = o.qs[o.i], hints = ctx.m.hints || {};
    var opts = shuffle([q.word, q.other]);
    $app.innerHTML = mTop(ctx, "Which one? · " + (o.i + 1) + " of " + o.qs.length) +
      '<div class="progressbar"><div style="width:' + (o.i / o.qs.length * 100) + '%"></div></div>' +
      '<div class="card center"><p class="muted">Which word fits the sentence?</p>' +
      '<button class="speak" id="say" aria-label="Hear the sentence">🔊</button>' +
      '<p class="sentence">' + blankSentence(q.sentence, q.word) + "</p>" +
      '<div class="row">' + opts.map(function (w) { return '<button class="choice center pairbtn" style="flex:1;font-size:26px;font-weight:800">' + esc(w) + "</button>"; }).join("") + "</div>" +
      '<div id="fb"></div></div>';
    wireBack(function () { go("hw_spelling", ctx); });
    on("#say", "click", function () { speak(q.sentence, 0.9); });
    setTimeout(function () { speak(q.sentence, 0.9); }, 300);
    $$(".pairbtn").forEach(function (b) {
      b.addEventListener("click", function () {
        var ok = b.textContent === q.word;
        if (ok) o.score++;
        $$(".pairbtn").forEach(function (c) { c.disabled = true; if (c.textContent === q.word) c.classList.add("right"); else if (c === b) c.classList.add("wrong"); });
        $("#fb").innerHTML = '<div class="feedback ' + (ok ? "good" : "bad") + '">' + (ok ? pick(["Yes! ⭐", "Spot on! 🎯", "Brilliant! 🌟"]) : "It's <b>" + esc(q.word) + "</b> here.") +
          '<br><small style="font-weight:500"><b>' + esc(q.word) + "</b> = " + esc(hints[q.word] || "") + " · <b>" + esc(q.other) + "</b> = " + esc(hints[q.other] || "") + "</small></div>" +
          '<button class="btn block" id="next">' + (o.i + 1 < o.qs.length ? "Next →" : "See my score") + "</button>";
        on("#next", "click", function () {
          if (o.i + 1 < o.qs.length) { o.i++; return go("pairGame", o); }
          var ms = mState(ctx.hw.id, ctx.m.id);
          if (ms.pairs == null) S.prog.stars = (S.prog.stars || 0) + o.score;
          ms.pairs = Math.max(ms.pairs || 0, o.score); save(true);
          $app.innerHTML = topbar("Game finished!", false) + '<div class="card center"><div class="celebrate">' + (o.score >= 8 ? "🎯" : "💪") + '</div><div class="score">' + o.score + " / " + o.qs.length + "</div><p>" +
            (o.score >= 8 ? "You really know your sound-alike words!" : "Good try! Listen to what each sentence means.") + '</p><button class="btn block" id="b">Back to spellings</button></div>';
          on("#b", "click", function () { go("hw_spelling", ctx); });
        });
      });
    });
  };

  // ----- column addition mission -----
  function digits3(n) { return [n % 10, Math.floor(n / 10) % 10, Math.floor(n / 100) % 10]; }
  VIEWS.hw_coladd = function (ctx) {
    ctx = sumsCtx(ctx);
    var ms = mState(ctx.hw.id, ctx.m.id); ms.solved = ms.solved || {};
    var n = ctx.m.sums.length, solved = Object.keys(ms.solved).filter(function (k) { return k < n; }).length;
    $app.innerHTML = mTop(ctx, "Practise") +
      '<div class="card"><h3>💡 Carrying</h3><div class="exch"><div class="ones">' + new Array(11).join("<i></i>") + '</div><div class="arrow">→</div><div class="rod">10</div></div>' +
      "<p>A column makes <b>10 or more</b>? <b>10 ones = 1 ten</b>, so carry the 1 next door. Always start with the <b>ones</b>.</p></div>" +
      '<div class="card"><h3>Practise these 3 sums · ' + solved + " done</h3><div class=\"sumgrid\">" +
      ctx.m.sums.map(function (s, i) {
        var d = ms.solved[i];
        return '<button class="sumbtn ' + (d ? "done" : "") + '" data-i="' + i + '"><small>' + (i + 1) + "</small>" + s[0] + " + " + s[1] + (d ? "<span>" + (d.stars ? "⭐" : "✓") + "</span>" : "") + "</button>";
      }).join("") + '</div><p class="muted" style="margin-top:10px">Then you\'ll do all ' + ctx.m.allSums.length + " on paper.</p></div>";
    backToHub(ctx);
    $$(".sumbtn").forEach(function (b) { b.addEventListener("click", function () { go("coladdDo", { ctx: ctx, i: +b.getAttribute("data-i") }); }); });
  };
  VIEWS.coladdDo = function (o) {
    var ctx = o.ctx, sum = ctx.m.sums[o.i];
    var top = digits3(sum[0]), bot = digits3(sum[1]), carry = [0, 0, 0], ans = [null, null, null];
    var p = 0, stage = "sum", total = null, mistakes = 0, msg = "", msgType = "";
    var ms = mState(ctx.hw.id, ctx.m.id); ms.solved = ms.solved || {};
    var botShown = function (c) { return (c === 2 && sum[1] < 100) || (c === 1 && sum[1] < 10) ? "" : String(bot[c]); };
    function nextIndex() {
      for (var k = 1; k <= ctx.m.sums.length; k++) { var j = (o.i + k) % ctx.m.sums.length; if (!ms.solved[j]) return j; }
      return null;
    }
    function terms() {
      var t = [top[p]]; if (botShown(p) !== "") t.push(bot[p]); if (carry[p]) t.push(carry[p]);
      return t;
    }
    function render() {
      var cols = [2, 1, 0], prompt;
      if (stage === "sum") prompt = "Add the <b>" + PLACE[p] + "</b>: <b>" + terms().join(" + ") + "</b>" + (carry[p] ? '<br><small>(the 1 is the ten you carried)</small>' : "") + (terms().length === 1 ? "<br><small>Nothing to add, so just bring it down!</small>" : "");
      else if (stage === "carry") prompt = "<b>" + total + "</b> is 10 or more! Write the <b>" + (total % 10) + "</b> in the " + PLACE[p] + " and carry <b>1</b> " + PLACE1[p + 1] + ". Tap the <b>" + PLACE[p + 1] + "</b>!";
      else prompt = "🎉 You did it! <b>" + sum[0] + " + " + sum[1] + " = " + (sum[0] + sum[1]) + "</b>";
      $app.innerHTML = mTop(ctx, "Sum " + (o.i + 1) + " of " + ctx.m.sums.length) +
        '<div class="bubble">' + prompt + "</div>" +
        (msg ? '<div class="feedback ' + msgType + '" style="margin-top:0">' + msg + "</div>" : "") +
        '<div class="card"><div class="colgrid">' +
        cols.map(function (c) { return '<div class="ch c' + c + '">' + "OTH"[c] + "</div>"; }).join("") +
        cols.map(function (c) {
          var cls = (stage === "carry" && c === p + 1 ? "hot " : "") + (c === p && stage !== "done" ? "cur" : "");
          return '<button class="ctop ' + cls + '" data-c="' + c + '" aria-label="' + PLACE[c] + " " + top[c] + '">' + top[c] + "</button>";
        }).join("") +
        cols.map(function (c, j) { return '<div class="cbot ' + (c === p && stage !== "done" ? "cur" : "") + '">' + (j === 0 ? '<span class="minus">+</span>' : "") + botShown(c) + "</div>"; }).join("") +
        '<div class="cline"></div>' +
        cols.map(function (c) {
          if (c === p && stage === "sum") return '<input class="cans" id="cans" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" aria-label="' + PLACE[c] + ' answer">';
          return '<div class="cans ' + (ans[c] != null ? "filled" : "") + '">' + (ans[c] != null ? ans[c] : "") + "</div>";
        }).join("") +
        cols.map(function (c) { return '<div class="ccarry">' + (carry[c] ? carry[c] : "") + "</div>"; }).join("") +
        "</div>" +
        (stage === "sum" ? '<div style="height:14px"></div><button class="btn block" id="ok">Check ✓</button>' : "") +
        (stage === "done" ? '<div class="paper" style="margin-top:14px">✍️ Write this in your book, with the little carried 1s under the line, just like here.</div><div style="height:12px"></div><button class="btn block" id="next">' + (nextIndex() != null ? "Next sum →" : "Finish ⭐") + "</button>" : "") +
        "</div>";
      wire();
    }
    function wire() {
      wireBack(function () { go("hw_coladd", ctx); });
      var check = function () {
        var v = $("#cans").value.trim(); if (v === "") return;
        var want = terms().reduce(function (a, b) { return a + b; }, 0);
        if (parseInt(v, 10) !== want) {
          mistakes++; msg = "Not quite! Count on carefully: " + terms().join(" + ") + "."; msgType = "bad";
          render(); focusSoon("#cans"); return;
        }
        msg = "";
        if (want >= 10 && p < 2) { total = want; stage = "carry"; render(); return; }
        ans[p] = want; p++;
        if (p > 2) { stage = "done"; complete(); } else stage = "sum";
        render(); focusSoon("#cans");
      };
      on("#ok", "click", check);
      on("#cans", "keydown", function (e) { if (e.key === "Enter") check(); });
      $$(".ctop").forEach(function (b) {
        b.addEventListener("click", function () {
          if (stage !== "carry") return;
          var c = +b.getAttribute("data-c");
          if (c !== p + 1) { toast("Tap the " + PLACE[p + 1] + " 👈"); return; }
          ans[p] = total % 10; carry[p + 1] = 1; p++; stage = "sum";
          msg = "Carried! 10 " + PLACE[p - 1] + " → 1 " + PLACE1[p] + " ✨"; msgType = "good";
          render(); focusSoon("#cans");
        });
      });
      on("#next", "click", function () {
        var nx = nextIndex();
        if (nx != null) return go("coladdDo", { ctx: ctx, i: nx });
        var stars = Object.keys(ms.solved).filter(function (k) { return ms.solved[k].stars; }).length;
        finishMission(ctx, {}, 5);
        missionDone(ctx, "<h2>Practice sums done!</h2><p>" + stars + " of " + ctx.m.sums.length + " right first time ⭐</p>");
      });
    }
    function complete() {
      var stars = mistakes === 0 ? 1 : 0;
      if (!ms.solved[o.i]) { ms.solved[o.i] = { stars: stars }; S.prog.stars = (S.prog.stars || 0) + 1 + stars; }
      save(true);
    }
    render();
    focusSoon("#cans");
  };

  // ----- character description mission -----
  var FEAT = {
    time: { emoji: "⏰", name: "Time adverbial", what: "Tells us <b>when</b> it happened. Put a comma after it.", eg: "Yesterday, One sunny morning, After school," },
    noun: { emoji: "🧩", name: "Expanded noun phrase", what: "Describing words in front of the noun, to tell us more. Two describing words? Put a comma between them.", eg: "the brave, curly-haired boy" },
    simile: { emoji: "🦊", name: "Simile", what: "Compares something to something else using <b>like</b> or <b>as … as</b>.", eg: "like a sneaky fox · as quiet as a mouse" }
  };
  var TIME_RE = /(^|[.!?]\s+)(yesterday|today|tomorrow|tonight|one (sunny |rainy |cold |dark |snowy |bright |windy |quiet )?(morning|day|night|afternoon|evening)|last (night|week|year|summer|winter|weekend)|after (school|lunch|dinner|that|breakfast)|before (school|bed|breakfast)|suddenly|at (midnight|night|dawn|sunset|lunchtime|first|last)|in the (morning|evening|afternoon|night)|later( that day)?|then|next|finally|meanwhile|soon|once upon a time|every (day|morning|night)|early|first|at last)\b/i;
  var NOUN_RE = /\b(the|a|an|my|his|her|their|our|this|that)\s+[a-z-]+,\s*[a-z-]+\s+[a-z-]+/i;
  var SIMILE_RE = /\blike (a|an|the)\b|\bas [a-z-]+ as\b/i;
  function featureCheck(text) {
    var t = text.trim();
    var sentences = t.split(/(?<=[.!?])\s+/).map(function (x) { return x.trim(); }).filter(Boolean);
    return {
      time: TIME_RE.test(t),
      noun: NOUN_RE.test(t),
      simile: SIMILE_RE.test(t),
      caps: sentences.length > 0 && sentences.every(function (x) { return /^["'“‘]?[A-Z]/.test(x); }),
      stops: t.length > 0 && /[.!?]["'”’]?$/.test(t),
      three: sentences.filter(function (x) { return x.split(/\s+/).length >= 3; }).length >= 3
    };
  }
  VIEWS.hw_describe = function (ctx) {
    var ms = mState(ctx.hw.id, ctx.m.id);
    var ex = ctx.m.example.map(function (part) { return part[1] ? '<span class="feat-' + part[1] + '">' + esc(part[0]) + "</span>" : esc(part[0]); }).join("");
    $app.innerHTML = mTop(ctx) +
      '<div class="card"><h3>👀 Look at the example</h3><p class="exsent">' + ex + "</p>" +
      ["time", "noun", "simile"].map(function (k) {
        return '<div class="featcard feat-' + k + '-bg"><div class="ft">' + FEAT[k].emoji + " " + FEAT[k].name + '</div><div class="fw">' + FEAT[k].what + '</div><div class="fe">e.g. ' + esc(FEAT[k].eg) + "</div></div>";
      }).join("") + "</div>" +
      '<button class="mission small" id="s1" style="--mc:#ff7a59;--mb:#ffe1d8"><div class="memoji">🧱</div><div style="flex:1"><div class="t">1. Sentence builder</div><div class="s">' + ((ms.built || []).length ? (ms.built.length + " sentences saved") : "Build a super sentence") + '</div></div><div class="mgo">›</div></button>' +
      '<button class="mission small ' + (ms.done ? "done" : "") + '" id="s2" style="--mc:#ff7a59;--mb:#ffe1d8"><div class="memoji">✍️</div><div style="flex:1"><div class="t">2. Write my paragraph</div><div class="s">About your favourite character</div></div><div class="mgo">' + (ms.done ? "✓" : "›") + "</div></button>" +
      (ms.paragraph ? '<div class="card"><h3>My paragraph</h3><p class="mysent">' + esc(ms.paragraph) + "</p></div>" : "");
    backToHub(ctx);
    on("#s1", "click", function () { go("describeBuild", { ctx: ctx }); });
    on("#s2", "click", function () { go("describeWrite", { ctx: ctx }); });
  };
  VIEWS.describeBuild = function (o) {
    var ctx = o.ctx, B = ctx.m.builder;
    o.pick = o.pick || { time: B.time[0], adj: [B.adj[0], B.adj[5]], who: "", action: B.action[0], simile: B.simile[0] };
    var P = o.pick;
    function sentence() {
      var who = (P.who || "the little dragon").trim();
      var m = who.match(/^(the|a|an|my|our|his|her)\s+(.*)$/i);
      var det = m ? m[1].toLowerCase() : (/^[A-Z]/.test(who) ? "" : "the");
      var noun = m ? m[2] : who;
      return P.time + " " + (det ? det + " " : "") + P.adj[0] + ", " + P.adj[1] + " " + noun + " " + P.action + " " + P.simile + ".";
    }
    function group(key, title, list, cls) {
      return '<div class="bgroup"><div class="bt feat-' + cls + '-bg">' + title + '</div><div class="chips">' + list.map(function (t) {
        var on = key === "adj" ? P.adj.indexOf(t) >= 0 : P[key] === t;
        return '<button class="chip idea pickchip ' + (on ? "on" : "") + '" data-k="' + key + '">' + esc(t) + "</button>";
      }).join("") + "</div></div>";
    }
    var ms = mState(ctx.hw.id, ctx.m.id);
    $app.innerHTML = mTop(ctx, "Sentence builder") +
      '<div class="card"><p class="muted" style="margin-bottom:6px">Your sentence</p><p class="exsent big" id="prev">' + esc(sentence()) + "</p>" +
      '<div class="row"><button class="btn small ghost" id="hear">🔊 Hear it</button><button class="btn small ghost" id="mix">🔀 Surprise me</button></div></div>' +
      '<div class="card"><label for="who" style="margin-top:0">Who is your character?</label><input id="who" value="' + esc(P.who) + '" placeholder="e.g. the little dragon, or a name">' +
      group("time", "⏰ When? (time adverbial)", B.time, "time") +
      group("adj", "🧩 Pick 2 describing words", B.adj, "noun") +
      '<div class="bgroup"><div class="bt">🏃 What did they do?</div><div class="chips">' + B.action.map(function (t) { return '<button class="chip idea pickchip ' + (P.action === t ? "on" : "") + '" data-k="action">' + esc(t) + "</button>"; }).join("") + "</div></div>" +
      group("simile", "🦊 Like what? (simile)", B.simile, "simile") +
      '<div style="height:12px"></div><button class="btn block coral" id="keep">Save this sentence ⭐</button></div>';
    wireBack(function () { go("hw_describe", ctx); });
    on("#who", "input", function (e) { P.who = e.target.value; $("#prev").textContent = sentence(); });
    on("#hear", "click", function () { speak(sentence(), 0.9); });
    on("#mix", "click", function () {
      var a = shuffle(B.adj);
      o.pick = { time: pick(B.time), adj: [a[0], a[1]], who: P.who, action: pick(B.action), simile: pick(B.simile) };
      go("describeBuild", o);
    });
    $$(".pickchip").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-k"), v = b.textContent;
        if (k === "adj") { if (P.adj.indexOf(v) < 0) P.adj = [P.adj[1], v]; }
        else P[k] = v;
        var y = window.scrollY; go("describeBuild", o); window.scrollTo(0, y);
      });
    });
    on("#keep", "click", function () {
      ms.built = (ms.built || []).concat([sentence()]).slice(-6); save();
      toast("Saved! Use it in your paragraph ⭐");
    });
  };
  VIEWS.describeWrite = function (o) {
    var ctx = o.ctx, ms = mState(ctx.hw.id, ctx.m.id);
    var labels = { time: "⏰ A time adverbial (with a comma)", noun: "🧩 An expanded noun phrase (two describing words + comma)", simile: "🦊 A simile (like a… / as … as)", caps: "🔠 Capital letters to start sentences", stops: "⚫ Full stop at the end", three: "📏 At least 3 sentences" };
    $app.innerHTML = mTop(ctx, "Write my paragraph") +
      '<div class="card"><p>Write <b>3 to 5 sentences</b> about your favourite character. Use all three tools!</p>' +
      ((ms.built || []).length ? '<p class="muted" style="margin-bottom:6px">Your saved sentences (tap to add):</p><div class="chips" style="margin-bottom:10px">' + ms.built.map(function (t, i) { return '<button class="chip idea usebuilt" data-i="' + i + '">' + esc(t) + "</button>"; }).join("") + "</div>" : "") +
      '<textarea id="para" class="sentbox" rows="7" placeholder="One rainy morning, the cheeky, sparkly-eyed…">' + esc(o.draft || ms.paragraph || "") + "</textarea>" +
      '<div class="checklist" id="chk"></div><div id="fb"></div><div style="height:10px"></div><button class="btn block coral" id="done">I\'m finished ✓</button></div>';
    wireBack(function () { o.draft = $("#para").value; go("hw_describe", ctx); });
    function refresh() {
      var r = featureCheck($("#para").value);
      $("#chk").innerHTML = Object.keys(labels).map(function (k) { return '<div class="ck ' + (r[k] ? "on" : "") + '"><span>' + (r[k] ? "✓" : "○") + "</span>" + labels[k] + "</div>"; }).join("");
      return r;
    }
    on("#para", "input", function () { $("#fb").innerHTML = ""; refresh(); });
    $$(".usebuilt").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = $("#para").value.trim();
        $("#para").value = (t ? t + " " : "") + ms.built[+b.getAttribute("data-i")];
        refresh();
      });
    });
    on("#done", "click", function () {
      var text = $("#para").value.trim().replace(/\s+/g, " ");
      var r = refresh(), miss = [];
      if (!r.three) miss.push("write at least 3 sentences");
      if (!r.time) miss.push("add a time adverbial, like <b>Yesterday,</b>");
      if (!r.noun) miss.push("add two describing words with a comma, like <b>the brave, curly-haired</b> …");
      if (!r.simile) miss.push("add a simile, like <b>as quiet as a mouse</b>");
      if (!r.stops) miss.push("finish with a full stop");
      if (miss.length) { $("#fb").innerHTML = '<div class="feedback bad">Nearly there! Can you:<br>' + miss.map(function (m) { return "• " + m; }).join("<br>") + "</div>"; return; }
      finishMission(ctx, { paragraph: text }, 5 + (r.caps ? 1 : 0));
      missionDone(ctx, "<h2>What a description!</h2><p class='mysent'>" + esc(text) + "</p>" + (r.caps ? "" : "<p class='muted'>Tip: check every sentence starts with a capital letter when you copy it.</p>"));
    });
    refresh();
  };

  // ----- rock hunt mission -----
  var ROCK_TYPE = { granite: "igneous", basalt: "igneous", pumice: "igneous", sandstone: "sedimentary", limestone: "sedimentary", chalk: "sedimentary", flint: "sedimentary", marble: "metamorphic", slate: "metamorphic" };
  var ROCK_FAM = {
    igneous: { emoji: "🌋", colour: "#ffe1d8", text: "Made when hot, runny rock (lava or magma) cools down and goes hard. Often has shiny crystals.", eg: "granite, basalt, pumice" },
    sedimentary: { emoji: "🏖️", colour: "#fff1c7", text: "Made from tiny bits of sand, mud and shells that settle in layers and get squashed together over millions of years. Can have fossils!", eg: "sandstone, limestone, chalk, flint" },
    metamorphic: { emoji: "🔥", colour: "#ebe3f6", text: "A rock that has been changed by lots of heat and squeezing deep underground.", eg: "marble (was limestone), slate (was mudstone)" }
  };
  var ROCK_OR_NOT = [
    ["🍽️", "Marble dining table", true, "marble"], ["🪣", "Plastic bucket", false, "plastic"], ["🍳", "Granite kitchen worktop", true, "granite"],
    ["🚪", "Wooden door", false, "wood"], ["🏠", "Slate roof tiles", true, "slate"], ["🧶", "Woolly jumper", false, "wool"],
    ["🖍️", "Chalk for drawing", true, "chalk"], ["🥄", "Metal spoon", false, "metal"], ["🧱", "Sandstone garden wall", true, "sandstone"],
    ["🪨", "Garden pebbles", true, "rock, often flint or granite"]
  ];
  VIEWS.hw_rocks = function (ctx) {
    var ms = mState(ctx.hw.id, ctx.m.id);
    var step = function (n, done, t, s, id) {
      return '<button class="mission small ' + (done ? "done" : "") + '" id="' + id + '" style="--mc:#7b5ea7;--mb:#ebe3f6"><div class="memoji">' + n + '</div><div style="flex:1"><div class="t">' + t + '</div><div class="s">' + s + '</div></div><div class="mgo">' + (done ? "✓" : "›") + "</div></button>";
    };
    $app.innerHTML = mTop(ctx) +
      step("🤔", ms.sorted != null, "1. Rock or not?", ms.sorted != null ? "Best: " + ms.sorted + " / " + ROCK_OR_NOT.length : "A quick sorting game", "s1") +
      step("🌋", ms.quiz != null, "2. Rock families", ms.quiz != null ? "Quiz: " + ms.quiz + " / 6" : "Igneous, sedimentary, metamorphic", "s2") +
      step("🔍", ms.done, "3. My rock hunt list", (ms.list || []).length + " things found", "s3");
    backToHub(ctx);
    on("#s1", "click", function () { go("rockSort", { ctx: ctx, order: shuffle(ROCK_OR_NOT), i: 0, score: 0 }); });
    on("#s2", "click", function () { go("rockFamilies", ctx); });
    on("#s3", "click", function () { go("rockList", ctx); });
  };
  VIEWS.rockSort = function (o) {
    var ctx = o.ctx, it = o.order[o.i];
    $app.innerHTML = mTop(ctx, "Rock or not? · " + (o.i + 1) + " of " + o.order.length) +
      '<div class="progressbar"><div style="width:' + (o.i / o.order.length * 100) + '%"></div></div>' +
      '<div class="card center"><div style="font-size:72px">' + it[0] + '</div><div class="scenario" style="margin:8px 0 20px">' + esc(it[1]) + "</div>" +
      '<div class="row"><button class="btn plum" id="y" style="flex:1">🪨 Rock</button><button class="btn ghost" id="n" style="flex:1">Not rock</button></div><div id="fb"></div></div>';
    wireBack(function () { go("hw_rocks", ctx); });
    function answer(rock) {
      var ok = rock === it[2]; if (ok) o.score++;
      $("#y").disabled = $("#n").disabled = true;
      $("#fb").innerHTML = '<div class="feedback ' + (ok ? "good" : "bad") + '">' + (ok ? "Yes! " : "Not quite. ") + (it[2] ? "It's made of <b>" + esc(it[3]) + "</b>, a kind of rock." : "It's made of " + esc(it[3]) + ", not rock.") + "</div>" +
        '<button class="btn block plum" id="next">' + (o.i + 1 < o.order.length ? "Next →" : "See my score") + "</button>";
      on("#next", "click", function () {
        if (o.i + 1 < o.order.length) { o.i++; return go("rockSort", o); }
        var ms = mState(ctx.hw.id, ctx.m.id);
        if (ms.sorted == null) S.prog.stars = (S.prog.stars || 0) + o.score;
        ms.sorted = Math.max(ms.sorted || 0, o.score); save(true);
        go("hw_rocks", ctx);
      });
    }
    on("#y", "click", function () { answer(true); });
    on("#n", "click", function () { answer(false); });
  };
  function rockCycleSvg() {
    return '<svg viewBox="0 0 320 250" class="cycle" role="img" aria-label="The rock cycle">' +
      '<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#7b5ea7"/></marker></defs>' +
      '<path d="M200 52 Q 280 80 268 150" fill="none" stroke="#7b5ea7" stroke-width="3" marker-end="url(#ah)"/>' +
      '<path d="M222 200 Q 160 238 98 200" fill="none" stroke="#7b5ea7" stroke-width="3" marker-end="url(#ah)"/>' +
      '<path d="M52 150 Q 40 80 120 52" fill="none" stroke="#7b5ea7" stroke-width="3" marker-end="url(#ah)"/>' +
      '<g><circle cx="160" cy="44" r="38" fill="#ffe1d8"/><text x="160" y="40" text-anchor="middle" font-size="22">🌋</text><text x="160" y="62" text-anchor="middle" font-size="11" font-weight="800">Igneous</text></g>' +
      '<g><circle cx="262" cy="190" r="38" fill="#fff1c7"/><text x="262" y="186" text-anchor="middle" font-size="22">🏖️</text><text x="262" y="208" text-anchor="middle" font-size="11" font-weight="800">Sedimentary</text></g>' +
      '<g><circle cx="58" cy="190" r="38" fill="#ebe3f6"/><text x="58" y="186" text-anchor="middle" font-size="22">🔥</text><text x="58" y="208" text-anchor="middle" font-size="11" font-weight="800">Metamorphic</text></g>' +
      '<text x="242" y="106" font-size="10.5" fill="#5d4583" text-anchor="end">wind and rain</text><text x="242" y="119" font-size="10.5" fill="#5d4583" text-anchor="end">break it into bits</text>' +
      '<text x="160" y="244" font-size="10.5" fill="#5d4583" text-anchor="middle">heat and squeezing change it</text>' +
      '<text x="80" y="106" font-size="10.5" fill="#5d4583">it melts,</text><text x="80" y="119" font-size="10.5" fill="#5d4583">then cools</text></svg>';
  }
  VIEWS.rockFamilies = function (ctx) {
    $app.innerHTML = mTop(ctx, "Rock families") +
      '<div class="card"><p>There are <b>3 families</b> of rock. You learned about <b>igneous</b> rocks a few weeks ago!</p>' +
      Object.keys(ROCK_FAM).map(function (k) { var f = ROCK_FAM[k]; return '<div class="featcard" style="background:' + f.colour + '"><div class="ft">' + f.emoji + " " + k.charAt(0).toUpperCase() + k.slice(1) + '</div><div class="fw">' + f.text + '</div><div class="fe">e.g. ' + f.eg + "</div></div>"; }).join("") + "</div>" +
      '<div class="card center"><h3>How rocks transform 🔄</h3>' + rockCycleSvg() + '<p class="muted">Rocks keep changing from one family to another, very, very slowly. This is the <b>rock cycle</b>.</p></div>' +
      '<button class="btn block plum" id="quiz">Rock families quiz 🎯</button>';
    wireBack(function () { go("hw_rocks", ctx); });
    on("#quiz", "click", function () {
      var qs = shuffle(Object.keys(ROCK_TYPE)).slice(0, 6).map(function (r) { return { rock: r, answer: ROCK_TYPE[r] }; });
      go("rockQuiz", { ctx: ctx, qs: qs, i: 0, score: 0 });
    });
  };
  VIEWS.rockQuiz = function (o) {
    var ctx = o.ctx, q = o.qs[o.i];
    $app.innerHTML = mTop(ctx, "Rock quiz · " + (o.i + 1) + " of " + o.qs.length) +
      '<div class="progressbar"><div style="width:' + (o.i / o.qs.length * 100) + '%"></div></div>' +
      '<div class="card"><h2 style="margin-bottom:14px">Which family is <b>' + q.rock + "</b> in?</h2>" +
      Object.keys(ROCK_FAM).map(function (k) { return '<button class="choice" data-k="' + k + '">' + ROCK_FAM[k].emoji + " " + k.charAt(0).toUpperCase() + k.slice(1) + "</button>"; }).join("") + '<div id="fb"></div></div>';
    wireBack(function () { go("rockFamilies", ctx); });
    $$(".choice").forEach(function (b) {
      b.addEventListener("click", function () {
        var ok = b.getAttribute("data-k") === q.answer; if (ok) o.score++;
        $$(".choice").forEach(function (c) { c.disabled = true; if (c.getAttribute("data-k") === q.answer) c.classList.add("right"); else if (c === b) c.classList.add("wrong"); });
        $("#fb").innerHTML = '<div class="feedback ' + (ok ? "good" : "bad") + '">' + (ok ? "Yes! " : "") + esc(q.rock.charAt(0).toUpperCase() + q.rock.slice(1)) + " is " + q.answer + ". " + ROCK_FAM[q.answer].emoji + "</div>" +
          '<button class="btn block plum" id="next">' + (o.i + 1 < o.qs.length ? "Next →" : "See my score") + "</button>";
        on("#next", "click", function () {
          if (o.i + 1 < o.qs.length) { o.i++; return go("rockQuiz", o); }
          var ms = mState(ctx.hw.id, ctx.m.id);
          if (ms.quiz == null) S.prog.stars = (S.prog.stars || 0) + o.score;
          ms.quiz = Math.max(ms.quiz || 0, o.score); save(true);
          go("hw_rocks", ctx);
        });
      });
    });
  };
  VIEWS.rockList = function (ctx) {
    var ms = mState(ctx.hw.id, ctx.m.id); ms.list = ms.list || [];
    var ideas = ["Kitchen worktop", "Dining table", "Front path", "Roof tiles", "Window sill", "Fireplace", "Doorstep", "Garden pebbles", "Garden wall"];
    $app.innerHTML = mTop(ctx, "My rock hunt list") +
      '<div class="tipbox" style="margin-bottom:14px">🔍 Look around your home and outside. What is made of rock? Ask a grown-up which rock it is if you\'re not sure. Bricks and concrete are made by people, so they aren\'t natural rocks!</div>' +
      (ms.list.length ? '<div class="card"><table><tr><th>Thing</th><th>Rock</th><th>Type</th><th></th></tr>' + ms.list.map(function (r, i) {
        return "<tr><td>" + esc(r.thing) + "</td><td>" + esc(r.rock) + "</td><td>" + esc(ROCK_TYPE[r.rock] || "?") + '</td><td><button class="btn small ghost rm" data-i="' + i + '" aria-label="Remove">×</button></td></tr>';
      }).join("") + "</table></div>" : "") +
      '<div class="card"><h3>Add something you found</h3><input id="thing" placeholder="e.g. kitchen worktop">' +
      '<div class="chips" style="margin:10px 0">' + ideas.map(function (t) { return '<button class="chip idea thingidea">' + t + "</button>"; }).join("") + "</div>" +
      '<label for="rock">What rock is it? (challenge)</label><select id="rock"><option value="not sure">Not sure</option>' +
      Object.keys(ROCK_TYPE).map(function (r) { return '<option value="' + r + '">' + r.charAt(0).toUpperCase() + r.slice(1) + " (" + ROCK_TYPE[r] + ")</option>"; }).join("") + "</select>" +
      '<div style="height:12px"></div><button class="btn block plum" id="add">Add to my list ➕</button></div>' +
      (ms.list.length >= 3 ? '<button class="btn block" id="fin">' + (ms.done ? "Update my list ⭐" : "My list is finished ⭐") + "</button>" : '<p class="muted center">Find at least 3 things to finish.</p>');
    wireBack(function () { go("hw_rocks", ctx); });
    $$(".thingidea").forEach(function (b) { b.addEventListener("click", function () { $("#thing").value = b.textContent; }); });
    $$(".rm").forEach(function (b) { b.addEventListener("click", function () { ms.list.splice(+b.getAttribute("data-i"), 1); save(); go("rockList", ctx); }); });
    on("#add", "click", function () {
      var t = $("#thing").value.trim().slice(0, 60); if (!t) { toast("Type what you found first!"); return; }
      ms.list.push({ thing: t, rock: $("#rock").value }); save(); go("rockList", ctx);
    });
    on("#fin", "click", function () {
      var named = ms.list.filter(function (r) { return ROCK_TYPE[r.rock]; }).length;
      finishMission(ctx, { list: ms.list }, 3 + named);
      missionDone(ctx, "<h2>Rock detective!</h2><p>You found <b>" + ms.list.length + "</b> things made of rock" + (named ? " and named " + named + " of the rocks 🪨" : "") + ".</p>");
    });
  };

  // ----- World Children's Day interviews -----
  var RIGHTS = [
    ["🛡️", "to be safe", "Nobody should hurt you. Grown-ups should keep you safe."],
    ["📚", "to learn", "Every child can go to school and learn."],
    ["🎈", "to play and rest", "Time to play, rest and have fun."],
    ["🩺", "to be healthy", "To see a doctor and get medicine when you're ill."],
    ["🍎", "to food and clean water", "Enough healthy food and clean water every day."],
    ["🏠", "to a home and family", "A safe place to live with people who care for you."],
    ["🪪", "to a name", "Every child has a name and belongs to a country."],
    ["🗣️", "to be heard", "To share your ideas and be listened to."]
  ];
  VIEWS.hw_rights = function (ctx) {
    var ms = mState(ctx.hw.id, ctx.m.id); ms.people = ms.people || [];
    $app.innerHTML = mTop(ctx) +
      '<div class="card"><p>On <b>' + esc(ctx.m.day) + "</b> it's <b>World Children's Day</b>. Every child in the world has <b>rights</b>: things every child needs to be safe, healthy and happy. Tap one to hear it.</p>" +
      '<div class="rights">' + RIGHTS.map(function (r, i) { return '<button class="rightcard" data-i="' + i + '"><div class="re">' + r[0] + '</div><div class="rn">The right ' + esc(r[1]) + '</div><div class="rt">' + esc(r[2]) + "</div></button>"; }).join("") + "</div></div>" +
      '<div class="card"><h3>🎤 Your job: interview 3 people</h3><p>Ask each person: <b>"Which right do you think is most important, and why?"</b></p>' +
      '<button class="btn small ghost" id="ask">🔊 Hear the question</button>' +
      '<p class="muted" style="margin-top:10px">Example answer: "I think the right to be safe is the most important because every child should feel safe and protected."</p></div>' +
      (ms.people.length ? '<div class="card"><h3>My interviews (' + ms.people.length + ' of 3)</h3>' + ms.people.map(function (p, i) {
        var r = RIGHTS[p.right];
        return '<div class="interview"><div class="iw">' + r[0] + " <b>" + esc(p.who) + "</b> chose the right " + esc(r[1]) + "</div>" + (p.why ? '<div class="iy">because ' + esc(p.why) + "</div>" : "") + '<button class="btn small ghost rmp" data-i="' + i + '">Remove</button></div>';
      }).join("") + "</div>" : "") +
      (ms.people.length < 3 ? '<button class="btn block sun" id="add">Add person ' + (ms.people.length + 1) + " 🎤</button>" : "");
    backToHub(ctx);
    $$(".rightcard").forEach(function (b) { b.addEventListener("click", function () { var r = RIGHTS[+b.getAttribute("data-i")]; speak("The right " + r[1] + ". " + r[2], 0.9); }); });
    on("#ask", "click", function () { speak("Which right do you think is most important, and why?", 0.9); });
    $$(".rmp").forEach(function (b) { b.addEventListener("click", function () { ms.people.splice(+b.getAttribute("data-i"), 1); ms.done = false; save(); go("hw_rights", ctx); }); });
    on("#add", "click", function () { go("rightsAdd", { ctx: ctx, right: null }); });
  };
  VIEWS.rightsAdd = function (o) {
    var ctx = o.ctx, ms = mState(ctx.hw.id, ctx.m.id);
    $app.innerHTML = mTop(ctx, "Interview " + (ms.people.length + 1) + " of 3") +
      '<div class="card"><label for="who" style="margin-top:0">Who did you ask?</label><input id="who" placeholder="e.g. Mum, Grandad, our neighbour" value="' + esc(o.who || "") + '">' +
      '<label>Which right did they choose?</label><div class="rights small">' + RIGHTS.map(function (r, i) {
        return '<button class="rightcard ' + (o.right === i ? "on" : "") + '" data-i="' + i + '"><div class="re">' + r[0] + '</div><div class="rn">' + esc(r[1]) + "</div></button>";
      }).join("") + "</div>" +
      '<label for="why">Why? (what did they say)</label><textarea id="why" rows="3" placeholder="because…">' + esc(o.why || "") + "</textarea>" +
      '<div id="fb"></div><div style="height:12px"></div><button class="btn block sun" id="save">Save interview ✓</button></div>';
    wireBack(function () { go("hw_rights", ctx); });
    $$(".rightcard").forEach(function (b) {
      b.addEventListener("click", function () { o.right = +b.getAttribute("data-i"); o.who = $("#who").value; o.why = $("#why").value; go("rightsAdd", o); });
    });
    on("#save", "click", function () {
      var who = $("#who").value.trim().slice(0, 40), why = $("#why").value.trim().replace(/^because\s+/i, "").slice(0, 300);
      if (!who) { $("#fb").innerHTML = '<div class="feedback bad">Who did you ask?</div>'; return; }
      if (o.right == null) { $("#fb").innerHTML = '<div class="feedback bad">Tap the right they chose.</div>'; return; }
      ms.people.push({ who: who, right: o.right, why: why }); save(true);
      if (ms.people.length >= 3) {
        finishMission(ctx, { people: ms.people }, 5);
        return missionDone(ctx, "<h2>Great interviewing!</h2>" + ms.people.map(function (p) { return '<p class="mysent"><b>' + esc(p.who) + "</b>: the right " + esc(RIGHTS[p.right][1]) + (p.why ? ", because " + esc(p.why) : "") + "</p>"; }).join(""));
      }
      go("hw_rights", ctx);
    });
  };

  // ----- times tables mission -----
  function factKey(a, b) { return Math.min(a, b) + "×" + Math.max(a, b); }
  function tipFor(a, b) {
    var lo = Math.min(a, b), hi = Math.max(a, b), other = function (n) { return a === n ? b : a; };
    if (lo === 1) return "Anything times 1 stays the same!";
    if (a === 10 || b === 10) return "Times 10: just put a 0 on the end! " + other(10) + " → " + other(10) * 10 + ".";
    if ((a === 11 || b === 11) && other(11) <= 9) return "Times 11 up to 9: write the number twice! 11 × " + other(11) + " = " + other(11) * 11 + ".";
    if (a === 2 || b === 2) return "Times 2: just double it! Double " + other(2) + " is " + other(2) * 2 + ".";
    if (a === 5 || b === 5) return "Times 5: do times 10, then halve it. " + other(5) + " × 10 = " + other(5) * 10 + ", half is " + other(5) * 5 + ".";
    if (a === 4 || b === 4) return "Times 4: double, then double again. " + other(4) + " → " + other(4) * 2 + " → " + other(4) * 4 + ".";
    if (a === 9 || b === 9) return "Times 9: do times 10, then take one away. " + other(9) + " × 10 = " + other(9) * 10 + ", take away " + other(9) + " = " + other(9) * 9 + ".";
    if (a === 12 || b === 12) return "Times 12: times 10, then add 2 more. " + other(12) + " × 10 = " + other(12) * 10 + ", plus " + other(12) * 2 + " = " + other(12) * 12 + ".";
    if (a === 11 || b === 11) return "Times 11: times 10, then add one more. " + other(11) * 10 + " + " + other(11) + " = " + other(11) * 11 + ".";
    if (lo === hi) return lo + " × " + lo + " is a square number: " + lo * lo + ".";
    return "Swap them round if it's easier: " + hi + " × " + lo + " is the same as " + lo + " × " + hi + ".";
  }
  function noteMiss(a, b, missed) {
    S.prog.tt = S.prog.tt || {};
    var k = factKey(a, b);
    if (missed) S.prog.tt[k] = (S.prog.tt[k] || 0) + 1;
    else if (S.prog.tt[k]) { S.prog.tt[k]--; if (!S.prog.tt[k]) delete S.prog.tt[k]; }
  }
  function trickyFacts(n) {
    var tt = S.prog.tt || {};
    return Object.keys(tt).sort(function (x, y) { return tt[y] - tt[x]; }).slice(0, n || 8);
  }
  var TT_ROUNDS = 5;
  // 20 questions from the sheet, the harder tables first.
  function ttPractice(m) {
    var seen = {}, list = [];
    m.facts.forEach(function (f) { var k = factKey(f[0], f[1]); if (!seen[k]) { seen[k] = 1; list.push(f); } });
    var easy = function (f) { return [1, 2, 5, 10].indexOf(f[0]) >= 0 || [1, 2, 5, 10].indexOf(f[1]) >= 0 ? 1 : 0; };
    var tricky = S.prog.tt || {};
    list.sort(function (x, y) { return (tricky[factKey(y[0], y[1])] || 0) - (tricky[factKey(x[0], x[1])] || 0) || easy(x) - easy(y); });
    return shuffle(list.slice(0, 20));
  }
  function ttRoundFacts(m, r) { var per = Math.ceil(m.facts.length / TT_ROUNDS); return m.facts.slice(r * per, (r + 1) * per); }
  VIEWS.hw_times = function (ctx) {
    var ms = mState(ctx.hw.id, ctx.m.id);
    var tricky = trickyFacts(6);
    $app.innerHTML = mTop(ctx, "Practise") +
      '<div class="card"><h3>💡 Times table tricks</h3><div class="tricks">' +
      [["🔄", "Swap them", "6 × 12 = 12 × 6"], ["🔟", "Times 10", "Put a 0 on the end"], ["9️⃣", "Times 9", "Times 10, take one away"], ["🧮", "Times 12", "Times 10, add 2 more"]]
        .map(function (t) { return '<div class="trick"><span>' + t[0] + "</span><b>" + t[1] + "</b><small>" + t[2] + "</small></div>"; }).join("") + "</div></div>" +
      '<div class="card center"><p><b>20 questions</b> from your sheet, the tricky ones first.</p>' +
      '<button class="btn block" id="go">Start ▶</button>' + (ms.best != null ? '<p class="muted" style="margin-top:8px">Best so far: ' + ms.best + " / 20</p>" : "") + "</div>" +
      (tricky.length ? '<div class="card"><h3>🎯 Your tricky ones</h3><div class="chips">' + tricky.map(function (k) { return '<span class="chip bad">' + k + "</span>"; }).join("") + "</div></div>" : "");
    backToHub(ctx);
    on("#go", "click", function () {
      go("timesQ", { ctx: ctx, qs: ttPractice(ctx.m).map(function (f) { return { a: f[0], b: f[1] }; }), i: 0, score: 0, retries: [], firstDone: 0, total: 20 });
    });
  };
  VIEWS.timesQ = function (o) {
    var ctx = o.ctx, q = o.qs[o.i], val = "", locked = false;
    var total = o.total;
    $app.innerHTML = mTop(ctx, Math.min(o.firstDone + 1, total) + " of " + total + (q.retry ? " · try again" : "")) +
      '<div class="progressbar"><div style="width:' + (o.firstDone / total * 100) + '%"></div></div>' +
      '<div class="card center"><div class="ttq">' + q.a + " × " + q.b + ' = <span class="ttans" id="ans">?</span></div><div id="fb" class="ttfb"></div>' +
      '<div class="pinpad tt">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, "⌫", 0, "✓"].map(function (k) { return '<button data-k="' + k + '">' + k + "</button>"; }).join("") + "</div></div>";
    wireBack(function () { if (confirm("Stop practising?")) go("job", ctx); });
    function show() { $("#ans").textContent = val || "?"; }
    function next() {
      o.i++;
      if (o.i >= o.qs.length && o.retries.length) { o.qs = o.qs.concat(o.retries); o.retries = []; }
      if (o.i < o.qs.length) return go("timesQ", o);
      var ms = mState(ctx.hw.id, ctx.m.id);
      ms.best = Math.max(ms.best || 0, o.score);
      finishMission(ctx, {}, o.score);
      missionDone(ctx, '<div class="score">' + o.score + " / " + total + "</div><p>" + (o.score === total ? "Every one right first time!" : "Great work! The tricky ones will come back to practise.") + "</p>");
    }
    function check() {
      if (!val || locked) return;
      locked = true;
      var ok = parseInt(val, 10) === q.a * q.b;
      if (!q.retry) { o.firstDone++; if (ok) o.score++; }
      noteMiss(q.a, q.b, !ok && !q.retry);
      if (ok) {
        $("#fb").innerHTML = '<div class="feedback good" style="margin:8px 0">' + pick(["Yes! ⭐", "Correct! 🎉", "Super! 🌟", "Brilliant! ✨"]) + "</div>";
        setTimeout(next, 650);
      } else {
        if (!q.retry) o.retries.push({ a: q.a, b: q.b, retry: true });
        $("#fb").innerHTML = '<div class="feedback bad" style="margin:8px 0"><b>' + q.a + " × " + q.b + " = " + q.a * q.b + "</b><br><small style='font-weight:500'>" + esc(tipFor(q.a, q.b)) + '</small></div><button class="btn block" id="nx">Got it →</button>';
        on("#nx", "click", next);
      }
    }
    $$(".pinpad.tt button").forEach(function (b) {
      b.addEventListener("click", function () {
        if (locked) return;
        var k = b.getAttribute("data-k");
        if (k === "⌫") val = val.slice(0, -1);
        else if (k === "✓") return check();
        else if (val.length < 3) val += k;
        show();
      });
    });
    var onKey = function (e) {
      if (!document.body.contains($("#ans"))) return document.removeEventListener("keydown", onKey);
      if (locked) return;
      if (/^[0-9]$/.test(e.key) && val.length < 3) { val += e.key; show(); }
      else if (e.key === "Backspace") { val = val.slice(0, -1); show(); }
      else if (e.key === "Enter") check();
    };
    document.addEventListener("keydown", onKey);
  };

  // ----- handwriting mission -----
  var ASC = "bdfhklt", DESC = "gjpqy";
  function letterKind(ch) {
    if (/[A-Z]/.test(ch)) return "asc";
    if (ASC.indexOf(ch) >= 0) return "asc";
    if (DESC.indexOf(ch) >= 0) return "desc";
    if (/[a-z]/.test(ch)) return "small";
    return "";
  }
  function writeLetters(text) {
    return text.split("").map(function (ch) { var k = letterKind(ch); return k && k !== "small" ? '<span class="lk-' + k + '">' + esc(ch) + "</span>" : esc(ch); }).join("");
  }
  VIEWS.hw_handwriting = function (ctx) {
    var ms = mState(ctx.hw.id, ctx.m.id);
    $app.innerHTML = mTop(ctx, "Practise") +
      '<div class="card"><h3>✏️ Three kinds of letter</h3>' +
      '<div class="hwlines big"><span class="lk-asc">b d f h k l t</span></div><p><b class="ink-asc">Tall letters</b> reach up high.</p>' +
      '<div class="hwlines big"><span>a c e m n o r s u</span></div><p><b>Small letters</b> are all the same size.</p>' +
      '<div class="hwlines big"><span class="lk-desc">g j p q y</span></div><p><b class="ink-desc">Tails</b> hang below the line.</p>' +
      '<button class="btn block coral" id="game">' + (ms.game != null ? "Play again" : "Play") + " Tall, small or tail? 🎯" + (ms.game != null ? " (best " + ms.game + "/8)" : "") + "</button></div>" +
      '<div class="card"><h3>👀 Look at your paragraph</h3><p class="muted">Tall letters are purple, tails are orange. Tap 🔊 to hear it.</p><div class="hwlines">' + writeLetters(ctx.m.paragraph) + "</div>" +
      '<div style="height:10px"></div><button class="btn small ghost" id="say">🔊 Hear it</button></div>' +
      (ms.game != null ? '<button class="btn block" id="fin">I\'m ready to write ✓</button>' : '<p class="muted center">Play the game first, then you\'re ready to write.</p>');
    backToHub(ctx);
    on("#say", "click", function () { speak(ctx.m.paragraph, 0.8); });
    on("#game", "click", function () { go("letterGame", { ctx: ctx, qs: shuffle((ASC + DESC + "acemnorsuvwxz").split("")).slice(0, 8), i: 0, score: 0 }); });
    on("#fin", "click", function () { finishMission(ctx, {}, 3); missionDone(ctx, "<h2>Ready to write!</h2><p>Remember: tall letters up high, tails below the line, small letters all the same size. ✨</p>"); });
  };
  VIEWS.letterGame = function (o) {
    var ctx = o.ctx, ch = o.qs[o.i], kind = letterKind(ch);
    $app.innerHTML = mTop(ctx, "Tall, small or tail? · " + (o.i + 1) + " of " + o.qs.length) +
      '<div class="progressbar"><div style="width:' + (o.i / o.qs.length * 100) + '%"></div></div>' +
      '<div class="card center"><div class="hwlines huge"><span>' + ch + "</span></div>" +
      '<div class="row" style="margin-top:14px"><button class="btn small plum lg" data-k="asc" style="flex:1">⬆️ Tall</button><button class="btn small lg" data-k="small" style="flex:1">◻️ Small</button><button class="btn small coral lg" data-k="desc" style="flex:1">⬇️ Tail</button></div><div id="fb"></div></div>';
    wireBack(function () { go("hw_handwriting", ctx); });
    $$("[data-k]").forEach(function (b) {
      b.addEventListener("click", function () {
        var ok = b.getAttribute("data-k") === kind; if (ok) o.score++;
        $$("[data-k]").forEach(function (x) { x.disabled = true; });
        var name = { asc: "a tall letter: it reaches up high", small: "a small letter: it sits on the line", desc: "a tail letter: it hangs below the line" }[kind];
        $("#fb").innerHTML = '<div class="feedback ' + (ok ? "good" : "bad") + '">' + (ok ? "Yes! " : "Not quite. ") + "<b>" + ch + "</b> is " + name + ".</div>" +
          '<button class="btn block" id="next">' + (o.i + 1 < o.qs.length ? "Next →" : "See my score") + "</button>";
        on("#next", "click", function () {
          if (o.i + 1 < o.qs.length) { o.i++; return go("letterGame", o); }
          var ms = mState(ctx.hw.id, ctx.m.id);
          if (ms.game == null) S.prog.stars = (S.prog.stars || 0) + o.score;
          ms.game = Math.max(ms.game || 0, o.score); save(true);
          go("hw_handwriting", ctx);
        });
      });
    });
  };

  // ----- Stone Age mission -----
  var STONE = [
    ["⛰️", "Cave or shelter", "Kept them dry and safe from wind, snow and wild animals."],
    ["🔥", "Fire", "Kept them warm, gave light, scared away animals and cooked their food."],
    ["🦌", "Animal skins", "Made into clothes and blankets to keep warm in the freezing Ice Age."],
    ["🗡️", "Spear", "A long stick with a sharp stone tip for hunting deer, bison and even mammoths."],
    ["🪨", "Stone tools", "Sharp flint hand axes for cutting meat, scraping skins and chopping wood."]
  ];
  function stoneSvg(labelled) {
    labelled = labelled || {};
    var spots = [[60, 72], [236, 150], [165, 128], [204, 30], [262, 196]];
    return '<svg viewBox="0 0 320 220" class="stonescene" role="img" aria-label="A Stone Age person by a cave">' +
      '<rect width="320" height="220" fill="#ddeefa"/><circle cx="285" cy="35" r="16" fill="#ffe08a"/>' +
      '<rect y="172" width="320" height="48" fill="#c9b48a"/>' +
      '<path d="M0 172 L0 38 Q60 4 128 58 L134 172 Z" fill="#8d8a86"/><path d="M22 172 Q28 92 68 86 Q104 92 104 172 Z" fill="#3e3a36"/>' +
      '<g transform="translate(236 168)"><path d="M-22 4 L22 -4 M-22 -4 L22 4" stroke="#7a4b2a" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M-16 -2 Q-18 -30 -4 -44 Q-6 -26 4 -22 Q2 -36 10 -48 Q20 -26 16 -2 Z" fill="#ff7a59"/><path d="M-8 -2 Q-8 -18 0 -26 Q2 -14 8 -12 Q10 -6 8 -2 Z" fill="#ffc93c"/></g>' +
      '<line x1="196" y1="22" x2="196" y2="178" stroke="#7a4b2a" stroke-width="5" stroke-linecap="round"/><path d="M196 6 L203 26 L189 26 Z" fill="#8d8a86"/>' +
      '<line x1="158" y1="150" x2="154" y2="180" stroke="#d9a77a" stroke-width="7" stroke-linecap="round"/><line x1="172" y1="150" x2="176" y2="180" stroke="#d9a77a" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M182 106 L196 96" stroke="#d9a77a" stroke-width="7" stroke-linecap="round"/><path d="M148 106 L138 130" stroke="#d9a77a" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M146 100 L184 100 L190 154 L180 148 L172 156 L164 148 L156 156 L148 148 L140 154 Z" fill="#9c6b3f"/>' +
      '<circle cx="156" cy="118" r="4" fill="#6e4a2a"/><circle cx="174" cy="128" r="5" fill="#6e4a2a"/><circle cx="160" cy="138" r="3" fill="#6e4a2a"/>' +
      '<circle cx="165" cy="84" r="15" fill="#d9a77a"/><path d="M150 82 Q150 64 165 66 Q182 64 181 84 Q176 72 165 74 Q154 72 150 82 Z" fill="#3e2a1a"/>' +
      '<circle cx="160" cy="86" r="1.8" fill="#23303b"/><circle cx="170" cy="86" r="1.8" fill="#23303b"/><path d="M160 93 Q165 96 170 93" stroke="#23303b" stroke-width="1.5" fill="none"/>' +
      '<path d="M284 202 Q292 180 302 202 Q293 210 284 202 Z" fill="#6f6b66" stroke="#4d4a46" stroke-width="1.5"/>' +
      spots.map(function (p, i) {
        var on = labelled[i];
        return '<g class="spot ' + (on ? "on" : "") + '"><circle cx="' + p[0] + '" cy="' + p[1] + '" r="11" fill="' + (on ? "#2bb673" : "#7b5ea7") + '" stroke="#fff" stroke-width="2"/><text x="' + p[0] + '" y="' + (p[1] + 4.5) + '" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">' + (i + 1) + "</text>" +
          (on ? '<text x="' + p[0] + '" y="' + (p[1] + (i === 3 ? 26 : -15)) + '" text-anchor="middle" class="spotlbl">' + STONE[i][1] + "</text>" : "") + "</g>";
      }).join("") + "</svg>";
  }
  VIEWS.hw_stoneage = function (ctx) {
    var ms = mState(ctx.hw.id, ctx.m.id);
    $app.innerHTML = mTop(ctx, "Practise") +
      '<div class="card"><p>The <b>Palaeolithic</b> is the <b>Old Stone Age</b>, in the Ice Age. People hunted animals, picked berries and moved from place to place.</p>' +
      '<div class="mapwrap" style="margin:6px 0 0">' + stoneSvg({}) + "</div></div>" +
      '<div class="card"><h3>5 things that helped them survive</h3>' + STONE.map(function (x) { return '<p class="survive"><span>' + x[0] + "</span><b>" + x[1] + ":</b> " + x[2] + "</p>"; }).join("") + "</div>" +
      '<button class="btn block plum" id="go">Label the picture game 🏷️' + (ms.labelGame != null ? " (best " + ms.labelGame + "/5)" : "") + "</button>";
    backToHub(ctx);
    on("#go", "click", function () { go("stoneLabel", { ctx: ctx, order: shuffle([0, 1, 2, 3, 4]), i: 0, score: 0, got: {} }); });
  };
  VIEWS.stoneLabel = function (o) {
    var ctx = o.ctx, n = o.order[o.i];
    $app.innerHTML = mTop(ctx, "Label the picture · " + (o.i + 1) + " of 5") +
      '<div class="mapwrap">' + stoneSvg(o.got) + "</div>" +
      '<div class="card"><h3 style="margin-bottom:12px">What is number <span class="dirbadge">' + (n + 1) + "</span>?</h3>" +
      shuffle([0, 1, 2, 3, 4]).map(function (k) { return '<button class="choice" data-k="' + k + '">' + STONE[k][0] + " " + STONE[k][1] + "</button>"; }).join("") + '<div id="fb"></div></div>';
    wireBack(function () { go("hw_stoneage", ctx); });
    $$(".choice").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = +b.getAttribute("data-k"), ok = k === n; if (ok) o.score++;
        o.got[n] = 1;
        $$(".choice").forEach(function (c) { c.disabled = true; if (+c.getAttribute("data-k") === n) c.classList.add("right"); else if (c === b) c.classList.add("wrong"); });
        $("#fb").innerHTML = '<div class="feedback ' + (ok ? "good" : "bad") + '">' + (ok ? "Yes! " : "It's the <b>" + STONE[n][1].toLowerCase() + "</b>. ") + esc(STONE[n][2]) + "</div>" +
          '<button class="btn block plum" id="next">' + (o.i + 1 < 5 ? "Next →" : "Finish") + "</button>";
        on("#next", "click", function () {
          if (o.i + 1 < 5) { o.i++; return go("stoneLabel", o); }
          var ms = mState(ctx.hw.id, ctx.m.id);
          ms.labelGame = Math.max(ms.labelGame || 0, o.score); ms.labelled = true;
          finishMission(ctx, {}, o.score);
          missionDone(ctx, '<div class="score">' + o.score + ' / 5</div><p>Now you know what to draw and label!</p>');
        });
      });
    });
  };
  VIEWS.stonePlan = function (o) {
    var ctx = o.ctx, ms = mState(ctx.hw.id, ctx.m.id);
    o.pick = o.pick || Object.keys(ms.labels || {}).map(Number);
    o.text = o.text || Object.assign({}, ms.labels || {});
    $app.innerHTML = mTop(ctx, "Plan my drawing") +
      '<div class="card"><p>Pick at least <b>3 things</b> to draw with your Palaeolithic person. Then write a short label for each one saying how it helped them survive.</p>' +
      '<div class="rights">' + STONE.map(function (s, i) { return '<button class="rightcard ' + (o.pick.indexOf(i) >= 0 ? "on" : "") + '" data-i="' + i + '"><div class="re">' + s[0] + '</div><div class="rn">' + s[1] + "</div></button>"; }).join("") + "</div></div>" +
      (o.pick.length ? '<div class="card"><h3>My labels</h3>' + o.pick.map(function (i) {
        return '<label for="lb' + i + '">' + STONE[i][0] + " " + STONE[i][1] + '</label><input id="lb' + i + '" class="lbl" data-i="' + i + '" value="' + esc(o.text[i] || "") + '" placeholder="e.g. ' + esc(STONE[i][1]) + ' helped them…">';
      }).join("") + "</div>" : "") +
      '<div id="fb"></div><button class="btn block plum" id="fin">My plan is ready ⭐</button>';
    wireBack(function () { go("hw_stoneage", ctx); });
    var grab = function () { $$(".lbl").forEach(function (x) { o.text[x.getAttribute("data-i")] = x.value; }); };
    $$(".rightcard").forEach(function (b) {
      b.addEventListener("click", function () {
        grab(); var i = +b.getAttribute("data-i"), at = o.pick.indexOf(i);
        if (at >= 0) o.pick.splice(at, 1); else o.pick.push(i);
        var y = window.scrollY; go("stonePlan", o); window.scrollTo(0, y);
      });
    });
    on("#fin", "click", function () {
      grab();
      var good = o.pick.filter(function (i) { return (o.text[i] || "").trim().split(/\s+/).length >= 3; });
      if (o.pick.length < 3) { $("#fb").innerHTML = '<div class="feedback bad">Pick at least 3 things to draw.</div>'; return; }
      if (good.length < 3) { $("#fb").innerHTML = '<div class="feedback bad">Write a label for each one, like "Fire kept them warm."</div>'; return; }
      var labels = {}; good.forEach(function (i) { labels[i] = o.text[i].trim().slice(0, 120); });
      finishMission(ctx, { labels: labels }, 5);
      missionDone(ctx, "<h2>Great Stone Age plan!</h2>" + good.map(function (i) { return '<p class="mysent">' + STONE[i][0] + " " + esc(labels[i]) + "</p>"; }).join(""));
    });
  };

  // ----- Children's Commissioner mission -----
  VIEWS.hw_commissioner = function (ctx) {
    var ms = mState(ctx.hw.id, ctx.m.id);
    var p = (ms.plans || [])[0] || {};
    $app.innerHTML = mTop(ctx, "Practise") +
      '<div class="card"><p>Imagine you are the <b>Children\'s Commissioner</b> for a day. Their job is to stand up for children. What would <b>you</b> change?</p>' +
      '<p class="muted">Example: "' + esc(ctx.m.example) + '"</p></div>' +
      '<div class="card"><div class="starter">I would …</div>' +
      '<div class="chips" style="margin-bottom:10px">' + ctx.m.ideas.map(function (t) { return '<button class="chip idea cidea">' + esc(t) + "</button>"; }).join("") + "</div>" +
      '<textarea id="what" class="sentbox" rows="2" placeholder="…make more parks">' + esc(p.what || "") + "</textarea>" +
      '<div class="starter" style="margin-top:12px">because …</div><textarea id="why" class="sentbox" rows="2" placeholder="…children need safe places to play">' + esc(p.why || "") + "</textarea>" +
      '<div id="fb"></div><div style="height:10px"></div><button class="btn block sun" id="add">That\'s my idea ✓</button></div>';
    backToHub(ctx);
    $$(".cidea").forEach(function (b) { b.addEventListener("click", function () { $("#what").value = b.textContent; $("#why").focus(); }); });
    on("#add", "click", function () {
      var what = $("#what").value.trim().replace(/^i would\s+/i, "").replace(/[.!]$/, ""), why = $("#why").value.trim().replace(/^because\s+/i, "").replace(/[.!]$/, "");
      if (what.split(/\s+/).length < 2) { $("#fb").innerHTML = '<div class="feedback bad">What would you change? Tap an idea or write your own.</div>'; return; }
      if (why.split(/\s+/).length < 3) { $("#fb").innerHTML = '<div class="feedback bad">Now say <b>why</b>, after "because".</div>'; return; }
      finishMission(ctx, { plans: [{ what: what.slice(0, 160), why: why.slice(0, 240) }] }, 4);
      missionDone(ctx, '<h2>Great idea!</h2><p class="mysent">I would ' + esc(what) + " because " + esc(why) + ".</p>");
    });
  };

  // ----- homework egg, pets and Pet Catch game -----
  var PETS = [
    { id: "dragon", name: "baby dragon", body: "#5cc48a", belly: "#d8f5c4", spot: "#3e9e69" },
    { id: "chick", name: "fluffy chick", body: "#ffd84d", belly: "#fff3b8", spot: "#f0b400" },
    { id: "dino", name: "little dino", body: "#4ea8de", belly: "#d5ecfa", spot: "#2f7fb3" },
    { id: "owl", name: "baby owl", body: "#b98a5e", belly: "#f1dfc6", spot: "#8a6038" },
    { id: "penguin", name: "baby penguin", body: "#3d4a5c", belly: "#ffffff", spot: "#9fb4c7" },
    { id: "unicorn", name: "baby unicorn", body: "#f3c6e8", belly: "#fff0fa", spot: "#d987c4" }
  ];
  function petFor(hwId) {
    var h = 0; for (var i = 0; i < hwId.length; i++) h = (h * 31 + hwId.charCodeAt(i)) >>> 0;
    return PETS[h % PETS.length];
  }
  function petById(id) { return PETS.find(function (p) { return p.id === id; }) || PETS[0]; }
  function creatureSvg(pet, size) {
    var b = pet.body, be = pet.belly, s = '<svg viewBox="0 0 100 100" width="' + (size || 100) + '" height="' + (size || 100) + '" xmlns="http://www.w3.org/2000/svg">';
    if (pet.id === "dragon") s += '<path d="M22 52 Q2 36 8 62 Q16 60 24 66 Z" fill="' + pet.spot + '"/><path d="M78 52 Q98 36 92 62 Q84 60 76 66 Z" fill="' + pet.spot + '"/>';
    if (pet.id === "penguin") s += '<ellipse cx="20" cy="62" rx="7" ry="16" fill="' + b + '" transform="rotate(20 20 62)"/><ellipse cx="80" cy="62" rx="7" ry="16" fill="' + b + '" transform="rotate(-20 80 62)"/>';
    if (pet.id === "chick" || pet.id === "owl") s += '<ellipse cx="22" cy="62" rx="8" ry="13" fill="' + pet.spot + '" transform="rotate(25 22 62)"/><ellipse cx="78" cy="62" rx="8" ry="13" fill="' + pet.spot + '" transform="rotate(-25 78 62)"/>';
    if (pet.id === "dino") s += '<path d="M38 28 L44 16 L50 27 L56 15 L62 28 Z" fill="' + pet.spot + '"/>';
    if (pet.id === "owl") s += '<path d="M28 34 L30 18 L42 30 Z M72 34 L70 18 L58 30 Z" fill="' + pet.spot + '"/>';
    if (pet.id === "dragon") s += '<path d="M36 30 L38 16 L45 28 Z M64 30 L62 16 L55 28 Z" fill="#ffd84d"/>';
    if (pet.id === "unicorn") s += '<path d="M46 28 L50 6 L54 28 Z" fill="#ffd84d" stroke="#e0b400" stroke-width="1"/><path d="M30 34 Q24 24 36 28 Z M70 34 Q76 24 64 28 Z" fill="' + pet.spot + '"/>';
    if (pet.id === "chick") s += '<path d="M46 24 Q50 12 54 24 Q58 14 58 26 Z" fill="' + pet.spot + '"/>';
    s += '<ellipse cx="50" cy="58" rx="30" ry="32" fill="' + b + '"/><ellipse cx="50" cy="66" rx="19" ry="21" fill="' + be + '"/>';
    s += '<circle cx="40" cy="48" r="' + (pet.id === "owl" ? 10 : 8) + '" fill="#fff"/><circle cx="60" cy="48" r="' + (pet.id === "owl" ? 10 : 8) + '" fill="#fff"/>';
    s += '<circle cx="41" cy="49" r="4.5" fill="#23303b"/><circle cx="61" cy="49" r="4.5" fill="#23303b"/><circle cx="42.5" cy="47" r="1.6" fill="#fff"/><circle cx="62.5" cy="47" r="1.6" fill="#fff"/>';
    s += '<ellipse cx="31" cy="60" rx="5" ry="3" fill="#ff9aa8" opacity=".7"/><ellipse cx="69" cy="60" rx="5" ry="3" fill="#ff9aa8" opacity=".7"/>';
    if (pet.id === "chick" || pet.id === "owl" || pet.id === "penguin") s += '<path d="M45 57 L55 57 L50 64 Z" fill="#ff9a3c"/>';
    else s += '<path d="M44 59 Q50 65 56 59" stroke="#23303b" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
    s += '<ellipse cx="39" cy="90" rx="8" ry="4" fill="#ff9a3c"/><ellipse cx="61" cy="90" rx="8" ry="4" fill="#ff9a3c"/></svg>';
    return s;
  }
  function eggSvg(pet, stage, total) {
    var cracks = "";
    if (stage >= Math.ceil(total / 2)) cracks += '<path d="M30 60 L38 54 L44 62 L52 54" fill="none" stroke="#8a7a66" stroke-width="2.4" stroke-linejoin="round"/>';
    if (stage >= total - 1) cracks += '<path d="M52 54 L60 62 L66 52 L74 58" fill="none" stroke="#8a7a66" stroke-width="2.4" stroke-linejoin="round"/><path d="M44 62 L42 74 L50 80" fill="none" stroke="#8a7a66" stroke-width="2" stroke-linejoin="round"/>';
    if (stage >= total) cracks += '<path d="M60 62 L62 76 L56 86" fill="none" stroke="#8a7a66" stroke-width="2" stroke-linejoin="round"/>';
    return '<svg viewBox="0 0 100 120" class="egg" role="img" aria-label="An egg">' +
      '<ellipse cx="50" cy="114" rx="34" ry="5" fill="#000" opacity=".08"/>' +
      '<path d="M50 6 C78 6 92 50 92 74 C92 100 72 114 50 114 C28 114 8 100 8 74 C8 50 22 6 50 6Z" fill="#fffaf0" stroke="#e8dcc6" stroke-width="2"/>' +
      '<circle cx="34" cy="38" r="7" fill="' + pet.body + '"/><circle cx="64" cy="30" r="5" fill="' + pet.spot + '"/><circle cx="70" cy="84" r="9" fill="' + pet.body + '"/><circle cx="28" cy="92" r="5" fill="' + pet.spot + '"/><circle cx="56" cy="98" r="4" fill="' + pet.body + '"/>' +
      '<path d="M30 22 Q36 14 44 12" stroke="#fff" stroke-width="4" stroke-linecap="round" fill="none" opacity=".9"/>' + cracks + "</svg>";
  }
  function eggCard(hw, st, d, n) {
    var pet = petFor(hw.id), info = st.pet;
    if (info && info.hatched) {
      return '<div class="card center eggcard hatched"><div class="petbox">' + creatureSvg(pet, 130) + '</div><h2>' + esc(info.name || "My pet") + "</h2>" +
        '<p class="muted">Your ' + pet.name + " hatched because you finished all your homework! 🎉</p>" +
        '<button class="btn block sun" id="play">Play Pet Catch 🎮</button></div>';
    }
    var scale = (0.55 + 0.45 * d / n).toFixed(2);
    if (d === n) return '<div class="card center eggcard"><div class="eggbox wobble" style="--s:1">' + eggSvg(pet, d, n) + '</div><h2>Your egg is ready to hatch!</h2><button class="btn block sun" id="hatch">Hatch my egg 🐣</button></div>';
    return '<div class="card eggcard compact"><div class="eggbox ' + (d >= n - 1 ? "wobble" : "") + '" style="--s:' + scale + '">' + eggSvg(pet, d, n) + "</div>" +
      "<div><b>Your egg is growing!</b><br>" + (n - d === 1 ? "Just <b>1</b> more job and it will hatch! 👀" : "Finish <b>" + (n - d) + "</b> more jobs on paper to hatch it.") +
      '<div class="eggdots">' + Array.apply(null, Array(n)).map(function (_, i) { return '<span class="' + (i < d ? "on" : "") + '"></span>'; }).join("") + "</div></div></div>";
  }
  VIEWS.hatch = function (hwId) {
    var hw = hwById(hwId), st = hwState(hwId), pet = petFor(hwId), n = hwMissions(hw).length, taps = 0;
    function renderEgg() {
      $app.innerHTML = topbar("Hatching! 🐣", true) +
        '<div class="card center"><p class="muted">Tap the egg to help it hatch!</p><button class="eggtap ' + (taps ? "shake" : "") + '" id="egg" aria-label="Tap the egg">' + eggSvg(pet, n + taps, n) + "</button>" +
        '<div class="eggdots big">' + [0, 1, 2].map(function (i) { return '<span class="' + (i < taps ? "on" : "") + '"></span>'; }).join("") + "</div></div>";
      wireBack(function () { go("hwHub", hwId); });
      on("#egg", "click", function () {
        taps++;
        if (taps < 3) return renderEgg();
        reveal();
      });
    }
    function reveal() {
      $app.innerHTML = topbar("Hatched! 🎉", false) +
        '<div class="card center"><div class="confetti">🎉 ✨ ⭐ ✨ 🎉</div><div class="petbox pop">' + creatureSvg(pet, 160) + "</div>" +
        "<h2>It's a " + pet.name + "!</h2><p>What will you call your new pet?</p>" +
        '<input id="pname" maxlength="16" placeholder="Pet\'s name" style="text-align:center">' +
        '<div style="height:12px"></div><button class="btn block sun" id="save">That\'s its name! ✓</button></div>';
      speak("Hooray! It's a " + pet.name + "!", 0.95);
      setTimeout(function () { var i = $("#pname"); if (i) i.focus(); }, 300);
      on("#save", "click", function () {
        var nm = $("#pname").value.trim().slice(0, 16) || "Sparkle";
        st.pet = { kind: pet.id, name: nm, hatched: today() };
        S.prog.stars = (S.prog.stars || 0) + 10;
        save(true);
        go("petGame", { pet: pet.id, name: nm, back: function () { go("hwHub", hwId); } });
      });
    }
    renderEgg();
  };
  function myPets() {
    var out = [];
    (window.HOMEWORK || []).forEach(function (hw) { var st = (S.prog.hw || {})[hw.id]; if (st && st.pet && st.pet.hatched) out.push({ hw: hw.id, kind: st.pet.kind, name: st.pet.name }); });
    return out;
  }
  function petsStrip() {
    var pets = myPets();
    if (!pets.length) return "";
    return '<div class="card"><h3>🐾 My pets</h3><div class="petstrip">' + pets.map(function (p, i) {
      return '<button class="petchip" data-i="' + i + '">' + creatureSvg(petById(p.kind), 56) + "<span>" + esc(p.name) + "</span></button>";
    }).join("") + '</div><p class="muted" style="margin-top:6px">Tap a pet to play Pet Catch.</p></div>';
  }
  function wirePetsStrip() {
    var pets = myPets();
    $$(".petchip").forEach(function (b) {
      b.addEventListener("click", function () { var p = pets[+b.getAttribute("data-i")]; go("petGame", { pet: p.kind, name: p.name, back: function () { go("home"); } }); });
    });
  }

  VIEWS.petGame = function (o) {
    var pet = petById(o.pet);
    $app.innerHTML = topbar("Pet Catch 🎮", true) +
      '<div class="gamehud"><span id="score">⭐ 0</span><span id="lives">❤️❤️❤️</span><span class="muted">Best ' + (S.prog.petBest || 0) + "</span></div>" +
      '<div class="gamewrap"><canvas id="cv"></canvas><div class="gameover" id="ov"><div class="petbox">' + creatureSvg(pet, 96) + "</div><h2>Help " + esc(o.name) + " catch the treats!</h2>" +
      '<p>⭐ = 1 point &nbsp; 🍓 = 2 points &nbsp; 💎 = 5 points<br>Dodge the 🪨 rocks!</p><p class="muted">Drag or tap left and right. Arrow keys work too.</p><button class="btn sun" id="start">Start! ▶</button></div></div>';
    wireBack(function () { stop(); o.back(); });
    var cv = $("#cv"), wrap = cv.parentNode, ctx2 = cv.getContext("2d");
    var W = wrap.clientWidth, H = Math.min(520, Math.max(380, window.innerHeight - 190)), dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px"; ctx2.scale(dpr, dpr);
    var img = new Image(); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(creatureSvg(pet, 100));
    var PW = 70, px = W / 2, target = W / 2, items = [], score = 0, lives = 3, running = false, t0 = 0, lastSpawn = 0, raf = null, flash = 0;
    var KINDS = [["⭐", 1, 52], ["🍓", 2, 24], ["💎", 5, 6], ["🪨", -1, 18]];
    function pickKind() { var r = Math.random() * 100, acc = 0; for (var i = 0; i < KINDS.length; i++) { acc += KINDS[i][2]; if (r < acc) return KINDS[i]; } return KINDS[0]; }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); document.removeEventListener("keydown", onKey); }
    function onKey(e) {
      if (!document.body.contains(cv)) return stop();
      if (e.key === "ArrowLeft") { target = Math.max(PW / 2, target - 40); e.preventDefault(); }
      if (e.key === "ArrowRight") { target = Math.min(W - PW / 2, target + 40); e.preventDefault(); }
    }
    document.addEventListener("keydown", onKey);
    function setTarget(e) { var r = cv.getBoundingClientRect(); target = Math.max(PW / 2, Math.min(W - PW / 2, e.clientX - r.left)); }
    cv.addEventListener("pointerdown", function (e) { setTarget(e); });
    cv.addEventListener("pointermove", function (e) { if (e.buttons || e.pointerType === "touch") setTarget(e); });
    cv.style.touchAction = "none";
    function hud() { $("#score").textContent = "⭐ " + score; $("#lives").textContent = "❤️".repeat(lives) + "🤍".repeat(3 - lives); }
    function draw(ts) {
      ctx2.clearRect(0, 0, W, H);
      var g = ctx2.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#ddeefa"); g.addColorStop(1, "#fff8ec");
      ctx2.fillStyle = g; ctx2.fillRect(0, 0, W, H);
      ctx2.fillStyle = "#bfe3b4"; ctx2.fillRect(0, H - 22, W, 22);
      ctx2.font = "30px sans-serif"; ctx2.textAlign = "center"; ctx2.textBaseline = "middle";
      items.forEach(function (it) { ctx2.fillText(it.k[0], it.x, it.y); });
      if (flash > 0) { ctx2.globalAlpha = 0.5; }
      if (img.complete) ctx2.drawImage(img, px - PW / 2, H - 22 - PW + 6, PW, PW);
      ctx2.globalAlpha = 1;
    }
    function frame(ts) {
      if (!running) return;
      if (!document.body.contains(cv)) return stop();
      var el = (ts - t0) / 1000, speed = 2.2 + Math.min(5, el / 12), every = Math.max(380, 950 - el * 14);
      if (ts - lastSpawn > every) { lastSpawn = ts; items.push({ k: pickKind(), x: 20 + Math.random() * (W - 40), y: -20, v: speed * (0.8 + Math.random() * 0.5) }); }
      px += (target - px) * 0.25;
      var top = H - 22 - PW + 18;
      items = items.filter(function (it) {
        it.y += it.v;
        if (it.y > top && it.y < H - 20 && Math.abs(it.x - px) < PW / 2 + 6) {
          if (it.k[1] < 0) { lives--; flash = 30; } else score += it.k[1];
          hud(); return false;
        }
        return it.y < H + 30;
      });
      if (flash > 0) flash--;
      draw(ts);
      if (lives <= 0) return over();
      raf = requestAnimationFrame(frame);
    }
    function over() {
      stop();
      var best = S.prog.petBest || 0, isBest = score > best;
      if (isBest) { S.prog.petBest = score; save(); }
      $("#ov").innerHTML = '<div class="petbox">' + creatureSvg(pet, 90) + "</div><h2>" + (isBest ? "New best score! 🏆" : "Great catching!") + '</h2><div class="score">' + score + "</div>" +
        '<p class="muted">Best: ' + Math.max(best, score) + '</p><div class="row" style="justify-content:center"><button class="btn sun" id="again">Play again ↻</button><button class="btn ghost" id="done">Done</button></div>';
      $("#ov").style.display = "flex";
      on("#again", "click", start);
      on("#done", "click", function () { o.back(); });
    }
    function start() {
      items = []; score = 0; lives = 3; px = target = W / 2; flash = 0; hud();
      $("#ov").style.display = "none";
      running = true; document.addEventListener("keydown", onKey);
      raf = requestAnimationFrame(function (ts) { t0 = ts; lastSpawn = ts; frame(ts); });
    }
    on("#start", "click", start);
    img.onload = function () { draw(0); };
    draw(0);
  };

  // ----- streak surprises and sticker book -----
  var STREAKS = {
    spell: { name: "spelling", emoji: "✏️" },
    tricky: { name: "tricky words", emoji: "🎯" },
    nums: { name: "number families", emoji: "🔢" }
  };
  var STICKERS = [
    ["🦄", "Unicorn"], ["🐬", "Dolphin"], ["🦋", "Butterfly"], ["🌈", "Rainbow"], ["🍩", "Doughnut"], ["🚀", "Rocket"],
    ["🦖", "T-rex"], ["🐼", "Panda"], ["🌻", "Sunflower"], ["🍓", "Strawberry"], ["🎈", "Balloon"], ["🐙", "Octopus"],
    ["🦉", "Owl"], ["🐢", "Turtle"], ["🍉", "Watermelon"], ["⚽", "Football"], ["🎨", "Paints"], ["🧁", "Cupcake"],
    ["🐝", "Bee"], ["🦊", "Fox"], ["🌙", "Moon"], ["🪐", "Planet"], ["🐳", "Whale"], ["🦜", "Parrot"],
    ["🍦", "Ice cream"], ["🚲", "Bike"], ["🐞", "Ladybird"], ["🦔", "Hedgehog"], ["🎠", "Carousel"], ["🐧", "Penguin"]
  ];
  var GOLD = [["🏆", "Golden trophy"], ["👑", "Golden crown"], ["💎", "Super diamond"], ["🥇", "Gold medal"], ["🌟", "Superstar"], ["🐉", "Golden dragon"]];
  var MILESTONES = [3, 5, 7, 10, 14, 21, 30, 50, 75, 100];
  var EXTRAS = [
    ["😂", "Why did the teddy bear say no to pudding? Because she was stuffed!"],
    ["😂", "What do you call a sleeping dinosaur? A dino-snore!"],
    ["😂", "Why is 6 afraid of 7? Because 7, 8, 9!"],
    ["😂", "What has hands but can't clap? A clock!"],
    ["😂", "Why can't a bicycle stand up on its own? Because it's two-tyred!"],
    ["😂", "What do elves learn at school? The elf-abet!"],
    ["😂", "How do you make an octopus laugh? With ten-tickles!"],
    ["😂", "What did one plate say to the other? Lunch is on me!"],
    ["🤓", "Fun fact: a group of flamingos is called a flamboyance!"],
    ["🤓", "Fun fact: an octopus has three hearts!"],
    ["🤓", "Fun fact: butterflies taste things with their feet!"],
    ["🤓", "Fun fact: sea otters hold hands when they sleep so they don't float apart."],
    ["🤓", "Fun fact: bananas are berries, but strawberries aren't!"],
    ["🤓", "Fun fact: honey can stay good to eat for thousands of years."]
  ];
  function streakFor(key) {
    var d = today();
    if (!(S.prog.days[d] && S.prog.days[d][key])) d = addDays(d, -1);
    var n = 0;
    while (S.prog.days[d] && S.prog.days[d][key]) { n++; d = addDays(d, -1); }
    return n;
  }
  // Called when an activity is finished. Marks today and returns a surprise
  // the first time each day that a streak of 2 or more days is kept going.
  function giftCheck(key) {
    var d = dayRec();
    if (!d[key]) d[key] = true;
    d.gift = d.gift || {};
    if (d.gift[key]) return null;
    var st = streakFor(key);
    S.prog.bests = S.prog.bests || {};
    if (st > (S.prog.bests[key] || 0)) S.prog.bests[key] = st;
    if (st < 2) { save(); return { key: key, streak: st, none: true }; }
    d.gift[key] = 1; save();
    return { key: key, streak: st };
  }
  function giftButton(g) {
    if (!g) return "";
    if (g.none) return '<div class="tipbox" style="margin-top:12px">🔥 You started a <b>' + STREAKS[g.key].name + ' streak</b>! Come back tomorrow to keep it going, and a surprise 🎁 will be waiting.</div>';
    return '<button class="btn block gift" id="gift">🎁 Open your streak surprise!</button>';
  }
  function wireGift(g, back) { on("#gift", "click", function () { go("surprise", { g: g, back: back }); }); }
  VIEWS.surprise = function (o) {
    var g = o.g, S2 = STREAKS[g.key], mile = MILESTONES.indexOf(g.streak) >= 0;
    $app.innerHTML = topbar("Surprise! 🎁", false) +
      '<div class="card center"><p><b>🔥 ' + g.streak + " day " + S2.name + " streak!</b><br>You kept it going. Tap the box to open it!</p>" +
      '<button class="giftbox ' + (mile ? "gold" : "") + '" id="box" aria-label="Open the surprise">🎁</button></div>';
    on("#box", "click", function () {
      S.prog.stickers = S.prog.stickers || {};
      var have = S.prog.stickers, st;
      if (mile) st = pick(GOLD);
      else {
        var fresh = STICKERS.filter(function (s) { return !have[s[0]]; });
        st = fresh.length && Math.random() < 0.75 ? pick(fresh) : pick(STICKERS);
      }
      var isNew = !have[st[0]];
      have[st[0]] = (have[st[0]] || 0) + 1;
      var bonus = mile ? g.streak : 1;
      S.prog.stars = (S.prog.stars || 0) + bonus;
      var extra = pick(EXTRAS);
      save(true);
      $app.innerHTML = topbar("Surprise! 🎁", false) +
        '<div class="card center"><div class="confetti">🎉 ✨ ⭐ ✨ 🎉</div>' +
        '<div class="sticker big ' + (mile ? "gold" : "") + '">' + st[0] + "</div>" +
        "<h2>" + (mile ? "A golden sticker!" : isNew ? "A new sticker!" : "Another one!") + "</h2><p><b>" + st[1] + "</b> " + (isNew ? "is going in your sticker book." : "– you've got " + have[st[0]] + " now!") + "</p>" +
        (mile ? '<div class="tipbox">🏅 <b>' + g.streak + "-day streak!</b> That's amazing. +" + bonus + " bonus stars ⭐</div>" : '<p class="muted">+1 star ⭐</p>') +
        '<div class="extra">' + extra[0] + " " + esc(extra[1]) + "</div>" +
        '<div class="row" style="margin-top:14px"><button class="btn ghost" id="book" style="flex:1">📒 Sticker book</button><button class="btn" id="cont" style="flex:1">Continue →</button></div></div>';
      speak(mile ? "Wow! A golden sticker!" : isNew ? "A new sticker! " + st[1] : "Another " + st[1] + " sticker!", 0.95);
      on("#book", "click", function () { go("stickers", { back: o.back }); });
      on("#cont", "click", o.back);
    });
  };
  VIEWS.stickers = function (o) {
    var have = S.prog.stickers || {}, back = (o && o.back) || function () { go("home"); };
    var got = STICKERS.concat(GOLD).filter(function (s) { return have[s[0]]; }).length;
    var bests = S.prog.bests || {};
    $app.innerHTML = topbar("My sticker book 📒", true) +
      '<div class="card"><p>Keep a streak going for 2 days or more to win a sticker. Golden stickers come at 3, 5, 7, 10, 14, 21 and 30 days!</p>' +
      '<div class="chips">' + Object.keys(STREAKS).map(function (k) { return '<span class="chip">' + STREAKS[k].emoji + " " + STREAKS[k].name + ": 🔥 " + streakFor(k) + (bests[k] ? " (best " + bests[k] + ")" : "") + "</span>"; }).join("") + "</div></div>" +
      '<div class="card"><h3>Golden stickers</h3><div class="stickergrid">' + GOLD.map(function (s) { return stickerCell(s, have, true); }).join("") + "</div></div>" +
      '<div class="card"><h3>Stickers · ' + got + " of " + (STICKERS.length + GOLD.length) + '</h3><div class="stickergrid">' + STICKERS.map(function (s) { return stickerCell(s, have, false); }).join("") + "</div></div>";
    wireBack(back);
  };
  function stickerCell(s, have, gold) {
    var n = have[s[0]];
    return '<div class="sticker ' + (gold ? "gold " : "") + (n ? "" : "missing") + '" title="' + s[1] + '">' + (n ? s[0] : "?") + (n > 1 ? "<i>×" + n + "</i>" : "") + "</div>";
  }

  // ----- review: earlier weeks' spellings and maths keep coming back -----
  var _hwWords = null;
  function HW_WORDS() {
    if (_hwWords) return _hwWords;
    _hwWords = {};
    (window.HOMEWORK || []).forEach(function (hw) {
      var add = function (words, unit) {
        words.forEach(function (w) { var k = wordKey(w[0]); if (!_hwWords[k]) _hwWords[k] = { word: w[0], sentence: w[1], unit: unit, due: hw.due }; });
      };
      if (hw.spelling) add(hw.spelling.words, hw.id + ":spell");
      (hw.missions || []).forEach(function (m) { if (m.type === "spelling") add(m.words, hw.id + ":" + m.id); });
    });
    return _hwWords;
  }
  function hwSpellWords(hw) {
    var out = [];
    if (hw.spelling) out = out.concat(hw.spelling.words);
    (hw.missions || []).forEach(function (m) { if (m.type === "spelling") out = out.concat(m.words); });
    return out;
  }
  // Words from homework already handed in go straight into the review cycle
  // (she learned them on paper), spread over 3 days so no test is too long.
  function seedPastHomework() {
    var t = today(), changed = false, i = 0;
    (window.HOMEWORK || []).forEach(function (hw) {
      if (hw.due >= t) return;
      hwSpellWords(hw).forEach(function (w) {
        var k = wordKey(w[0]);
        if (S.prog.words[k]) { if (!S.prog.words[k].s) { S.prog.words[k].s = 1; changed = true; } return; }
        S.prog.words[k] = { w: w[0], b: 1, r: 0, x: 0, first: t, last: hw.due, due: addDays(t, i++ % 3), s: 1, sen: w[1] };
        changed = true;
      });
    });
    return changed;
  }
  // Up to 6 words from earlier homework, weakest first, for the weekly test.
  function reviewWords(hw, exclude) {
    var keys = [];
    (window.HOMEWORK || []).forEach(function (h) {
      if (h.due >= hw.due) return;
      hwSpellWords(h).forEach(function (w) { var k = wordKey(w[0]); if (exclude.indexOf(k) < 0 && keys.indexOf(k) < 0) keys.push(k); });
    });
    var score = function (k) { var e = S.prog.words[k]; return e ? e.b * 10 - e.x * 3 : 15; };
    return shuffle(keys).sort(function (a, b) { return score(a) - score(b); }).slice(0, 6);
  }

  var SKILLS = {
    moreless: { name: "1, 10 and 100 more or less", gen: function () {
      var n = rand(120, 880), d = pick([1, 10, 100]), more = Math.random() < 0.5, ans = more ? n + d : n - d;
      var place = { 1: "ones", 10: "tens", 100: "hundreds" }[d], digit = Math.floor(n / d) % 10;
      var cross = more ? digit === 9 : digit === 0;
      return { q: "What is <b>" + d + " " + (more ? "more" : "less") + "</b> than <b>" + n + "</b>?", answer: ans,
        explain: d + " " + (more ? "more" : "less") + " changes the <b>" + place + "</b>: " + n + " → " + ans + "." + (cross ? " The " + place + " went " + (more ? "past 9" : "below 0") + ", so the next column changed too!" : "") };
    } },
    bonds10: { name: "Number bonds × 10", gen: function () {
      var a = rand(1, 7), b = rand(1, 9 - a), c = a + b, v = rand(0, 3);
      var fact = "You know <b>" + a + " + " + b + " = " + c + "</b>. ";
      if (v === 0) return { q: fact + "So what is <b>" + a * 10 + " + " + b * 10 + "</b>?", answer: c * 10, explain: "Everything is 10 times bigger: " + a * 10 + " + " + b * 10 + " = " + c * 10 + "." };
      if (v === 1) return { q: fact + "So what is <b>" + c * 10 + " − " + a * 10 + "</b>?", answer: b * 10, explain: "If " + a * 10 + " + " + b * 10 + " = " + c * 10 + ", then " + c * 10 + " − " + a * 10 + " = " + b * 10 + "." };
      if (v === 2) return { q: fact + "So what is <b>" + a * 100 + " + " + b * 100 + "</b>?", answer: c * 100, explain: "100 times bigger: " + a * 100 + " + " + b * 100 + " = " + c * 100 + "." };
      var right = Math.random() < 0.4;
      var says = right ? a * 10 + " + " + b * 10 + " = " + c * 10 : a * 10 + " + " + b + " = " + c * 10;
      return { q: fact + "🐢 Tiny says <b>" + says + "</b>. Is Tiny correct?", opts: ["Yes, Tiny is right", "No, Tiny is wrong"], answer: right ? 0 : 1,
        explain: right ? "Yes! 10 times " + a + " is " + a * 10 + ", and 10 times " + b + " is " + b * 10 + "."
          : "No! " + a * 10 + " + " + b + " = " + (a * 10 + b) + ". Tiny should say " + a * 10 + " + " + b * 10 + " = " + c * 10 + "." };
    } },
    colsub: { name: "Column subtraction", gen: function () {
      var a, b;
      do { a = rand(300, 899); b = rand(101, a - 100); } while (!((a % 10 < b % 10) || (Math.floor(a / 10) % 10 < Math.floor(b / 10) % 10)));
      return { q: "Use the column method: <b>" + a + " − " + b + "</b> = ?", answer: a - b, explain: "Start with the ones, and exchange when the top number is smaller:", worked: colWorked(a, b), paper: true };
    } }
  };
  function colWorked(a, b) {
    var d = function (n) { return [n % 10, Math.floor(n / 10) % 10, Math.floor(n / 100) % 10]; };
    var top = d(a), bot = d(b), cur = top.slice(), ch = [0, 0, 0];
    for (var p = 0; p < 2; p++) {
      if (cur[p] < bot[p]) {
        if (cur[p + 1] === 0) { cur[p + 2]--; cur[p + 1] += 10; ch[p + 2] = ch[p + 1] = 1; }
        cur[p + 1]--; cur[p] += 10; ch[p + 1] = ch[p] = 1;
      }
    }
    var ans = d(a - b), cols = [2, 1, 0];
    return '<div class="colgrid small">' +
      cols.map(function (c) { return '<div class="ch c' + c + '">' + "OTH"[c] + "</div>"; }).join("") +
      cols.map(function (c) { return '<div class="cex">' + (ch[c] ? cur[c] : "") + "</div>"; }).join("") +
      cols.map(function (c) { return '<div class="ctop ' + (ch[c] ? "crossed" : "") + '">' + top[c] + "</div>"; }).join("") +
      cols.map(function (c, j) { return '<div class="cbot">' + (j === 0 ? '<span class="minus">−</span>' : "") + bot[c] + "</div>"; }).join("") +
      '<div class="cline"></div>' + cols.map(function (c) { return '<div class="cans filled">' + ans[c] + "</div>"; }).join("") + "</div>";
  }
  function reviewSkillsFor(hw) {
    var seen = {}, out = [];
    (window.HOMEWORK || []).filter(function (h) { return h.due < hw.due; }).sort(function (x, y) { return x.due < y.due ? 1 : -1; }).forEach(function (h) {
      (h.skills || []).forEach(function (k) { if (SKILLS[k] && !seen[k]) { seen[k] = 1; out.push({ key: k, from: h.due }); } });
    });
    return out;
  }
  function hwMissions(hw) { return (hw.missions || []).slice(); }
  // Extra practice that is not part of the paper homework.
  function hwBonus(hw) {
    return reviewSkillsFor(hw).length ? { id: "review", type: "review", emoji: "🔁", colour: "teal", title: "Remember these!", sub: "Bonus maths from earlier weeks", bonus: true } : null;
  }

  VIEWS.hw_review = function (ctx) {
    var skills = reviewSkillsFor(ctx.hw), ms = mState(ctx.hw.id, ctx.m.id);
    $app.innerHTML = mTop(ctx) +
      '<div class="card center"><div style="font-size:56px">🔁</div><h2>Remember these?</h2><p>Quick questions on maths from your earlier homework, with new numbers.</p>' +
      '<div class="steps" style="text-align:left">' + skills.map(function (s) { return '<div>🧠 <span style="font-weight:800">' + esc(SKILLS[s.key].name) + '</span><br><span class="muted">from homework due ' + niceDate(s.from) + "</span></div>"; }).join("") + "</div>" +
      (ms.done ? "<p><b>Last time: " + ms.score + " / " + ms.total + "</b></p>" : "") +
      '<button class="btn block" id="go">' + (ms.done ? "Have another go" : "Let's go!") + "</button></div>";
    backToHub(ctx);
    on("#go", "click", function () {
      var qs = [];
      for (var i = 0; i < 8; i++) { var s = skills[i % skills.length]; var q = SKILLS[s.key].gen(); q.skill = s.key; q.from = s.from; qs.push(q); }
      go("reviewQ", { ctx: ctx, qs: shuffle(qs), i: 0, score: 0 });
    });
  };
  VIEWS.reviewQ = function (o) {
    var ctx = o.ctx, q = o.qs[o.i];
    $app.innerHTML = mTop(ctx, "Question " + (o.i + 1) + " of " + o.qs.length) +
      '<div class="progressbar"><div style="width:' + (o.i / o.qs.length * 100) + '%"></div></div>' +
      '<div class="card"><span class="chip">🔁 ' + esc(SKILLS[q.skill].name) + '</span><h2 style="margin:14px 0">' + q.q + "</h2>" +
      (q.opts ? q.opts.map(function (t, i) { return '<button class="choice" data-i="' + i + '">' + esc(t) + "</button>"; }).join("")
        : (q.paper ? '<p class="muted">Work it out on paper first ✏️</p>' : "") + '<input id="ans" class="spellinput" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="?"><div style="height:12px"></div><button class="btn block" id="ok">Check ✓</button>') +
      '<div id="fb"></div></div>';
    wireBack(function () { go("hw_review", ctx); });
    function done(ok) {
      if (ok) o.score++;
      if (q.fact) { noteMiss(q.fact[0], q.fact[1], !ok); save(); }
      $("#fb").innerHTML = '<div class="feedback ' + (ok ? "good" : "bad") + '">' + (ok ? pick(["Yes! ⭐", "You remembered! 🧠", "Brilliant! 🌟"]) + "<br>" : "Not quite. The answer is <b>" + (q.opts ? esc(q.opts[q.answer]) : q.answer) + "</b>.<br>") +
        '<small style="font-weight:500">' + q.explain + "</small>" + (!ok && q.worked ? q.worked : "") + "</div>" +
        '<button class="btn block" id="next">' + (o.i + 1 < o.qs.length ? "Next →" : "See my score") + "</button>";
      var c = $("#ok"); if (c) c.remove();
      on("#next", "click", function () {
        if (o.i + 1 < o.qs.length) return go("reviewQ", { ctx: ctx, qs: o.qs, i: o.i + 1, score: o.score });
        finishMission(ctx, { score: o.score, total: o.qs.length }, o.score);
        missionDone(ctx, '<div class="score">' + o.score + " / " + o.qs.length + "</div><p>" +
          (o.score >= 7 ? "Your brain remembered loads! 🧠" : "Good try! These will come back next week too.") + "</p>");
      });
    }
    if (q.opts) {
      $$(".choice").forEach(function (b) {
        b.addEventListener("click", function () {
          var i = +b.getAttribute("data-i");
          $$(".choice").forEach(function (c, j) { c.disabled = true; if (j === q.answer) c.classList.add("right"); else if (j === i) c.classList.add("wrong"); });
          done(i === q.answer);
        });
      });
    } else {
      focusSoon("#ans");
      var check = function () { var v = $("#ans").value.trim(); if (v === "") return; $("#ans").disabled = true; done(parseInt(v, 10) === q.answer); };
      on("#ok", "click", check);
      on("#ans", "keydown", function (e) { if (e.key === "Enter") check(); });
    }
  };

  function colAddWorked(a, b) {
    var top = digits3(a), bot = digits3(b), ans = digits3(a + b), carry = [0, 0, 0];
    for (var p = 0; p < 2; p++) if (top[p] + bot[p] + carry[p] >= 10) carry[p + 1] = 1;
    var cols = [2, 1, 0], shown = function (c) { return (c === 2 && b < 100) || (c === 1 && b < 10) ? "" : bot[c]; };
    return '<div class="colgrid small">' +
      cols.map(function (c) { return '<div class="ch c' + c + '">' + "OTH"[c] + "</div>"; }).join("") +
      cols.map(function (c) { return '<div class="ctop">' + top[c] + "</div>"; }).join("") +
      cols.map(function (c, j) { return '<div class="cbot">' + (j === 0 ? '<span class="minus">+</span>' : "") + shown(c) + "</div>"; }).join("") +
      '<div class="cline"></div>' + cols.map(function (c) { return '<div class="cans filled">' + ans[c] + "</div>"; }).join("") +
      cols.map(function (c) { return '<div class="ccarry">' + (carry[c] || "") + "</div>"; }).join("") + "</div>";
  }
  SKILLS.coladd = { name: "Column addition", gen: function () {
    var a, b;
    do { a = rand(120, 880); b = rand(12, 98); } while (!((a % 10 + b % 10 >= 10) || (Math.floor(a / 10) % 10 + Math.floor(b / 10) % 10 >= 10)) || a + b > 999);
    return { q: "Use the column method: <b>" + a + " + " + b + "</b> = ?", answer: a + b, explain: "Start with the ones. If a column makes 10 or more, carry the 1:", worked: colAddWorked(a, b), paper: true };
  } };

  SKILLS.times = { name: "Times tables", gen: function () {
    var tricky = trickyFacts(20), a, b;
    if (tricky.length && Math.random() < 0.5) { var f = pick(tricky).split("×"); a = +f[0]; b = +f[1]; if (Math.random() < 0.5) { var t = a; a = b; b = t; } }
    else { a = rand(2, 12); b = rand(2, 12); }
    return { q: "<b>" + a + " × " + b + "</b> = ?", answer: a * b, explain: tipFor(a, b), fact: [a, b] };
  } };

  // ----- parent view of homework -----
  function parentHomework(p) {
    var hws = (window.HOMEWORK || []).filter(function (hw) { return !hw.done && daysUntil(hw.due) >= -21; });
    return hws.map(function (hw) {
      var st = (p.hw || {})[hw.id] || {};
      var rows = hwMissions(hw).map(function (m) {
        var ms = st[m.id] || {}, detail = "";
        if (m.type === "spelling" && ms.total) detail = "Test " + ms.score + "/" + ms.total + (ms.wrong && ms.wrong.length ? " · missed " + ms.wrong.join(", ") : "");
        if (m.type === "colsub") detail = Object.keys(ms.solved || {}).length + "/" + m.sums.length + " sums";
        if (m.type === "predict" && ms.sentences) detail = ms.sentences.map(function (t) { return "“" + esc(t) + "”"; }).join("<br>");
        if (m.type === "compass") detail = (ms.quiz != null ? "Quiz " + ms.quiz + "/8. " : "") + (ms.answers ? HUNT.map(function (c) { return c + ": " + (ms.answers[c] || "—"); }).join(", ") : "");
        if (m.type === "coladd") detail = Object.keys(ms.solved || {}).length + "/" + m.sums.length + " sums";
        if (m.type === "describe" && ms.paragraph) detail = "“" + esc(ms.paragraph) + "”";
        if (m.type === "rocks") detail = (ms.sorted != null ? "Rock or not " + ms.sorted + "/10. " : "") + (ms.quiz != null ? "Families quiz " + ms.quiz + "/6. " : "") +
          (ms.list || []).map(function (r) { return esc(r.thing) + " – " + esc(r.rock); }).join(", ");
        if (m.type === "rights") detail = (ms.people || []).map(function (x) { return esc(x.who) + ": the right " + esc(RIGHTS[x.right][1]) + (x.why ? " (" + esc(x.why) + ")" : ""); }).join("<br>");
        if (m.type === "spelling" && ms.pairs != null) detail += (detail ? " · " : "") + "Which-one game " + ms.pairs + "/10";
        if (m.type === "times") detail = (ms.best != null ? "Practice best " + ms.best + "/20" : "") +
          ((p.tt && Object.keys(p.tt).length) ? "<br>Tricky: " + Object.keys(p.tt).sort(function (x, y) { return p.tt[y] - p.tt[x]; }).slice(0, 8).join(", ") : "");
        if (m.type === "handwriting") detail = ms.game != null ? "Letter game " + ms.game + "/8" : "";
        if (m.type === "stoneage" && ms.labelGame != null) detail = "Label game " + ms.labelGame + "/5";
        if (m.type === "commissioner") detail = (ms.plans || []).map(function (x) { return "I would " + esc(x.what) + " because " + esc(x.why) + "."; }).join("<br>") + (Object.keys(ms.talk || {}).length ? "<br>Family talk: " + Object.keys(ms.talk).length + "/3" : "");
        if (m.type === "review" && ms.total) detail = "Maths review " + ms.score + "/" + ms.total;
        if (m.type === "discuss") detail = Object.keys(ms.talked || {}).length + "/" + m.questions.length + " talked about" +
          Object.keys(ms.notes || {}).filter(function (k) { return ms.notes[k]; }).map(function (k) { return "<br>" + (+k + 1) + ". " + esc(ms.notes[k]); }).join("");
        return "<tr><td>" + m.emoji + '</td><td><b>' + esc(m.title) + "</b><br>" + (ms.done ? "📱 practised ✓" : "📱 not practised") + " · " + (onPaper(hw, ms) ? "✏️ on paper ✓" : "✏️ not on paper yet") +
          (detail ? '<br><span class="muted">' + detail + "</span>" : "") + "</td></tr>";
      }).join("");
      return '<div class="card"><h3>📝 Homework: ' + esc(hw.title) + '</h3><p class="muted">' + dueText(hw.due) + " · " + hwDoneCount(hw, st) + "/" + hwMissions(hw).length + " jobs done on paper" +
        (st.pet && st.pet.hatched ? " · 🐣 hatched " + esc(st.pet.name) : "") + "</p><table>" + rows + "</table></div>";
    }).join("");
  }


  boot();
})();
