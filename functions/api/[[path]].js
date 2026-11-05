// Sakina Study Guide — server (Cloudflare Pages Function).
// Bindings:
//   STUDY  (KV namespace, required)  — family, sessions and progress
//   AI     (Workers AI, optional)    — free photo reading for the book quiz
//   ANTHROPIC_API_KEY (secret, optional) — better book quiz using Claude
//   CLAUDE_MODEL (variable, optional)    — defaults to claude-sonnet-5-5

const SESSION_TTL = 60 * 60 * 24 * 120; // 120 days
const MAX_CHILDREN = 8;
const BOOK_QUIZZES_PER_DAY = 10;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const err = (msg, status = 400) => json({ error: msg }, status);

async function sha(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const randId = (n = 16) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
};
const hashPin = (salt, pin) => sha(salt + ":" + String(pin));
const normCode = (c) => String(c || "").trim().toLowerCase();
const validPin = (p) => /^\d{4,8}$/.test(String(p || ""));
const cleanName = (n) => String(n || "").trim().slice(0, 30);

async function getFamily(env) {
  return (await env.STUDY.get("family", "json")) || null;
}
async function putFamily(env, fam) {
  await env.STUDY.put("family", JSON.stringify(fam));
}
async function getProgress(env, childId) {
  return (await env.STUDY.get("prog:" + childId, "json")) || {};
}
async function putProgress(env, childId, prog) {
  await env.STUDY.put("prog:" + childId, JSON.stringify(prog));
}

async function throttle(env, request) {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  const key = "fail:" + ip;
  const n = parseInt((await env.STUDY.get(key)) || "0", 10);
  return { blocked: n >= 15, key, n };
}
async function noteFail(env, t) {
  await env.STUDY.put(t.key, String(t.n + 1), { expirationTtl: 900 });
}

async function auth(env, request) {
  const h = request.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const s = await env.STUDY.get("sess:" + token, "json");
  return s ? { ...s, token } : null;
}

const publicChildren = (fam) => fam.children.map((c) => ({ id: c.id, name: c.name }));

