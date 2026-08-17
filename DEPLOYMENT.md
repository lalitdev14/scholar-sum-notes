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
| `LOVABLE_API_KEY` | AI summaries + handwriting transcription |

### Two values you must obtain yourself

- **`SUPABASE_SERVICE_ROLE_KEY`** — not exposed by Lovable Cloud. Without it the admin
  panel, faculty review queue and summary upsert fail on Vercel.
- **`LOVABLE_API_KEY`** — injected automatically inside Lovable, but not available for
  external hosting.

If you want full functionality on Vercel, the clean route is to move the database to
your own Supabase project (run `supabase/migrations/*.sql` there, then use its own URL,
publishable key and service role key) and swap the AI gateway call in
`src/lib/ai-gateway.server.ts` for your own provider key (e.g. OpenAI or Google AI).

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
