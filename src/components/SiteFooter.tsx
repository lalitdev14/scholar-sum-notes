import { Link } from "@tanstack/react-router";
import { Landmark } from "lucide-react";
import { useUniversityTheme } from "@/hooks/useUniversityTheme";

export const CONTACT_EMAIL = "lalit.dev.jakher@nyu.edu";

// LectureLoop is NYU-only, so signed-out pages use NYU violet too.
const NYU = { name: "New York University", primary: "#57068c" };

/**
 * Slim one-line footer in the university's colour (the same as the header).
 * Uses the shared page container so it lines up with the header logo.
 */
export function SiteFooter() {
  const theme = useUniversityTheme();
  const name = theme.name || NYU.name;
  const color = theme.name ? theme.primary : NYU.primary;

  return (
    <footer className="mt-auto text-white" style={{ backgroundColor: color }}>
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-xs sm:px-6 lg:px-10 xl:px-16">
        <div className="flex min-w-0 items-center gap-2">
          <Landmark className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="font-semibold">{name}</span>
          <span className="opacity-50">·</span>
          <span className="opacity-80">© {new Date().getFullYear()} LectureLoop</span>
        </div>
        <nav aria-label="Footer" className="flex items-center gap-4">
          <Link to="/privacy" className="opacity-80 transition-opacity hover:opacity-100">
            Privacy
          </Link>
          <Link to="/contact" className="opacity-80 transition-opacity hover:opacity-100">
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}