// Child saves never overwrite what the parent controls.
function mergeChildSave(stored, incoming) {
  const out = { ...incoming };
  out.settings = stored.settings || incoming.settings || {};
  out.school = stored.school || [];
  out.schoolVersion = stored.schoolVersion || 0;
  return out;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (!env.STUDY) return err("The storage isn't connected yet. Add the STUDY KV binding and redeploy.", 503);

  const path = "/" + (Array.isArray(params.path) ? params.path.join("/") : params.path || "");
  const method = request.method;
  let body = {};
  if (method !== "GET" && method !== "DELETE") {
    try { body = await request.json(); } catch { body = {}; }
  }

  try {
    // ---------- public ----------
    if (path === "/state" && method === "GET") {
      const fam = await getFamily(env);
      return json({ setup: !!fam, bookQuiz: !!(env.ANTHROPIC_API_KEY || env.AI) });
    }

    if (path === "/setup" && method === "POST") {
      if (await getFamily(env)) return err("This app has already been set up.", 409);
      const code = normCode(body.familyCode);
      if (code.length < 6) return err("The family code needs at least 6 characters.");
      if (!validPin(body.parentPin)) return err("The parent PIN must be 4 to 8 numbers.");
      if (!validPin(body.childPin)) return err("The child PIN must be 4 to 8 numbers.");
      const name = cleanName(body.childName) || "Sakina";
      const salt = randId(8);
      const child = { id: randId(6), name, salt: randId(8) };
      child.pin = await hashPin(child.salt, body.childPin);
      const fam = {
        code: await sha("code:" + code),
        parentSalt: salt,
        parentPin: await hashPin(salt, body.parentPin),
        children: [child],
        created: Date.now(),
      };
      await putFamily(env, fam);
      return json({ ok: true });
    }

    if (path === "/children" && method === "POST") {
      const fam = await getFamily(env);
      if (!fam) return err("Not set up yet.", 404);
      const t = await throttle(env, request);
      if (t.blocked) return err("Too many tries. Please wait 15 minutes.", 429);
      if ((await sha("code:" + normCode(body.familyCode))) !== fam.code) {
        await noteFail(env, t);
        return err("That family code isn't right.", 401);
      }
      return json({ children: publicChildren(fam) });
    }

    if (path === "/login" && method === "POST") {
      const fam = await getFamily(env);
      if (!fam) return err("Not set up yet.", 404);
      const t = await throttle(env, request);
      if (t.blocked) return err("Too many tries. Please wait 15 minutes.", 429);
      if ((await sha("code:" + normCode(body.familyCode))) !== fam.code) {
        await noteFail(env, t);
        return err("That family code isn't right.", 401);
      }
      let sess;
      if (body.role === "parent") {
        if ((await hashPin(fam.parentSalt, body.pin)) !== fam.parentPin) {
          await noteFail(env, t);
          return err("That PIN isn't right.", 401);
        }
        sess = { role: "parent" };
      } else {
        const c = fam.children.find((x) => x.id === body.childId);
        if (!c) return err("Please choose your name.", 400);
        if ((await hashPin(c.salt, body.pin)) !== c.pin) {
          await noteFail(env, t);
          return err("Oops, that PIN isn't right. Try again!", 401);
        }
        sess = { role: "child", childId: c.id };
      }
      const token = randId(24);
      await env.STUDY.put("sess:" + token, JSON.stringify(sess), { expirationTtl: SESSION_TTL });
      return json({ token, ...sess });
    }

    // ---------- signed in ----------
    const s = await auth(env, request);
    if (!s) return err("Please sign in again.", 401);
    const fam = await getFamily(env);
    if (!fam) return err("Not set up yet.", 404);

    if (path === "/logout" && method === "POST") {
      await env.STUDY.delete("sess:" + s.token);
      return json({ ok: true });
    }

    if (path === "/me" && method === "GET") {
      if (s.role === "parent") return json({ role: "parent", children: publicChildren(fam) });
      const c = fam.children.find((x) => x.id === s.childId);
      if (!c) return err("Please sign in again.", 401);
      return json({ role: "child", child: { id: c.id, name: c.name }, progress: await getProgress(env, c.id) });
    }

    if (path === "/progress" && method === "PUT") {
      if (s.role !== "child") return err("Only the learner can save progress.", 403);
      const p = body.progress;
      if (!p || typeof p !== "object") return err("Nothing to save.");
      const text = JSON.stringify(p);
      if (text.length > 400000) return err("Progress is too big to save.", 413);
      const stored = await getProgress(env, s.childId);
      const merged = mergeChildSave(stored, p);
      merged.savedAt = Date.now();
      await putProgress(env, s.childId, merged);
      return json({ ok: true, settings: merged.settings, school: merged.school, schoolVersion: merged.schoolVersion });
    }

    if (path === "/book-quiz" && method === "POST") {
      const who = s.role === "child" ? s.childId : "parent";
      const day = new Date().toISOString().slice(0, 10);
      const capKey = `bq:${who}:${day}`;
      const used = parseInt((await env.STUDY.get(capKey)) || "0", 10);
      if (used >= BOOK_QUIZZES_PER_DAY) return err("That's lots of book quizzes today! Try again tomorrow.", 429);
      const images = (Array.isArray(body.images) ? body.images : []).slice(0, 4);
      if (!images.length) return err("Please take a photo of your book first.");
      const quiz = await makeBookQuiz(env, images, String(body.title || "").slice(0, 120));
      await env.STUDY.put(capKey, String(used + 1), { expirationTtl: 60 * 60 * 30 });
      return json(quiz);
    }

    // ---------- parent only ----------
    if (s.role !== "parent") return err("Parents only.", 403);

    if (path === "/dashboard" && method === "GET") {
      const children = [];
      for (const c of fam.children) {
        children.push({ id: c.id, name: c.name, progress: await getProgress(env, c.id) });
      }
      return json({ children });
    }

    if (path === "/parent/child" && method === "POST") {
      if (fam.children.length >= MAX_CHILDREN) return err("You can have up to 8 children.");
      const name = cleanName(body.name);
      if (!name) return err("Please type a name.");
      if (!validPin(body.pin)) return err("The PIN must be 4 to 8 numbers.");
      const c = { id: randId(6), name, salt: randId(8) };
      c.pin = await hashPin(c.salt, body.pin);
      fam.children.push(c);
      await putFamily(env, fam);
      return json({ ok: true, child: { id: c.id, name } });
    }

    const m = path.match(/^\/parent\/child\/([a-f0-9]+)$/);
    if (m) {
      const c = fam.children.find((x) => x.id === m[1]);
      if (!c) return err("Child not found.", 404);
      if (method === "DELETE") {
        fam.children = fam.children.filter((x) => x.id !== c.id);
        await putFamily(env, fam);
        await env.STUDY.delete("prog:" + c.id);
        return json({ ok: true });
      }
      if (method === "PUT") {
        if (body.name !== undefined) {
          const n = cleanName(body.name);
          if (!n) return err("Please type a name.");
          c.name = n;
        }
        if (body.pin !== undefined) {
          if (!validPin(body.pin)) return err("The PIN must be 4 to 8 numbers.");
          c.salt = randId(8);
          c.pin = await hashPin(c.salt, body.pin);
        }
        await putFamily(env, fam);
        if (body.resetProgress) {
          const old = await getProgress(env, c.id);
          await putProgress(env, c.id, { settings: old.settings || {}, school: old.school || [], schoolVersion: old.schoolVersion || 0 });
        }
        if (body.settings || body.school) {
          const p = await getProgress(env, c.id);
          if (body.settings) {
            const st = body.settings;
            p.settings = {
              newPerDay: Math.max(1, Math.min(6, parseInt(st.newPerDay, 10) || 3)),
              testLen: Math.max(5, Math.min(20, parseInt(st.testLen, 10) || 10)),
            };
          }
          if (Array.isArray(body.school)) {
            p.school = body.school
              .map((x) => ({ word: String(x.word || "").trim().slice(0, 40), sentence: String(x.sentence || "").trim().slice(0, 200) }))
              .filter((x) => x.word)
              .slice(0, 60);
            p.schoolVersion = (p.schoolVersion || 0) + 1;
          }
          await putProgress(env, c.id, p);
        }
        return json({ ok: true });
      }
    }

    if (path === "/parent/pin" && method === "PUT") {
      if (!validPin(body.pin)) return err("The PIN must be 4 to 8 numbers.");
      fam.parentSalt = randId(8);
      fam.parentPin = await hashPin(fam.parentSalt, body.pin);
      await putFamily(env, fam);
      return json({ ok: true });
    }

    return err("Not found.", 404);
  } catch (e) {
    return err(e && e.message ? e.message : "Something went wrong.", 500);
  }
}

