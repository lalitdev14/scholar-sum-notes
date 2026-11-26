import { Moon, Sun } from "lucide-react";
import { toggleTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Sun/moon button that switches between Light and Dark. The icon and the accessible name are
 * picked by CSS from the `dark` class on <html>, so they are right from the first paint (the
 * server doesn't know the theme).
 */
export function ThemeToggle({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={toggleTheme}
      data-testid="theme-toggle"
      className={cn(
        "inline-grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
        className,
      )}
    >
      <Moon className="h-[1.15rem] w-[1.15rem] dark:hidden" aria-hidden="true" />
      <Sun className="hidden h-[1.15rem] w-[1.15rem] dark:block" aria-hidden="true" />
      <span className="sr-only dark:hidden">Switch to dark theme</span>
      <span className="sr-only hidden dark:inline">Switch to light theme</span>
    </button>
  );
}
