# Velur Scent Diffusion Feedback Survey

A standalone public survey for collecting scent diffusion feedback from clients and POS contacts, plus a password-protected admin dashboard for viewing aggregated results.

No login required for respondents. Built with Node.js + Express + PostgreSQL, designed to deploy on Railway with the repo on GitHub.

---

## What's included

- **`/` — Public survey form.** Mobile-friendly, Velur-branded, 1–10 rating scales for Electric Diffuser, Small Reed Diffuser, and Big Reed Diffuser, plus a general feedback section with multiple-choice questions and free-text notes.
- **`/admin` — Admin dashboard.** Password-protected. Shows total responses, average ratings per question per product, breakdown of multiple-choice answers, a recent-responses table, and a CSV export button.
- **PostgreSQL schema** — auto-created on first run (`responses` table).

---

## 1. Push to GitHub

```bash
cd velur-survey
git init
git add .
git commit -m "Initial commit — Velur scent survey"
git branch -M main
git remote add origin https://github.com/<your-username>/velur-scent-survey.git
git push -u origin main
```

---

## 2. Deploy on Railway

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select `velur-scent-survey`.
2. Railway will detect Node.js automatically and run `npm install` + `npm start`.
3. **Add PostgreSQL:** In the same Railway project, click **+ New** → **Database** → **PostgreSQL**. Railway automatically injects `DATABASE_URL` into your app's environment — no manual config needed.
4. **Set environment variables** on the web service (Settings → Variables):

   | Variable | Value | Notes |
   |---|---|---|
   | `ADMIN_PASSWORD` | *(choose a strong password)* | Used to log into `/admin` |
   | `SESSION_SECRET` | *(any long random string)* | Secures admin session cookies |
   | `NODE_ENV` | `production` | Enables secure cookies + SSL on DB connection |

5. Once deployed, Railway gives you a public URL like `https://velur-scent-survey-production.up.railway.app`.
6. **Optional — custom domain:** Settings → Networking → Custom Domain, e.g. `survey.velurfragrance.com`.

---

## 3. Share the survey

Send respondents the root URL:

```
https://<your-railway-url>/
```

No account needed — they fill it in and submit.

---

## 4. View results

Go to:

```
https://<your-railway-url>/admin
```

Log in with the `ADMIN_PASSWORD` you set. From there you can:
- See response count and average ratings per product
- See breakdowns for "Best product", "Needs improvement", and "Main observation"
- Browse the latest 100 responses in a table
- Export all responses as CSV

---

## Local development

```bash
npm install
# create a local Postgres database, then:
export DATABASE_URL="postgres://user:pass@localhost:5432/velur_survey"
export ADMIN_PASSWORD="test123"
npm start
```

Visit `http://localhost:3000` for the form, `http://localhost:3000/admin` for the dashboard.

---

## Updating the survey questions later

All question text lives in `public/index.html` (look for the `<div class="q">` blocks). Each rating question needs a `data-field` attribute matching a column in the `responses` table in `server.js`. If you add new questions, add the matching column to the `CREATE TABLE` statement in `server.js` and to the `INSERT INTO responses` query.
