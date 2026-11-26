import { createServerFn } from "@tanstack/react-start";
import { NyuSearchInput } from "@/lib/nyu-courses.schema";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** One NYU course (sections merged). */
export type NyuCourse = { code: string; title: string; instructor: string };
/** A term in NYU's class search; `id` is the FOSE srcdb. */
export type NyuTerm = { id: string; label: string; current: boolean };

/** Searches NYU's public class search for a subject name; one entry per course code. */
export const searchNyuCourses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => NyuSearchInput.parse(input))
  .handler(async ({ data }) => {
    const { searchCourses, NyuUnavailableError } = await import("./nyu-courses.server");
    try {
      return { courses: await searchCourses(data.q, data.term) };
    } catch (err) {
      console.error(
        "[nyu-search]",
        err instanceof Error ? err.message : err,
        (err as { cause?: unknown })?.cause,
      );
      if (err instanceof NyuUnavailableError) throw new Error(err.message);
      throw new Error(
        "NYU's class search isn't responding right now. Please try again in a moment.",
      );
    }
  });

/** NYU's term list (Spring 2027, Fall 2026, …) with the current semester marked. */
export const getNyuTerms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getTerms } = await import("./nyu-courses.server");
    return { terms: await getTerms() };
  });
