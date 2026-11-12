import { Link } from "@tanstack/react-router";
import { GraduationCap, Mail } from "lucide-react";

export const CONTACT_EMAIL = "lalit.dev.jakher@nyu.edu";

const links = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/feedback", label: "Feedback" },
  { to: "/privacy", label: "Privacy" },
] as const;

/** Site-wide footer. Uses the shared page container so it lines up with the header logo. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/70 bg-background/60">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <Link to="/" className="inline-flex items-center gap-2 text-foreground">
            <GraduationCap className="h-5 w-5" />
            <span className="font-display text-lg">LectureLoop</span>
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">
            Your notes, summarized · Made for NYU students
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="font-medium text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
              activeOptions={{ exact: true }}
            >
              {l.label}
            </Link>
          ))}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Mail className="h-4 w-4" /> Contact
          </a>
        </nav>
      </div>
      <div className="mx-auto max-w-[1600px] px-4 pb-6 text-xs text-muted-foreground sm:px-6">
        © {new Date().getFullYear()} LectureLoop. Not an official New York University service.
      </div>
    </footer>
  );
}