// ---------------- Book quiz ----------------

const QUIZ_INSTRUCTIONS = `You make reading quizzes for a 7 to 8 year old child in Year 3 at a UK primary school.
You will see photos of a book the child is reading: maybe the cover, maybe some pages.

Do this:
1. Work out the book's title and author if you can.
2. If you only have the cover and you do not know this book's story well, do NOT guess. Set "needPages" to true and give no questions.
3. If you can see pages, base the questions mainly on what is on those pages. If you only have the cover of a book you know well, use your knowledge of the story.
4. Write exactly 10 multiple-choice questions, each with 3 short answer options and only one right answer.
5. Mix the kinds of question like a Year 3 teacher would: retrieval (finding facts), vocabulary (what a word means), inference (why a character did or felt something), prediction (what might happen next), and one summary question.
6. Use short, simple, friendly words. Keep everything kind and age-appropriate.
7. Give a one-sentence "explain" for each question that helps the child understand the answer.
8. Spread the right answers across the three positions.

Reply with JSON only, no other text, in exactly this shape:
{"title":"...","author":"...","needPages":false,"questions":[{"q":"...","options":["...","...","..."],"answer":0,"type":"retrieval","explain":"..."}]}`;

function parseDataUrl(d) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(String(d || ""));
  if (!m) return null;
  if (m[2].length > 2_800_000) return null; // ~2MB per photo
  return { media: m[1], data: m[2] };
}

