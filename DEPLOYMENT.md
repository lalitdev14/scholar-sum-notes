# Deploying LectureLoop to GitHub + Vercel

## Architecture (why there is only one repo)

This is a **TanStack Start** app: the React UI and the server code live in the same
project and build together.

```text
src/routes/          UI pages (frontend)
src/components/      UI components (frontend)
src/lib/*.functions.ts   server functions = the backend API (run server-side only)
src/integrations/supabase/   database + auth clients
supabase/migrations/ database schema (backend)
```

The database, authentication and file storage are hosted on Supabase. They are **not**
code in this repo, so there is nothing separate to deploy for them — Vercel only hosts the
app, and the app talks to that hosted backend.

## 1. Code

The code lives in `github.com/lalitdev14/scholar-sum-notes`. `.env` holds local values;
never commit secrets (service role key, AI keys) to it.

## 2. Deploy on Vercel

1. vercel.com → **Add New → Project** → import the GitHub repo.
2. Framework preset: **Other**. nitro detects Vercel automatically (or set `NITRO_PRESET=vercel`).
3. Build command: `npm run build` · Install command: `npm install`
   Leave the output directory empty (the build emits `.vercel/output`, which Vercel
   picks up automatically).
4. Add the environment variables below, then **Deploy**.

Every push to `main` redeploys lectureloop.org; every push to `preprod` redeploys
https://lectureloop-preprod.vercel.app (see the release flow below).

## 2a. Release flow: preprod first, then live

Nothing goes straight to the live site. Every change is tested on pre-prod first.

```text
feature branch ──PR──▶ preprod ──release PR──▶ main
                         │                       │
        lectureloop-preprod.vercel.app      lectureloop.org
```

1. **Open each PR against `preprod`** (not `main`). The "Checks" workflow runs typecheck and
   build on it.
2. **Merge it into `preprod`.** Vercel deploys the branch to
   **https://lectureloop-preprod.vercel.app** within a couple of minutes.
3. **Test there.** The address asks you to sign in to Vercel (Vercel Authentication is on for
   every address except lectureloop.org). Then sign in to LectureLoop as usual.
4. **Release:** open a PR from `preprod` into `main` titled "Release …", listing what it
   contains. Merging it deploys lectureloop.org.

The "Release guard" workflow fails any PR into `main` that doesn't come from `preprod`.
For an urgent fix, add the label `hotfix` to the PR to allow it, then merge `main` back
into `preprod` afterwards so the two stay in step.

### Pre-prod shares the live database

Pre-prod uses the same Supabase project as lectureloop.org. So:
- Test with test accounts (for example `zz-test-…@nyu.edu`) and delete them afterwards.
  Don't change or delete real students' data.
