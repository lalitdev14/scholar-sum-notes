# {{ID}}: {{TITLE}}

| Field        | Value             |
| ------------ | ----------------- |
| ID           | {{ID}}            |
| Status       | Draft             |
| Requested by | {{REQUESTER}}     |
| Created      | {{DATE}}          |
| Branch       | `claude/{{SLUG}}` |
| PR           | (added in step 6) |

Status values: Draft → Ready for build → In build → In test → In PM review → Changes requested
→ Approved → PR raised → Merged to preprod → Released.

## 1. Request (user's words)

> {{REQUEST}}

## 2. Problem / goal

What is wrong or missing today, who is affected, and what should be true afterwards.

## 3. Scope

**In scope**

- …

**Out of scope**

- …

## 4. User stories

- As a student, I want …, so that …

## 5. Acceptance criteria

Each criterion is testable and has an ID that test cases refer to.

| ID   | Criterion |
| ---- | --------- |
| AC-1 | …         |
| AC-2 | …         |

## 6. Design / technical notes

Pages and files affected, data or database changes (migrations), environment settings, risks.

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
