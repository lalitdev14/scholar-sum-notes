# Requirement → build → test → approve → PR

Every change request ("requirement") goes through the same six steps. Each step is done by a
separate agent with one role, and each step is recorded in the requirement's **audit trail**.
Nothing is raised as a PR until the product manager approves.

```text
 1. Requirement   2. Build        3. Test cases     4. Test run         5. PM review       6. PR
 (analyst)  ───▶  (developer) ─▶  (test master) ─▶  (tester)       ─▶  (product mgr) ──▶  (release)
 requirement.md   code on a       test-cases.json   test-results.json   approve / changes   PR into preprod
                  branch          from the doc      + screenshots       requested
                                  only              + test-evidence.xlsx
                                        ▲                                     │
                                        └──────── changes requested ◀─────────┘
```

## Where it lives

One folder per requirement, committed with the code:

```text
docs/requirements/REQ-2026-11-21-pptx-viewer/
  requirement.md        the structured requirement, PM verification and the audit trail
  test-cases.json       written by the test master
  test-results.json     written by the tester
  evidence/             screenshots (TC-01-1.png, …)
  test-evidence.xlsx    generated: test cases + results + embedded evidence + audit trail
```

## Roles and steps

| #   | Role                                   | Agent does                                                                                                                                                                                                                                                        | Output                                                                | Gate                                |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------- |
| 1   | **Requirement analyst** (main session) | Turns the user's request into a structured requirement: problem, scope, user stories, numbered acceptance criteria (AC-1, AC-2, …), out of scope, risks. Asks the user only when a decision is genuinely theirs.                                                  | `requirement.md` (status `Draft` → `Ready for build`)                 | Every AC is testable                |
| 2   | **Developer**                          | Builds on its own branch from `preprod` (`claude/<slug>`), using only the requirement. Runs `bun run typecheck` and `bun run build`. Does not write the test cases.                                                                                               | Commits on the branch; summary of what changed and how each AC is met | Typecheck + build pass              |
| 3   | **Test master**                        | Reads **only the requirement** (not the code) and writes test cases that cover every AC: happy paths, edge cases, errors, phone width, and regressions on nearby features.                                                                                        | `test-cases.json`                                                     | Every AC has at least one test case |
| 4   | **Tester**                             | Runs every test case against the built branch (local production build or dev server, with test data or mocked services; never real student data). Captures a screenshot per test as evidence, records actual result and Pass/Fail, then generates the Excel file. | `test-results.json`, `evidence/*.png`, `test-evidence.xlsx`           | All test cases executed             |
| 5   | **Product manager**                    | Checks the requirement against the working feature and the evidence: is every AC met, does it behave as the user asked, is the copy clear? Writes the decision in `requirement.md`. **Changes requested** sends it back to step 2 (and 3–4 re-run).               | Decision `Approved` / `Changes requested` with notes                  | Approved                            |
| 6   | **Release** (main session)             | Only after approval: commits the requirement folder with the code and raises the PR into `preprod`, linking the requirement and the Excel file. Records the PR link.                                                                                              | PR into `preprod`                                                     | —                                   |

After the PR is merged and tested on pre-prod, the normal release PR (`preprod` → `main`) takes
it live (see "Release flow" in `DEPLOYMENT.md`).

## The audit trail

Every step appends a row to the **Audit trail** table at the bottom of `requirement.md` (and the
same rows appear in the Excel file's "Audit trail" sheet): UTC time, role, action, details.
Always use the script so the format stays consistent:

```bash
node scripts/req/audit.mjs <REQ folder> "<Role>" "<Action>" "<Details>"
```

Typical actions: `Requirement created`, `Requirement ready for build`, `Build complete`,
`Test cases written`, `Tests executed`, `Evidence generated`, `PM approved` /
`PM requested changes`, `PR raised`, `PR merged`, `Released to production`.

## Commands

```bash
# 1. start a requirement (creates the folder from the template + first audit row)
node scripts/req/new.mjs "PowerPoint viewer crash"

# any step: add an audit row
node scripts/req/audit.mjs docs/requirements/REQ-… "Tester" "Tests executed" "12 passed, 0 failed"

# 4. build test-evidence.xlsx from test-cases.json + test-results.json + evidence/
node scripts/req/evidence.mjs docs/requirements/REQ-…
```

## File formats

`test-cases.json` (test master):

```json
[
  {
    "id": "TC-01",
    "ac": ["AC-1"],
    "title": ".pptx with no browser file type uploads",
    "type": "Functional",
    "priority": "High",
    "preconditions": "Signed in, enrolled in a class",
    "steps": ["Open the class", "Add slides → choose lecture.pptx (no file type)"],
    "expected": "Toast 'Slides uploaded'; the deck appears in the Slides panel"
  }
]
```

`test-results.json` (tester):

```json
[
  {
    "id": "TC-01",
    "result": "Pass",
    "actual": "Toast 'Slides uploaded'; deck shown with 2 slides",
    "evidence": ["evidence/TC-01-1.png"],
    "environment": "Local production build, mocked Supabase",
    "testedAt": "2026-11-21T10:00:00Z"
  }
]
```

`result` is one of `Pass`, `Fail`, `Blocked`, `Not run`.

## Rules

- The test master never reads the implementation; test cases come from the requirement only.
- The tester never edits code; a failing test goes back to the developer.
- Test data only: no real student accounts or notes. Delete any test accounts afterwards.
- Secrets never go into the documents, screenshots or the Excel file.
- Small fixes (a typo, a one-line copy change) can skip steps 3–5 if the user says so; record
  that decision in the audit trail.
