#!/usr/bin/env python3
"""
Brings back typed notes that are in a backup but no longer in production.

  restore-notes.py <data.sql> [--ids id1,id2 | --class CODE] [--apply]

Without --apply it only lists what it would restore (a dry run). It never overwrites a
note that has text: a deleted note is restored only when that student has no note in the
class now, or their current note there is empty. Reads PROD_DB_URL; needs psql.
Prints no note text or email addresses (Actions logs of a public repository are public).
"""
import argparse, csv, io, os, re, subprocess, sys, tempfile

DB = os.environ["PROD_DB_URL"]


def psql_rows(sql):
    out = subprocess.run(["psql", DB, "-X", "-v", "ON_ERROR_STOP=1", "--csv", "-c", sql],
                         check=True, capture_output=True, text=True).stdout
    return list(csv.DictReader(io.StringIO(out)))


def unescape(v):
    """COPY text format → Python value (None for NULL)."""
    if v == r"\N":
        return None
    return re.sub(r"\\(.)", lambda m: {"t": "\t", "n": "\n", "r": "\r", "\\": "\\"}.get(m.group(1), m.group(1)), v)


def notes_from_dump(path):
    head = re.compile(r'^COPY "?public"?\."?notes"? \((.*)\) FROM stdin;$')
    cols, rows = None, []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            if cols is None:
                m = head.match(line)
                if m:
                    cols = [c.strip().strip('"') for c in m.group(1).split(",")]
                continue
            if line == r"\.":
                break
            vals = line.split("\t")
            rows.append({"raw": line, **{c: unescape(v) for c, v in zip(cols, vals)}})
    if cols is None:
        sys.exit("::error::No public.notes data in this backup")
    return cols, rows


def blank(html):
    return not re.sub(r"<[^>]+>|&nbsp;|\s", "", html or "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("data_sql")
    ap.add_argument("--ids", default="")
    ap.add_argument("--class", dest="klass", default="")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    cols, backup = notes_from_dump(a.data_sql)
    now = {r["id"]: r for r in psql_rows("select id, user_id, class_id, content from public.notes")}
    by_pair = {(r["user_id"], r["class_id"]): r for r in now.values()}
    users = {r["id"] for r in psql_rows("select id from auth.users")}
    classes = {r["id"]: r for r in psql_rows(
        "select id, coalesce(code,'') code, name, deleted_at from public.classes")}

    want_ids = {x.strip() for x in a.ids.split(",") if x.strip()}
    want_class = a.klass.strip().lower()

    found = []
    for r in backup:
        if r["id"] in now or blank(r.get("content")):
            continue  # still there, or nothing worth restoring
        c = classes.get(r["class_id"])
        label = f'{c["code"] or "-"} {c["name"]}' if c else "(class no longer exists)"
        if want_class and not (c and want_class in (c["code"].lower(), c["name"].lower())):
            continue
        cur = by_pair.get((r["user_id"], r["class_id"]))
        if r["user_id"] not in users:
            status = "skip: account deleted"
        elif not c:
            status = "skip: class deleted for good"
        elif cur and cur["content"] == r.get("content"):
            status = "skip: already restored"
        elif cur and not blank(cur["content"]):
            status = "skip: student has new notes there"
        elif cur:
            status = "restore (replaces an empty note)"
        else:
            status = "restore"
        found.append((r, label, status, cur))

    lines = ["| note id | class | last saved | characters | result |", "|---|---|---|---|---|"]
    for r, label, status, _ in found:
        chars = len(re.sub(r"<[^>]+>", "", r.get("content") or ""))
        lines.append(f'| `{r["id"]}` | {label} | {(r.get("updated_at") or "")[:16]} | {chars} | {status} |')
    table = "\n".join(lines) if found else "No deleted notes found: every note in this backup is still in production."
    print(table)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as s:
            s.write(("## Deleted notes found in the backup\n\n" if not a.apply else "## Restore\n\n") + table + "\n")

    if not a.apply:
        print("\nDry run: nothing was changed. Re-run with apply and the note ids to restore.")
        return
    if not want_ids:
        sys.exit("::error::List the note ids to restore (from the dry run).")
    todo = [(r, cur) for r, _, status, cur in found if r["id"] in want_ids and status.startswith("restore")]
    missing = want_ids - {r["id"] for r, _ in todo}
    if missing:
        sys.exit(f"::error::These ids can't be restored (see the table): {', '.join(sorted(missing))}")

    inserts = [r["id"] for r, cur in todo if not cur]
    replaces = [(r["id"], cur["id"]) for r, cur in todo if cur]
    q = lambda xs: ", ".join(f"'{x}'" for x in xs)  # ids are UUIDs from the database
    with tempfile.TemporaryDirectory() as d:
        data = os.path.join(d, "notes.copy")
        with open(data, "w", encoding="utf-8") as f:
            f.write("\n".join(r["raw"] for r, _ in todo) + "\n")
        script = [
            "\\set ON_ERROR_STOP on",
            "begin;",
            "create temp table restore_notes (like public.notes) on commit drop;",
            f"\\copy restore_notes ({', '.join(cols)}) from '{data}'",
        ]
        if inserts:
            script.append(f"insert into public.notes select * from restore_notes where id in ({q(inserts)});")
        for backup_id, current_id in replaces:
            # Put the backed-up text into the student's empty note (same row, same id).
            script.append(
                "update public.notes n set content = r.content, summary = r.summary, "
                "key_points = r.key_points, summary_updated_at = r.summary_updated_at, "
                f"updated_at = now() from restore_notes r where r.id = '{backup_id}' and n.id = '{current_id}';")
        script.append("commit;")
        sql = os.path.join(d, "restore.sql")
        with open(sql, "w", encoding="utf-8") as f:
            f.write("\n".join(script) + "\n")
        subprocess.run(["psql", DB, "-X", "-q", "-f", sql], check=True)
    print(f"Restored {len(todo)} note(s): {len(inserts)} added back, {len(replaces)} filled an empty note.")


if __name__ == "__main__":
    main()
