import { Link } from "@tanstack/react-router";
import { useUniversityTheme } from "@/hooks/useUniversityTheme";

export const CONTACT_EMAIL = "lalit.dev.jakher@nyu.edu";

// LectureLoop is NYU-only, so signed-out pages use NYU violet too.
const NYU_VIOLET = "#57068c";

/**
 * Slim one-line footer in the university's colour (the same as the header): © and links.
 * Uses the shared page container so it lines up with the header logo.
 */
export function SiteFooter() {
  const theme = useUniversityTheme();
  const color = theme.name ? theme.primary : NYU_VIOLET;

  return (
    <footer className="mt-auto text-white" style={{ backgroundColor: color }}>
      <div className="mx-auto flex max-w-[100rem] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-xs sm:px-6 lg:px-10 xl:px-16">
        <span className="opacity-80">© {new Date().getFullYear()} LectureLoop</span>
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
