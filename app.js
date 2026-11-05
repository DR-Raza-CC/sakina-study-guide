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
  function schoolMap() {
    var m = {};
    (S.prog.school || []).forEach(function (s) { m[wordKey(s.word)] = s; });
    return m;
  }
  function wordInfo(key) {
    var sm = schoolMap();
    var o = ORDER_MAP[key];
    if (sm[key]) {
      return { word: sm[key].word, sentence: sm[key].sentence || (o && o.sentence) || "", unit: "school" };
    }
    if (o) return o;
    var e = S.prog.words[key];
    return { word: e ? e.w : key, sentence: e && e.sen || "", unit: "tricky" };
  }
  function newWordQueue() {
    var q = [];
    (S.prog.school || []).forEach(function (s) {
      var k = wordKey(s.word);
      if (!S.prog.words[k]) q.push(k);
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
           pos: 0, score: 0, firstTry: {}, retries: {}, wrongWords: [], answered: 0, lastUnit: null, tricky: plan.tricky };
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
      wireBack(function () { go("home"); });
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
    $app.innerHTML = topbar((SP.mode === "daily" ? "Spelling test" : "Practice") + " · " + Math.min(done + 1, SP.total) + " of " + SP.total, true) +
      '<div class="progressbar"><div style="width:' + Math.round(done / SP.total * 100) + '%"></div></div>' +
      '<div class="card center">' + (isRetry ? '<p class="muted">Let\'s try this one again 💪</p>' : "") +
      '<button class="speak" id="say" aria-label="Hear the word">🔊</button>' +
      (item.sentence ? '<p class="sentence">' + blankSentence(item.sentence, item.word) + "</p>" : '<p class="sentence">Spell the word you hear.</p>') +
      '<input class="spellinput" id="inp" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="type the word">' +
      '<div id="fb"></div><div style="height:12px"></div><button class="btn block" id="check">Check ✓</button></div>';
    wireBack(function () { if (confirm("Stop the test? Your answers so far are saved.")) { save(true); go("home"); } });
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
        if (SP.mode === "daily") { record(key, ok); save(); }
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

  boot();
})();
