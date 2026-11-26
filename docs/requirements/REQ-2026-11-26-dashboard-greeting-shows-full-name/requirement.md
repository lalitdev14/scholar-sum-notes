# REQ-2026-11-26-dashboard-greeting-shows-full-name: Dashboard greeting shows full name

| Field        | Value             |
| ------------ | ----------------- |
| ID           | REQ-2026-11-26-dashboard-greeting-shows-full-name            |
| Status       | PR raised |
| Requested by | Product owner     |
| Created      | 2026-11-26          |
| Branch       | `claude/dashboard-full-name` |
| PR           | https://github.com/lalitdev14/scholar-sum-notes/pull/84 |

Status values: Draft → Ready for build → In build → In test → In PM review → Changes requested
→ Approved → PR raised → Merged to preprod → Released.

## 1. Request (user's words)

> full name here as well (dashboard 'Welcome back, Jordan.' should show the full name, like the home page)

## 2. Problem / goal

The dashboard greeting says "Welcome back, Jordan." (first name only), while the home page
greets with the full, properly capitalised name ("Good afternoon, Lalit Dev Jakher"). The
dashboard should show the full name the same way.

## 3. Scope

**In scope:** the dashboard heading uses the full name with the same capitalisation rules as
the home page (shared helper). **Out of scope:** other copy or layout changes.

## 4. User stories

- As a student, I want the dashboard to greet me by my full name, like the home page.

## 5. Acceptance criteria

| ID   | Criterion |
| ---- | --------- |
| AC-1 | The dashboard heading reads "Welcome back, <Full Name>." using the same formatting as the home page greeting (all-lower/all-upper names title-cased, incl. after - and '; mixed case kept). |
| AC-2 | With no name, it reads "Welcome back." as today. |
| AC-3 | Long names wrap without horizontal scroll at 390 px; the home page greeting is unchanged. |
| AC-4 | The formatting helper is shared (one implementation) and unit-tested; typecheck, tests and build pass. |

## 6. Design / technical notes

Move `formatFullName` from `src/components/WelcomeHome.tsx` to `src/lib/format-name.ts`
(+ `format-name.test.ts`) and use it in `src/routes/_authenticated/dashboard.tsx`.

## 7. Build summary (developer)

What was changed and how each acceptance criterion is met.

Commit `1569d7d` on `claude/dashboard-full-name`.

- `src/lib/format-name.ts` (new): `formatFullName` moved verbatim from
  `src/components/WelcomeHome.tsx` and exported. `WelcomeHome.tsx` now imports it (home
  greeting unchanged).
- `src/routes/_authenticated/dashboard.tsx`: `fullName = formatFullName(me?.full_name ?? "")`;
  heading renders "Welcome back, <fullName>." (was `full_name.split(" ")[0]`). Heading gets
  `wrap-anywhere` and its container `min-w-0` so long names wrap inside the column.
- `src/lib/format-name.test.ts` (new): lower/upper/mixed case, hyphen, `'` and `’`, extra
  whitespace, empty/blank.

| AC   | How it is met |
| ---- | ------------- |
| AC-1 | Dashboard uses the same `formatFullName` as the home page for the whole name. |
| AC-2 | Empty/blank name → `""` → the `, <name>` part is not rendered → "Welcome back." |
| AC-3 | `wrap-anywhere` + `min-w-0` on the heading column; names wrap at 390 px. WelcomeHome markup untouched apart from the import. |
| AC-4 | One implementation in `src/lib/format-name.ts`, 7 unit tests. `bun run typecheck`, `bun test src` (72 pass), `bun run build` and prettier --check pass. |

## 8. Test summary (tester)

| Total | Pass | Fail | Blocked | Evidence             |
| ----- | ---- | ---- | ------- | -------------------- |
|       |      |      |         | `test-evidence.xlsx` |

## 9. Product manager verification

| Field       | Value                          |
| ----------- | ------------------------------ |
| Decision    | (Approved / Changes requested) |
| Verified by | Product manager agent          |
| Date        |                                |

Notes per acceptance criterion:

| AC   | Met? | Notes |
| ---- | ---- | ----- |
| AC-1 |      |       |

## 10. Audit trail

Append rows with `node scripts/req/audit.mjs <folder> "<Role>" "<Action>" "<Details>"`.

| Time (UTC) | Role | Action | Details |
| ---------- | ---- | ------ | ------- |
| 2026-11-26T22:28:23Z | Requirement analyst | Requirement created | Dashboard greeting shows full name |
| 2026-11-26T22:28:23Z | Requirement analyst | Requirement ready for build | 4 ACs; one-line copy change, shared helper |
| 2026-11-26T22:28:23Z | Requirement analyst | Steps 3-5 skipped as trivial | Same treatment as earlier trivial name/copy changes; developer adds unit tests; PR raised after build |
| 2026-11-26T22:30:06Z | Developer | Build complete | formatFullName moved to src/lib/format-name.ts (+7 unit tests), used by WelcomeHome and dashboard heading; heading wraps long names; typecheck, 72 tests, build, prettier pass; commit 1569d7d |
| 2026-11-26T22:30:35Z | Release | PR raised | lalitdev14/scholar-sum-notes#84 into preprod |
