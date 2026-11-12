import { Link } from "@tanstack/react-router";

export const CONTACT_EMAIL = "lalit.dev.jakher@nyu.edu";

/** Slim one-line site footer. Uses the shared page container so it lines up with the header logo. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/70">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 text-xs text-muted-foreground sm:px-6 lg:px-10 xl:px-16">
        <span>© {new Date().getFullYear()} LectureLoop</span>
        <nav aria-label="Footer" className="flex items-center gap-4">
          <Link to="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link to="/contact" className="hover:text-foreground">
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}