- A database change (`supabase/migrations/…`) must be run in Supabase **before** the PR is
  merged into `preprod`, and it must not break the code that is live on `main`
  (add columns or tables; don't rename or drop ones the live code uses).

### One-time setup (dashboard settings)

- **Vercel → Settings → Environment Variables:** edit `SUPABASE_SERVICE_ROLE_KEY` and
  `GOOGLE_GENERATIVE_AI_API_KEY` and also tick **Preview** (or Preview for the branch
  `preprod` only). Without them, AI features and admin tools fail on pre-prod.
- **Supabase → Authentication → URL Configuration → Redirect URLs:** add
  `https://lectureloop-preprod.vercel.app/**` (needed for Google sign-in on pre-prod).
- Account emails (confirm sign-up, reset password) always link to lectureloop.org, because
  they use the Supabase Site URL. Test those flows on the live site.
- To let someone without a Vercel account test pre-prod: Vercel → Settings → Deployment
  Protection → create a shareable link (or turn protection off for previews).

## 3. Environment variables

Copy them from `.env.example`. Set each one for **Production, Preview and Development**.

| Variable | Needed for |
| --- | --- |
| `VITE_SUPABASE_URL` | browser database/auth calls |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | browser database/auth calls |
| `VITE_SUPABASE_PROJECT_ID` | browser client |
| `SUPABASE_URL` | server functions |
| `SUPABASE_PUBLISHABLE_KEY` | server functions (auth middleware) |
| `SUPABASE_SERVICE_ROLE_KEY` | admin panel (user directory, roles, class management) |
| one AI key (see below) | AI note summaries, handwriting transcription, slide overviews |

### AI key (pluggable)

`src/lib/ai-gateway.server.ts` picks the first provider it finds:

| Set this | Provider used | Default model |
| --- | --- | --- |
| `AI_BASE_URL` + `AI_API_KEY` | any OpenAI-compatible endpoint | `gpt-4o-mini` |
| `OPENAI_API_KEY` | OpenAI | `gpt-4o-mini` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI | `gemini-3.8-flash` |

Override the model anywhere with `AI_TEXT_MODEL`.

### Lecture transcription (optional)

The Transcribe tab's AI mode uses **Whisper** when one of these is set (`src/lib/whisper.server.ts`),
otherwise it falls back to the AI key above:

| Set this | Provider used | Default model |
| --- | --- | --- |
| `GROQ_API_KEY` | Groq (fast, about $0.11 per audio hour) | `whisper-large-v3` |
| `WHISPER_API_KEY` (+ optional `WHISPER_BASE_URL`) | OpenAI or any OpenAI-compatible endpoint | `whisper-1` |

Override the model with `WHISPER_MODEL` (e.g. `whisper-large-v3-turbo`, `gpt-4o-transcribe`).
When Whisper is configured, AI mode becomes the default in the Transcribe tab.

## 3a. Google sign-in

Google sign-in uses the Supabase project's own Google provider.

1. In Supabase → Authentication → Providers, enable **Google** with your own Google
   OAuth client ID and secret.
2. In Supabase → Authentication → URL Configuration, add your domain to **Site URL**
   and **Redirect URLs** (for the custom domain, both `https://lectureloop.org` and
   `https://www.lectureloop.org`; add `http://localhost:8080` for local dev).

## 3b. Moving to your own Supabase project (recommended)

The app now runs on its own Supabase project (`ytxsplbzohecawbdskgz`, us-east-1).
These are the steps used to set it up, for reference or for a new environment:

1. Create a project at supabase.com.
2. Run every file in `supabase/migrations/` **in filename order** (SQL editor or
   `supabase db push`). They create all tables, roles, RLS policies, helper functions
   and the two private storage buckets (`handwriting`, `lecture-slides` with a 20 MB limit).
   To carry over existing users and data, run the backup's `restore.sql` next
   (see the backup's README; user ids and passwords are preserved).
3. Upload any stored files (handwriting images, lecture slides) to the same bucket and path.
4. Authentication → Providers → enable **Google** if you want Google sign-in.
5. Copy the project URL, publishable key and service role key from
   Project Settings → API into your Vercel environment variables.
6. If you did not restore a backup, sign up and set roles in the `user_roles` table
   for the first admin.


## 4. Post-deploy checklist

- Supabase Auth → URL configuration: add your Vercel domain to **Site URL** and
  **Redirect URLs**, otherwise Google sign-in and email confirmations bounce.
- Verify sign-in, dashboard, class enrollment and the admin panel on the live URL.

## Local development

```sh
bun install
cp .env.example .env   # fill in the blanks
bun run dev            # http://localhost:8080
```

## Security settings

- **AI limits (per user, per day, UTC):** 20 summaries, 80 handwriting conversions, 150 slide
  overviews, 1500 audio chunks (about 5 hours). Admins get 5x. Change them in the
  `consume_ai_quota` function (`supabase/migrations/20261115120000_security_hardening.sql`).
- **Browser security headers** (CSP, no framing, nosniff, referrer and permissions policies) are
  set in `vite.config.ts` and emitted into the Vercel routing config at build time. If you add
  a new third-party script, font, image or API host, add it to `CONTENT_SECURITY_POLICY`.
- **Admin activity log:** password resets, role changes, deletions, class edits, sign-up
  settings, updates and contact-inbox changes are recorded in `admin_audit_log` and shown in
  the admin panel.
- **Sessions:** the app signs a device out after 30 days without use.
- **Supabase Auth:** minimum password length 8 and re-authentication for password changes are
  on. Leaked-password protection and server-side session timeouts need the Supabase Pro plan.

## Backups (nightly, two copies)

`.github/workflows/nightly-db-backup.yml` runs every night at **midnight New York time**
(05:00 UTC; 01:00 during daylight saving) and can also be run by hand (Actions → *Nightly
database backup* → *Run workflow*). It dumps the whole production database with the Supabase
CLI (roles, schema, all data including accounts, notes, classes and transcripts), checks the
dump isn't empty or partial, **encrypts it (AES-256) with your passphrase**, and keeps:

1. **Copy 1:** the backup Supabase project's private storage bucket `db-backups`, 30 nights.
2. **Copy 2:** a GitHub Actions artifact, 30 days, **only while this repository is private**
   (artifacts of public repositories can be downloaded by any GitHub user, so the step is
   skipped with a warning while the repo is public).

GitHub emails you if a nightly run fails.

### One-time setup
1. **Create the backup project:** in Supabase, *New project* → name `lectureloop-backup`, same
   region (East US). Free plan is fine. Save its database password in your password manager.
2. **Backup project keys:** in the backup project, *Project Settings → API Keys*: copy the
   Project URL and a **secret** key.
3. **Production connection string:** in the production project, *Connect* → **Session pooler**
   → URI, and put the database password in it (reset it under *Database → Settings* if needed).
   Use the session pooler: GitHub runners can't reach the direct (IPv6) address.
4. **Passphrase:** generate one (for example `openssl rand -base64 32`) and keep it in your
   password manager. **Without it, the backups can't be opened.**
5. In GitHub, *Settings → Secrets and variables → Actions → New repository secret*, add:
   `PROD_DB_URL`, `BACKUP_PASSPHRASE`, `BACKUP_SUPABASE_URL`, `BACKUP_SUPABASE_SERVICE_KEY`.
6. Run the workflow once by hand and check it goes green and a file appears in the backup
   project's *Storage → db-backups*.

### Restoring
Download a backup (from the backup project's storage or the workflow run's artifacts), then:

```bash
scripts/backup/restore.sh lectureloop-db-YYYY-MM-DD.tar.gz.gpg "postgresql://…target…"
```

Restore into a **new, empty** Supabase project (for example the backup project when production
is down), then point `SUPABASE_URL` / `VITE_SUPABASE_URL` and the keys in Vercel at it.
Needs `gpg` and a PostgreSQL 17 `psql`.

**Not included:** uploaded files (slide PDFs/PowerPoints and handwriting images) live in
Storage, not in the database. Note text, transcripts and summaries are included.
