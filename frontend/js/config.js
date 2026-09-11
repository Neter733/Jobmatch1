// Auto-detects local development vs production, so this is the ONLY line
// you need to edit once you deploy the backend to Railway — replace the
// placeholder URL below with your real Railway backend URL.
const API_BASE_URL =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : 'https://jobmatch1-production.up.railway.app';

// Same auto-detection for Google Sign-In's client ID — this one is safe
// to expose publicly (it's not a secret).
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
