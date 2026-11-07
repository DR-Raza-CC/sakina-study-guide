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
      hw.missions.forEach(function (m) {
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
    return (window.HOMEWORK || []).filter(function (hw) { return t <= addDays(hw.due, 3); });
  }
  function wordInfo(key) {
    var sm = schoolMap();
    var o = ORDER_MAP[key];
    if (sm[key]) {
      return { word: sm[key].word, sentence: sm[key].sentence || (o && o.sentence) || "", unit: sm[key].unit || "school" };
    }
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
    if (info.unit === "school") { e.s = 1; if (info.sentence) e.sen = info.sentence; }
    if (correct) { e.b = Math.min(e.b + 1, 7); e.r++; }
    else { e.b = 0; e.x++; }
    e.last = t;
    e.due = addDays(t, INTERVALS[e.b]);
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
      (tricky ? '<button class="tile" id="tricky"><div class="emoji bg-coral">🎯</div><div><div class="t">Tricky words</div><div class="s">' + tricky + " words to practise</div></div></button>" : "") +
      '<button class="tile" id="book"><div class="emoji bg-sun">📖</div><div><div class="t">My book quiz</div><div class="s">Take a photo, answer 10 questions</div></div></button>' +
      '<button class="tile" id="nums"><div class="emoji bg-sky">🔢</div><div><div class="t">Number families</div><div class="s">➕ Level ' + (add.level + 1) + " · ✖️ Level " + (mult.level + 1) + "</div></div></button>" +
      '<p class="muted center">' + mastered + " words mastered so far 🏆</p>";
    on("#out", "click", function () { if (confirm("Sign out?")) signOut(); });
    on("#spell", "click", function () { go(done ? "spellDone" : "spellStart"); });
    on("#tricky", "click", function () { go("trickyStart"); });
    on("#book", "click", function () { go("book"); });
    on("#nums", "click", function () { go("numbers"); });
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
        (item.sentence ? '<p class="sentence">' + esc(item.sentence) + "</p>" : "") +
        (stage === "look"
          ? '<button class="btn block" id="cover">Cover it 🙈</button>'
          : '<input class="spellinput" id="inp" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="type it here"><div id="fb"></div><div style="height:12px"></div><button class="btn block" id="check">Check ✓</button>') +
        "</div>";
      wireBack(function () { if (SP.hw) go("hwHub", SP.hw.hwId); else go("home"); });
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
    wireBack(function () { if (confirm("Stop the test? Your answers so far are saved.")) { save(true); if (SP.hw) go("hwHub", SP.hw.hwId); else go("home"); } });
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
    var st2 = streak();
    var pct = total ? score / total : 0;
    var badge = [30, 14, 7, 3].find(function (n) { return st2 === n; });
    $app.innerHTML = topbar("Finished!", false) +
      '<div class="card center"><div class="celebrate">' + (pct === 1 ? "🏆" : pct >= 0.7 ? "🌟" : "💪") + "</div>" +
      '<div class="score">' + score + " / " + total + "</div>" +
      "<p>" + (pct === 1 ? "Perfect! Every word right first time!" : pct >= 0.7 ? "Great spelling!" : "Good try! Practice makes progress.") + "</p>" +
      (SP.mode === "daily" ? '<p><b>🔥 ' + st2 + " day streak!</b>" + (newBest ? " That's your best ever!" : "") + "</p>" : "") +
      (badge && SP.mode === "daily" ? '<div class="tipbox">🏅 You earned the <b>' + badge + "-day streak</b> badge!</div>" : "") +
      (SP.wrongWords.length ? '<p style="margin-top:14px">These words will come back tomorrow:</p><div class="chips" style="justify-content:center">' +
        SP.wrongWords.map(function (k) { return '<span class="chip bad">' + esc(wordInfo(k).word) + "</span>"; }).join("") + "</div>" : "") +
      '<div style="height:16px"></div><button class="btn block" id="home">Back home</button></div>';
    on("#home", "click", function () { go("home"); });
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
    var need = FT.score >= 9 && !unlocked && FT.level === m.unlocked && m.unlocked < LEVELS[kind].length - 1 ? 2 - (m.passes[FT.level] || 0) : 0;
    $app.innerHTML = topbar("Finished!", false) +
      '<div class="card center"><div class="celebrate">' + (unlocked ? "🔓" : FT.score >= 9 ? "🌟" : FT.score >= 6 ? "👍" : "💪") + '</div><div class="score">' + FT.score + " / 10</div>" +
      (unlocked ? "<p><b>New level unlocked: " + esc(LEVELS[kind][m.level].name) + "!</b></p>" : "") +
      (need > 0 ? "<p>One more score of 9 or 10 to unlock the next level!</p>" : "") +
      (FT.score < 6 ? "<p>Try the 💡 Learn page, then have another go.</p>" : "") +
      '<div class="row"><button class="btn ghost" id="again" style="flex:1">Again</button><button class="btn" id="back2" style="flex:1">Done</button></div></div>';
    on("#again", "click", function () { go("famTest", kind); });
    on("#back2", "click", function () { go("numbers"); });
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
    hw.missions.forEach(function (m) {
      if (m.type === "spelling") window.UNIT_INFO[hw.id + ":" + m.id] = { title: m.title, tip: m.tip };
    });
  });
  var COLOURS = { teal: ["#d9f2ee", "#2a9d8f"], sky: ["#ddeefa", "#3b8fc4"], coral: ["#ffe1d8", "#ff7a59"], plum: ["#ebe3f6", "#7b5ea7"], sun: ["#fff1c7", "#d9a61f"] };
  function hwById(id) { return (window.HOMEWORK || []).find(function (h) { return h.id === id; }); }
  function hwState(hwId) { S.prog.hw = S.prog.hw || {}; return S.prog.hw[hwId] || (S.prog.hw[hwId] = {}); }
  function mState(hwId, mId) { var h = hwState(hwId); return h[mId] || (h[mId] = {}); }
  function hwDoneCount(hw, st) { return hw.missions.filter(function (m) { return st && st[m.id] && st[m.id].done; }).length; }
  function daysUntil(d) { return Math.round((new Date(d + "T12:00") - new Date(today() + "T12:00")) / 86400000); }
  function dueText(due) {
    var n = daysUntil(due);
    return n > 1 ? "Hand in " + niceDate(due) + " · " + n + " days to go" : n === 1 ? "Hand in tomorrow!" : n === 0 ? "Hand in today!" : "Handed in " + niceDate(due);
  }
  function homeworkTiles() {
    return activeHomework().map(function (hw) {
      var st = (S.prog.hw || {})[hw.id], d = hwDoneCount(hw, st), n = hw.missions.length;
      return '<button class="tile hwtile" data-hw="' + esc(hw.id) + '"><div class="emoji bg-plum">📝</div><div style="flex:1"><div class="t">Homework: ' + esc(hw.title) + '</div><div class="s">' + dueText(hw.due) + "</div>" +
        '<div class="hwdots">' + hw.missions.map(function (m) { return '<span class="' + (st && st[m.id] && st[m.id].done ? "on" : "") + '">' + m.emoji + "</span>"; }).join("") + "</div></div>" +
        (d === n ? '<span class="badge">⭐ Done</span>' : '<span class="badge" style="background:#ebe3f6;color:#5d4583">' + d + "/" + n + "</span>") + "</button>";
    }).join("");
  }

  VIEWS.hwHub = function (hwId) {
    var hw = hwById(hwId); if (!hw) return go("home");
    var st = hwState(hwId), d = hwDoneCount(hw, st), n = hw.missions.length;
    $app.innerHTML = topbar("My homework", true) +
      '<div class="hwhead"><div class="t">📝 ' + esc(hw.title) + "</div><div>" + dueText(hw.due) + "</div>" +
      '<div class="progressbar light"><div style="width:' + Math.round(d / n * 100) + '%"></div></div><div class="small">' + d + " of " + n + " missions done" + (d === n ? " 🎉" : "") + "</div></div>" +
      (d === n ? '<div class="card center" style="margin-bottom:14px"><div class="celebrate">🏆</div><h2>Homework hero!</h2><p>You practised everything. Check it is all written in your book, then pack it in your bag!</p></div>' : "") +
      hw.missions.map(function (m, i) {
        var c = COLOURS[m.colour] || COLOURS.teal, ms = st[m.id] || {};
        return '<button class="mission ' + (ms.done ? "done" : "") + '" data-m="' + esc(m.id) + '" style="--mc:' + c[1] + ";--mb:" + c[0] + '">' +
          '<div class="memoji">' + m.emoji + '</div><div style="flex:1"><div class="t">' + esc(m.title) + '</div><div class="s">' + esc(m.sub) + "</div></div>" +
          '<div class="mgo">' + (ms.done ? "⭐" : i + 1) + "</div></button>";
      }).join("");
    wireBack(function () { go("home"); });
    $$("[data-m]").forEach(function (b) {
      b.addEventListener("click", function () {
        var m = hw.missions.find(function (x) { return x.id === b.getAttribute("data-m"); });
        go("hw_" + m.type, { hw: hw, m: m });
      });
    });
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
    $app.innerHTML = topbar("Mission complete!", false) +
      '<div class="card center"><div class="celebrate">' + ctx.m.emoji + "</div>" + html +
      (ctx.m.paper ? '<div class="paper">✍️ ' + esc(ctx.m.paper) + "</div>" : "") +
      '<div style="height:14px"></div><button class="btn block" id="hub">Back to my homework</button></div>';
    on("#hub", "click", function () { go("hwHub", ctx.hw.id); });
  }
  function mTop(ctx, extra) { return topbar(ctx.m.emoji + " " + (extra || ctx.m.title), true); }
  function backToHub(ctx) { wireBack(function () { go("hwHub", ctx.hw.id); }); }
  function focusSoon(sel) { setTimeout(function () { var i = $(sel); if (i) i.focus(); }, 60); }

  // ----- spelling mission -----
  VIEWS.hw_spelling = function (ctx) {
    var ms = mState(ctx.hw.id, ctx.m.id);
    $app.innerHTML = mTop(ctx) +
      '<div class="tipbox" style="margin-bottom:14px"><b>Spelling rule</b><br>' + esc(ctx.m.tip) + "</div>" +
      '<div class="card"><div class="chips" style="justify-content:center">' + ctx.m.words.map(function (w) {
        return '<button class="chip big say" data-w="' + esc(w[0]) + '">' + esc(w[0]).replace(/ear/, "<u>ear</u>") + "</button>";
      }).join("") + '</div><p class="muted center" style="margin-top:8px">Tap a word to hear it</p>' +
      '<div class="steps"><div><b>1</b> Look, write, check each word</div><div><b>2</b> Grown-up test with all 10</div></div>' +
      (ms.done ? '<p class="center"><b>Best test score: ' + (ms.best || ms.score) + " / " + ms.total + "</b></p>" : "") +
      '<button class="btn block" id="learn">Look, write, check 👀</button><div style="height:10px"></div>' +
      '<button class="btn block sun" id="test">Straight to the test 🎧</button></div>';
    backToHub(ctx);
    $$(".say").forEach(function (b) { b.addEventListener("click", function () { speak(b.getAttribute("data-w")); }); });
    var keys = ctx.m.words.map(function (w) { return wordKey(w[0]); });
    var info = { hwId: ctx.hw.id, ctx: ctx };
    on("#learn", "click", function () { startSession({ mode: "hw", news: keys, items: shuffle(keys), hw: info }); });
    on("#test", "click", function () { startSession({ mode: "hw", news: [], items: shuffle(keys), hw: info }); });
  };
  VIEWS.hwSpellDone = function () {
    var ctx = SP.hw.ctx, score = SP.score, total = SP.total;
    var ms = mState(ctx.hw.id, ctx.m.id);
    finishMission(ctx, { score: score, total: total, best: Math.max(ms.best || 0, score), wrong: SP.wrongWords.map(function (k) { return wordInfo(k).word; }) }, score);
    missionDone(ctx, '<div class="score">' + score + " / " + total + "</div><p>" +
      (score === total ? "Perfect! You know all your 'ear' words!" : score >= 7 ? "Great spelling!" : "Good try! Practise a bit more and try again.") + "</p>" +
      (SP.wrongWords.length ? '<div class="chips" style="justify-content:center">' + SP.wrongWords.map(function (k) { return '<span class="chip bad">' + esc(wordInfo(k).word) + "</span>"; }).join("") +
        '</div><p class="muted">These will come back in your daily spellings.</p>' : ""));
  };

  // ----- column subtraction mission -----
  var PLACE = ["ones", "tens", "hundreds"], PLACE1 = ["one", "ten", "hundred"];
  VIEWS.hw_colsub = function (ctx) {
    var ms = mState(ctx.hw.id, ctx.m.id); ms.solved = ms.solved || {};
    var n = ctx.m.sums.length, solved = Object.keys(ms.solved).length;
    $app.innerHTML = mTop(ctx) +
      '<div class="card"><h3>💡 What is exchanging?</h3><div class="exch"><div class="rod">10</div><div class="arrow">→</div><div class="ones">' + new Array(11).join("<i></i>") + "</div></div>" +
      "<p>If the top number in a column is too small, take <b>1</b> from the column next door. <b>1 ten becomes 10 ones</b>, just like swapping a £10 note for ten £1 coins!</p>" +
      '<p class="muted" style="margin:0">Always start with the <b>ones</b> on the right.</p></div>' +
      '<div class="card"><h3>Pick a sum · ' + solved + " of " + n + ' done</h3><div class="sumgrid">' +
      ctx.m.sums.map(function (s, i) {
        var d = ms.solved[i];
        return '<button class="sumbtn ' + (d ? "done" : "") + '" data-i="' + i + '"><small>' + (i + 1) + "</small>" + s[0] + " − " + s[1] + (d ? "<span>" + (d.stars ? "⭐" : "✓") + "</span>" : "") + "</button>";
      }).join("") + "</div></div>";
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
        missionDone(ctx, "<h2>All " + ctx.m.sums.length + " sums done!</h2><p>" + stars + " of them right first time ⭐</p>");
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

  // ----- parent view of homework -----
  function parentHomework(p) {
    var hws = (window.HOMEWORK || []).filter(function (hw) { return daysUntil(hw.due) >= -21; });
    return hws.map(function (hw) {
      var st = (p.hw || {})[hw.id] || {};
      var rows = hw.missions.map(function (m) {
        var ms = st[m.id] || {}, detail = "";
        if (m.type === "spelling" && ms.total) detail = "Test " + ms.score + "/" + ms.total + (ms.wrong && ms.wrong.length ? " · missed " + ms.wrong.join(", ") : "");
        if (m.type === "colsub") detail = Object.keys(ms.solved || {}).length + "/" + m.sums.length + " sums";
        if (m.type === "predict" && ms.sentences) detail = ms.sentences.map(function (t) { return "“" + esc(t) + "”"; }).join("<br>");
        if (m.type === "compass") detail = (ms.quiz != null ? "Quiz " + ms.quiz + "/8. " : "") + (ms.answers ? HUNT.map(function (c) { return c + ": " + (ms.answers[c] || "—"); }).join(", ") : "");
        if (m.type === "discuss") detail = Object.keys(ms.talked || {}).length + "/" + m.questions.length + " talked about" +
          Object.keys(ms.notes || {}).filter(function (k) { return ms.notes[k]; }).map(function (k) { return "<br>" + (+k + 1) + ". " + esc(ms.notes[k]); }).join("");
        return "<tr><td>" + (ms.done ? "⭐" : "◻️") + " " + m.emoji + "</td><td><b>" + esc(m.title) + "</b>" + (detail ? '<br><span class="muted">' + detail + "</span>" : "") + "</td></tr>";
      }).join("");
      return '<div class="card"><h3>📝 Homework: ' + esc(hw.title) + '</h3><p class="muted">' + dueText(hw.due) + " · " + hwDoneCount(hw, st) + "/" + hw.missions.length + " missions done</p><table>" + rows + "</table></div>";
    }).join("");
  }


  boot();
})();
