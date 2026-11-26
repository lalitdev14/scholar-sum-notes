# REQ-2026-11-26-dashboard-greeting-shows-full-name: Dashboard greeting shows full name

| Field        | Value             |
| ------------ | ----------------- |
| ID           | REQ-2026-11-26-dashboard-greeting-shows-full-name            |
| Status       | Ready for build   |
| Requested by | Product owner     |
| Created      | 2026-11-26          |
| Branch       | `claude/dashboard-full-name` |
| PR           | (added in step 6) |

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