function extractJson(text) {
  const t = String(text || "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The quiz maker got muddled. Please try again.");
  return JSON.parse(t.slice(start, end + 1));
}

function cleanQuiz(raw) {
  const q = {
    title: String(raw.title || "").slice(0, 120),
    author: String(raw.author || "").slice(0, 80),
    needPages: !!raw.needPages,
    questions: [],
  };
  for (const item of Array.isArray(raw.questions) ? raw.questions : []) {
    const opts = (Array.isArray(item.options) ? item.options : []).map((o) => String(o).slice(0, 140)).filter(Boolean);
    const ans = parseInt(item.answer, 10);
    if (!item.q || opts.length < 2 || opts.length > 4 || !(ans >= 0 && ans < opts.length)) continue;
    // reshuffle so the right answer isn't always in the same place
    const order = opts.map((_, i) => i).sort(() => Math.random() - 0.5);
    q.questions.push({
      q: String(item.q).slice(0, 300),
      options: order.map((i) => opts[i]),
      answer: order.indexOf(ans),
      type: String(item.type || "").slice(0, 20),
      explain: String(item.explain || "").slice(0, 300),
    });
    if (q.questions.length === 10) break;
  }
  if (!q.needPages && q.questions.length < 5) throw new Error("I couldn't make enough questions. Try clearer photos of a few pages.");
  return q;
}

async function makeBookQuiz(env, images, title) {
  const imgs = images.map(parseDataUrl).filter(Boolean);
  if (!imgs.length) throw new Error("I couldn't read that photo. Please try again.");
  const extra = title ? `The child says the book is called: "${title}".` : "";

  if (env.ANTHROPIC_API_KEY) {
    const content = imgs.map((i) => ({ type: "image", source: { type: "base64", media_type: i.media, data: i.data } }));
    content.push({ type: "text", text: `${extra}\nMake the quiz now. JSON only.` });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.CLAUDE_MODEL || "claude-sonnet-5-5",
        max_tokens: 3000,
        system: QUIZ_INSTRUCTIONS,
        messages: [{ role: "user", content }],
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("The quiz maker isn't working right now (" + (data.error?.message || r.status) + ").");
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return cleanQuiz(extractJson(text));
  }

  if (env.AI) {
    // Workers AI vision model reads one photo at a time — use the first one.
    const bytes = Uint8Array.from(atob(imgs[0].data), (c) => c.charCodeAt(0));
    const model = "@cf/meta/llama-3.2-11b-vision-instruct";
    const input = {
      messages: [
        { role: "system", content: QUIZ_INSTRUCTIONS },
        { role: "user", content: `${extra}\nMake the quiz now. JSON only.` },
      ],
      image: [...bytes],
      max_tokens: 2500,
    };
    let out;
    try {
      out = await env.AI.run(model, input);
    } catch (e) {
      if (/agree/i.test(String(e && e.message))) {
        await env.AI.run(model, { prompt: "agree" }); // one-time licence acceptance
        out = await env.AI.run(model, input);
      } else throw e;
    }
    return cleanQuiz(extractJson(out && out.response));
  }

  throw new Error("The book quiz isn't switched on yet. A parent needs to add it in Cloudflare (see the README).");
}
