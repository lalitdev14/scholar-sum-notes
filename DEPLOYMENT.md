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

The database, authentication and file storage are hosted services (Lovable Cloud /
Supabase). They are **not** code in this repo, so there is nothing separate to deploy
for them — Vercel only hosts the app, and the app talks to that hosted backend.

## 1. Push to GitHub

Easiest path: in Lovable, open the **+** menu (bottom-left of chat) → **GitHub** →
**Connect project** → **Create Repository**. Everything syncs both ways after that.

Manual alternative:

```sh
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`.env` is git-ignored — never commit it.

## 2. Deploy on Vercel

1. vercel.com → **Add New → Project** → import the GitHub repo.
2. Framework preset: **Other**.
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

`src/lib/ai-gateway.server.ts` picks the first provider it finds, so you are not tied
to Lovable's gateway:

| Set this | Provider used | Default model |
| --- | --- | --- |
| `LOVABLE_API_KEY` | Lovable AI Gateway (automatic inside Lovable) | `google/gemini-3.5-flash` |
| `OPENAI_API_KEY` | OpenAI | `gpt-4o-mini` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google AI | `gemini-2.5-flash` |
| `AI_BASE_URL` + `AI_API_KEY` | any OpenAI-compatible endpoint | `gpt-4o-mini` |

Override the model anywhere with `AI_TEXT_MODEL`. `LOVABLE_API_KEY` is not available
outside Lovable, so on Vercel set an OpenAI or Google key instead.

## 3b. Moving to your own Supabase project (optional but recommended)

`SUPABASE_SERVICE_ROLE_KEY` cannot be read out of Lovable Cloud, so full admin/faculty
functionality on Vercel means owning the database:

1. Create a project at supabase.com.
2. Run every file in `supabase/migrations/` **in filename order** in the SQL editor.
   They create the tables, roles, RLS policies and helper functions.
3. Storage → create a **private** bucket named `handwriting` (the handwritten-page
   archive uploads there).
4. Authentication → Providers → enable **Google** if you want Google sign-in.
5. Copy the project URL, publishable key and service role key from
   Project Settings → API into your Vercel environment variables.
6. Re-create the admin/faculty/student accounts (sign up, then set roles in the
   `user_roles` table for the first admin).


## 4. Post-deploy checklist

- Supabase Auth → URL configuration: add your Vercel domain to **Site URL** and
  **Redirect URLs**, otherwise Google sign-in and email confirmations bounce.
- Verify sign-in, dashboard, class enrollment and the admin panel on the live URL.

## Local development

```sh
npm install
cp .env.example .env   # fill in the blanks
npm run dev            # http://localhost:8080
```
