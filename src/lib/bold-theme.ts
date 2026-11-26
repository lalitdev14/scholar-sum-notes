/**
 * The bold and modern look (landing page, sign-in and dashboard): ink black, electric violet
 * for actions, rounded white blocks on soft grey, Space Grotesk headings.
 *
 * Colours are CSS variables (src/theme.css) so they switch with the Light / Dark theme; the
 * light values are the original fixed colours.
 */
/** Ink text colour (near-black in light, near-white in dark). */
export const INK = "var(--bold-ink)";
/** Dark panels and the public header (ink black in light, a lifted dark in dark). */
export const INK_PANEL = "var(--bold-panel)";
/** Violet fill behind white text (same in both themes). */
export const VIOLET = "var(--bold-violet)";
/** Violet used as text on the page (lighter in dark so it stays readable). */
export const VIOLET_TEXT = "var(--bold-violet-text)";
export const LIME = "#d6ff5c";
export const SOFT_GREY = "var(--bold-page)";

export const grotesk = {
  fontFamily: '"Space Grotesk", "Inter", ui-sans-serif, system-ui, sans-serif',
};

/** Classes for a shadcn <Button>: violet pill. */
export const boldPrimary =
  "rounded-full bg-[#6d4aff] font-semibold text-white shadow-none hover:bg-[#5b38f0] focus-visible:ring-[#6d4aff]";
/** Classes for a shadcn <Button>: white pill with an ink outline. */
export const boldOutline =
  "rounded-full border-2 border-bold-ink bg-bold-block font-semibold text-bold-ink shadow-none hover:bg-bold-hover hover:text-bold-ink";
/** Rounded white block on the soft grey page. */
export const boldBlock = "rounded-[1.25rem] bg-bold-block";
/** Inputs inside bold pages. */
export const boldInput =
  "h-11 rounded-xl border-bold-input-line bg-bold-input focus-visible:border-[#6d4aff] focus-visible:ring-[#6d4aff]/30";
