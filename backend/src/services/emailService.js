import axios from 'axios';

// Uses Resend (resend.com) — has a genuinely free tier, simple API.
// Wrapped so a missing/invalid key never breaks the actual application
// flow — a failed email is logged, not thrown, since "we couldn't email
// the user" should never block marking their application as done.
export async function sendApplicationCompletedEmail(toEmail, toName) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — skipping application-completed email');
    return;
  }

  try {
    await axios.post(
      'https://api.resend.com/emails',
      {
        from: process.env.EMAIL_FROM || 'JobMatch <onboarding@resend.dev>',
        to: toEmail,
        subject: 'Your application has been submitted!',
        html: `
          <p>Hi ${toName || 'there'},</p>
          <p>Good news — your application has been reviewed and submitted by our team.</p>
          <p>We wish you the very best in landing this role. Keep an eye on your email for updates from the employer, and feel free to come back and apply to more matches anytime.</p>
          <p>— The JobMatch team</p>
        `
      },
      { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } }
    );
  } catch (err) {
    console.error('[email] Failed to send application-completed email:', err.message);
  }
}
