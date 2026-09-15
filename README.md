# JobMatch — AI job matching & auto-apply platform

Full rebuild: plain HTML/CSS/JavaScript frontend (no framework, no build step), Node/Express + MongoDB backend — same architecture and hosting plan as before (Railway for the backend, Vercel for the frontend, MongoDB Atlas, Cloudinary), rebuilt with every bug fix already baked in from the start.

## Structure

```
jobmatch/
  frontend/          Plain HTML/CSS/JS — no build step
    index.html        Homepage
    signup.html
    login.html
    onboarding.html
    dashboard.html
    admin/
      login.html
      queue.html
    css/
      style.css        Design tokens + shared components (navbar, buttons, forms)
      home.css         Homepage-specific (hero, pipeline animation, services, FAQ)
      app.css          Shared app-page styles (auth, onboarding, dashboard, admin)
    js/
      config.js        API_BASE_URL + Google Client ID — the only file to edit for deployment
      api.js            Shared fetch wrapper (auth header, JSON, error handling)
      nav.js            Mobile menu + auth-aware navbar
      onboarding.js
      dashboard.js
      admin-queue.js

  backend/            Node.js + Express + MongoDB (unchanged from the working version)
```

## Before you run anything: edit `frontend/js/config.js`

This is the one file that replaces what environment variables did in the old React build. It auto-detects local vs. production by hostname:

```js
const API_BASE_URL =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : 'https://YOUR-RAILWAY-BACKEND-URL.up.railway.app/api'; // <- replace after deploying the backend

const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'; // <- replace once you have one
```

Locally, this already points at `localhost:5000` — no edits needed to run it on your machine. You only touch this file once you deploy.

## Running locally

**Backend:**
```bash
cd backend
npm install
cp .env.example .env   # fill in your real keys
npm run dev
```

**Frontend:** no install, no build — it's plain HTML. Just open `frontend/index.html` directly in a browser, or serve it with any static server (e.g. VS Code's "Live Server" extension, or `npx serve frontend`) so relative paths and fetch calls behave correctly.

## Deploying

**Backend → Railway:** identical process to before — connect the `backend` folder to a Railway project, set every variable from `.env` in Railway's dashboard, including `FRONTEND_URL` set to your real Vercel domain once you have it.

**Frontend → Vercel:** connect the `frontend` folder as a new Vercel project. There is no build command and no output directory setting needed — Vercel serves static HTML directly. Before your final deploy, edit `frontend/js/config.js` with your real Railway backend URL and Google Client ID, then push.

**MongoDB Atlas, Google OAuth, Paystack webhook:** same manual dashboard steps as before — Network Access allow-list, Authorized JavaScript origins, and webhook URL pointing at your live backend.

## What's fixed from the previous build

- Every route now uses `asyncHandler` + a global Express error handler, so a failure anywhere (missing API key, bad file, expired token) returns a real, readable error message instead of a silent failure or a generic HTML error page
- Every button on the homepage actually navigates somewhere
- A dedicated login page exists (the previous build only had signup)
- CV upload, cover letter upload/extraction, and cover letter save all show real error messages on failure instead of failing silently
- Admin auth is fully separate from regular user auth, with its own token storage
- Google Sign-In verifies the ID token server-side rather than trusting anything the client sends

## What still needs your input to fully work

- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` in `backend/.env` — required for any CV/cover letter upload to work
- `AI_API_KEY` in `backend/.env` — required for CV parsing, cover letter extraction, and cover letter generation
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — required for Google Sign-In (the app works fine with email/password without this)
- `PAYSTACK_SECRET_KEY` — required for the payment flow
- Your first admin user still has to be created manually in MongoDB (no signup flow for admins by design)

## Job sources

- **Jobo** (`source: "jobo"`) — paid, usage-based, requires `JOBO_API_KEY`. Provides real `country` data and reliable closed-job detection via its expired-jobs endpoint.
- **Arbeitnow** (`source: "arbeitnow"`) — free, public, no API key needed at all. Mostly Germany/EU-focused listings. No structured country field (left `null`), but its `tags` field is used directly as `industry` when present. No "closed job" endpoint exists for this source, so closure is inferred from staleness (21 days of no update) rather than a real signal.

Both sources write into the same `Job` collection, deduped by `source + externalId`, and both run on the same 15-minute cron. Trigger either manually via `POST /api/admin/sync-jobs` (Jobo) or `POST /api/admin/sync-arbeitnow` (Arbeitnow) while testing.

## Team roles & internal operations (Phase 1-4 build)

Four roles now exist: `user` (regular customer), `staff`, `manager`, `admin`. All internal team roles log in at `/admin/login.html` (same page, role-aware afterward).

**Creating team members**: only via the Team page (`/admin/team.html`) once logged in as admin/manager — there's no public signup for these roles. Admin can create staff or managers; managers can only create staff.

**What each admin page does:**
- `dashboard.html` — revenue chart (Chart.js) + key metrics (users, applications purchased/submitted, total revenue)
- `queue.html` — the application queue, shared by staff/manager/admin. Links to each applicant's full profile.
- `users.html` — browse all customers; admin/manager can send a broadcast announcement (shows in the user's notification bell on their dashboard)
- `user-profile.html` — opens in a new tab from the queue or users list. Shows the user's CV, every purchased application with its cover letter and apply link, current job matches (for finding a replacement if a link is dead), a "Application completed" button (triggers an email to the user if Resend is configured), and a "Notify manager" escalation button.
- `team.html` (manager/admin only) — create/manage staff and managers, see who's online right now and how many applications each completed today, reset passwords, review and resolve escalations
- `job-sources.html` (manager/admin only) — toggle each job source on/off and set its API key from the browser, no redeploy needed. Also has a "Sync all now" button for immediate testing.
- `messages.html` — internal team chat (staff/manager/admin only), a shared "Team channel" plus 1:1 conversations, with file/photo attachments

## Honest limitations on this build

- **Chat is polling-based (refreshes every ~4 seconds), not true WebSocket real-time.** This was a deliberate trade-off — genuine real-time infrastructure is much harder to debug when something breaks, and polling is nearly indistinguishable in normal use.
- **"Online" status** is based on a heartbeat every 30 seconds while a team member has an admin page open — closing the tab means they'll show offline within ~2 minutes, not instantly.
- **"Add any job API" is not literally true.** The Job Sources page lets you toggle and re-key sources that already have connector code (Jobo, Arbeitnow, Jobicy, Himalayas, Adzuna, EURES). A genuinely different API still needs its specific connector written first — no system can safely guess an arbitrary API's data shape.
- **EURES has no official public API** — the connector talks to an internal endpoint reverse-engineered from the EU's own website. It's off by default; enable it on the Job Sources page once you've confirmed it's still returning real jobs. It could break without notice since it's unsupported by the EU.
- **Adzuna's free tier is very limited (~1,000 calls/month)**, so its sync is throttled to once every ~20 hours regardless of the normal 15-minute cycle, covering a fixed set of 5 countries (UK, US, South Africa, Germany, Australia) to stay safely under quota.
- **The application-completed email requires a free Resend account** (`RESEND_API_KEY` in `.env` or Railway variables) — without it, marking an application complete still works, the email step is just skipped.

## New optional setup

- **Resend** (resend.com) — free tier, for the "application submitted" email to users
- **Adzuna** (developer.adzuna.com) — free tier, needs both `app_id` and `app_key`, entered together as `app_id:app_key` in the Job Sources page
- Jobicy, Himalayas, Arbeitnow, EURES need no keys at all

## Security hardening

- **Helmet** — standard security HTTP headers on every response
- **Rate limiting** — login, admin-login, and register endpoints are capped at 20 attempts per 15 minutes per IP, to slow down password-guessing attempts
- **NoSQL injection protection** — `express-mongo-sanitize` strips any `$`-prefixed or dotted keys from incoming request bodies/queries, preventing crafted MongoDB query operators from being injected through form fields
- **Server-side password length validation** — staff/manager account creation and password resets both require 8+ characters, enforced on the backend (not just the frontend's `minlength` attribute, which a script could bypass)

## Static route audit (verified before this build)

Every frontend API call was cross-checked against the backend's actual route definitions — correct path, correct HTTP method, and auth token included where required. No mismatches found. This catches typo'd endpoints and wrong-method bugs that syntax checking alone wouldn't — actual runtime behavior against your live environment variables and data still can't be verified without deploying.

## Pricing is now admin-editable

The previous `$100`/`₦200` fee-per-application values were hardcoded (the USD figure was flagged as an unconfirmed placeholder during a full codebase audit). Both are now stored in a `PricingSetting` collection and editable from the admin dashboard (`dashboard.html` → "Price per application") — no redeploy needed to change a price. The user-facing dashboard fetches the live price via `GET /api/applications/pricing` instead of using a hardcoded number.

## Navigation and dashboard stats additions

- **Mobile nav fix**: on `index.html` and `jobs.html`, the mobile hamburger dropdown now includes a "Sign up" link directly above "Browse jobs" — previously Sign up only existed as a separate always-visible button outside the collapsible menu.
- **User dashboard stats**: `dashboard.html` now shows two live metrics fetched from `GET /api/applications/my-stats` — total amount spent (paid applications, grouped by currency) and total jobs actually applied to (staff-completed applications, not just purchased/queued ones).
