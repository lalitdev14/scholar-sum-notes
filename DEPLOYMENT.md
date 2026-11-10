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

Every push to `main` redeploys automatically.

## 3. Environment variables

Copy them from `.env.example`. Set each one for **Production, Preview and Development**.

| Variable | Needed for |
| --- | --- |
| `VITE_SUPABASE_URL` | browser database/auth calls |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | browser database/auth calls |
| `VITE_SUPABASE_PROJECT_ID` | browser client |
| `SUPABASE_URL` | server functions |
| `SUPABASE_PUBLISHABLE_KEY` | server functions (auth middleware) |
| `SUPABASE_SERVICE_ROLE_KEY` | admin panel, faculty review queue, summary writes |
| one AI key (see below) | AI summaries + handwriting transcription |

### AI key (pluggable)

`src/lib/ai-gateway.server.ts` picks the first provider it finds:

| Set this | Provider used | Default model |
| --- | --- | --- |
| `AI_BASE_URL` + `AI_API_KEY` | any OpenAI-compatible endpoint | `gpt-4o-mini` |
| `OPENAI_API_KEY` | OpenAI | `gpt-4o-mini` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI | `gemini-2.5-flash` |

Override the model anywhere with `AI_TEXT_MODEL`.

## 3a. Google sign-in

Google sign-in uses the Supabase project's own Google provider.

1. In Supabase → Authentication → Providers, enable **Google** with your own Google
   OAuth client ID and secret.
2. In Supabase → Authentication → URL Configuration, add your domain to **Site URL**
   and **Redirect URLs** (for the custom domain, both `https://lectureloop.org` and
   `https://www.lectureloop.org`; add `http://localhost:8080` for local dev).

## 3b. Moving to your own Supabase project (recommended)

The current database is hosted by Lovable Cloud, and its `SUPABASE_SERVICE_ROLE_KEY`
cannot be read out, so full admin/faculty functionality means owning the database:

1. Create a project at supabase.com.
2. Run every file in `supabase/migrations/` **in filename order** in the SQL editor,
   then every file in `drizzle/migrations/` in filename order (these add the
   `lecture_slides` and `slide_bookmarks` tables). Together they create the tables,
   roles, RLS policies and helper functions.
   To carry over existing users and data, run the backup's `restore.sql` next
   (see the backup's README; user ids and passwords are preserved).
3. Storage → make sure two **private** buckets exist: `handwriting` (handwritten-page
   archive) and `lecture-slides` (20 MB limit). `restore.sql` creates both.
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
