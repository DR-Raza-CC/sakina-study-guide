# Sakina Study Guide

Year 3 practice app for Heathland School: daily spelling tests with streaks, a book-photo quiz, and number families.
Hosted free on Cloudflare Pages. Progress is stored in Cloudflare KV.

## What it does
- **Daily spellings** — new words are taught first (look, say, cover, write, check), then a listening test.
  Words come back after 1, 2, 4, 7, 14 and 30 days, and any mistake sends a word back to the start, so every word is practised many times before it counts as mastered.
  Wrong words are copied straight away and asked again later in the same test.
- **School spellings** — type the words from Heathland's weekly homework sheet in the parent dashboard. They are taught first and tested every day until known.
- **Book quiz** — photograph the cover and a few pages; the app makes 10 Year 3-style questions (find it, word meaning, think about it, predict, sum it up).
- **Number families** — explained with a family triangle, a bar model and dot arrays, then tested.
  ➕➖ levels: bonds to 10, bonds to 20, adding tens, tens and ones, two-digit numbers.
  ✖️➗ levels: 2/5/10, 3, 4, 8 times tables, then all Year 3 tables. Two scores of 9+ unlock the next level.
- **Parent dashboard** — streak, 14-day calendar, mastered words, missed words, book quiz and maths scores, settings.

Word bank: the "Year 3 Spelling tests – Word Lists" sheet, week by week from Autumn 1 to Summer 2
(about 280 words, each with its own sentence). A parent can choose which week to start from.
Edit `data.js` to change them.

## Files
- index.html, styles.css, app.js — the app
- data.js — spelling words, rules and sentences
- functions/api/[[path]].js — the server: sign-in, saving progress, book quiz
- manifest.webmanifest, icon-192.png, icon-512.png, apple-touch-icon.png — install as a phone app
- _headers — makes sure updates show straight away

## Setup
1. Create a GitHub repository called `sakina-study-guide` and upload all these files, keeping the `functions/api` folder.
2. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → pick the repository.
   Framework preset: None. Build command: leave empty. Build output directory: `/`
3. Cloudflare → Storage & Databases → KV → Create namespace called `sakina-study`.
4. Pages project → Settings → Bindings → Add → KV namespace. Variable name: `STUDY`. Namespace: `sakina-study`. Save.
5. Turn on the book quiz (pick one):
   - **Free:** Settings → Bindings → Add → Workers AI. Variable name: `AI`. Save. (Reads one photo per quiz — use a page photo.)
   - **Smarter:** Settings → Variables and Secrets → Add → Type: Secret. Name: `ANTHROPIC_API_KEY`, value: a key from console.anthropic.com. Reads up to 4 photos. Small charge per quiz on your Anthropic account.
6. Deployments → latest deployment → ⋯ → Retry deployment.
7. Open the site straight away and complete "Set up your family".

## Updating content
Edit data.js, commit, and Cloudflare redeploys automatically.
