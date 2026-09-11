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
