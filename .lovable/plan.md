# LectureLoop UI/UX polish

## Scope
Front-end presentation and interaction changes only. Preserve all data access, authentication, server functions, storage behavior, university theming, typography, and existing features. No files will be deleted.

## Dashboard
- Consolidate the greeting, university context, page description, and enrollment/class actions into one responsive page header with a single `<h1>`.
- Separate the dashboard profile query cache key from the header query.
- Add class-card loading skeletons and an illustrated empty-state card whose primary action opens subject enrollment.
- Type the nested enrollment count returned by the existing query and remove the unsafe cast.

## Header and public pages
- Add current-page styling through TanStack Router active link properties.
- Derive a readable light or dark foreground from the university primary colour and use it consistently throughout desktop and mobile header content.
- Reveal account identity at the `lg` breakpoint.
- Simplify the landing call-to-action, correct note-saving copy, and rename the footer link to “About”.
- Replace university selection with the existing shadcn Select, align signup copy around personal or university emails, add an accessible password visibility control, and add a Google mark.

## Class workspace
- Reorder the shared AI summary above notes/slides below `lg`, while retaining its current desktop position.
- Display reviewed status and any review note.
- Replace slide renaming via browser prompt with a focused Dialog and Input.
- Add an unsaved-changes hint by comparing the editor with the last fetched/saved note.
- Replace hand-built classmate initials with the existing Avatar components and raise all sub-12px text to at least 12px.

## Admin and accessibility
- Add a named destructive confirmation dialog before class deletion.
- Convert the account directory to the existing shadcn Table components without changing its data or controls.
- Audit touched screens for icon-only controls, adding accessible labels where needed, and remove remaining text below 12px.

## Validation
- Check generated diagnostics after edits.
- Exercise the key desktop and mobile views in the browser, including dialogs, active navigation, empty/loading-safe layouts, password visibility, summary placement, and class deletion confirmation.
- Report the exact list of changed files.
