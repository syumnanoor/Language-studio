# Italian Language Studio

Public mobile learning website for A1–B1, with optional private accounts and consent-based family progress summaries. Developed by Yumna Noor: s.yumnanoor@gmail.com.

## Included

- Preserved 30 foundation/starter/grammar lessons and 180 cards from the local app.
- 96 original A2/B1 mini-lessons across 24 units; 72 new cards.
- Case-tolerant answer keys, explicit alternatives, punctuation-sensitive tasks, tappable MCQs, repair feedback, and a bounded writing-pattern coach.
- Three objective checkpoints per level with 80% threshold, cumulative coverage, writing tasks and 24-hour retake delay. These are practice milestones, not certification.
- Browser recording/download, optional browser-provider speech transcription, transcript/feedback copy workflow. Audio is never uploaded to this app.
- Supabase sign-up/sign-in/recovery, HttpOnly sessions, account-level progress, private exports and idempotent import of written attempts from the old local app.
- Family invitation codes: the learner explicitly consents; only summary evidence is returned. Either party can revoke the link.

## Run

Node 22 or later, no third-party runtime dependencies:

```sh
node scripts/build.mjs
node --test tests/*.test.mjs
node --env-file=.env.local scripts/dev.mjs
```

Preview on http://127.0.0.1:4320. Set APP_ORIGIN to that origin for local authenticated testing. The original app at port 4319 and its SQLite database are untouched.

## Supabase + Vercel deployment

1. Create a new free Supabase project. Run `supabase/schema.sql` in its SQL editor.
2. Set Vercel project name to `italianlanguagestudio`, framework Other. The repository's vercel.json defines the build and server routes.
3. Add SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and APP_ORIGIN to Vercel environment settings. APP_ORIGIN must match the production origin exactly. Never expose the service key in static files or Git.
4. Configure Supabase Auth Site URL to the production origin. For public confirmation/recovery email, configure a production SMTP provider; Supabase's default mail service is limited. The app supports email OTP entry: include `{{ .Token }}` in confirmation and recovery email templates. Keep email confirmation enabled unless a reviewed alternate account recovery model is implemented.
5. Push main and deploy. Verify signup, verification, login, cookie refresh, recovery, two-account isolation, family consent/revocation and progress persistence against the live database. Never treat mocked tests as proof of live database configuration.

## Data/security

All writes pass through the server, which derives user identity from Supabase Auth and grades answers from server-side keys. Database authenticated users have SELECT permission only under an own-user RLS policy. Service-role calls include explicit owner filters. No browser-supplied grades, ownership fields or imported test passes are trusted. Family codes have 96 bits of randomness, are stored hashed, expire after seven days, and are single use. Backups never contain auth tokens. No learner records or local database have been committed.

## Known review limits

Content remains a draft pending Italian/Urdu editorial review. Mini-lessons do not constitute a complete certified CEFR programme. No listening audio curriculum or pronunciation scoring is supplied. Free writing checks selected patterns and does not claim general semantic/grammar correctness. A local language model is not hosted on Vercel. Speaking feedback is user-provided and unverified. External CILS/CELI materials are linked rather than copied. The test bank is small and retakes reuse questions; results are practice evidence, not secure examinations. No notification or marketing reminder system.

The generated `src/content.json` is server input; `dist/content.json` strips task and checkpoint answer keys. Learning examples naturally demonstrate the same grammar. This is a learning app, not a high-stakes testing platform.
