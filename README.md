# LectureLoop

Personal class notes: students take their own notes for each class (typed or handwritten,
alongside the lecture slides), and AI turns them into a comprehensive personal study summary.

## Development

Requires Node.js 22+ and [bun](https://bun.sh) (or npm).

```sh
git clone https://github.com/lalitdev14/scholar-sum-notes.git
cd scholar-sum-notes
bun install
cp .env.example .env   # fill in Supabase + AI keys
bun run dev            # http://localhost:8080
```

Other scripts: `bun run build`, `bun run preview`, `bun run typecheck`, `bun run lint`.

## Deploying

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Vercel (or any nitro-supported host) and the
environment variables it needs.

## Built with

- TanStack Start (React UI + server functions in one codebase)
- TypeScript, React, Tailwind CSS, shadcn/ui
- Supabase (database, auth, storage)
