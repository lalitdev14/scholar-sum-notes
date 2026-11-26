import { z } from "zod";

/** Input of searchNyuCourses: a subject name (2–80 characters after trimming) and a FOSE term id. */
export const NyuSearchInput = z.object({
  q: z.string().trim().min(2).max(80),
  // FOSE term ids are short numbers ("1274", "9999").
  term: z
    .string()
    .trim()
    .regex(/^\d{1,8}$/),
});

/** Input of getNyuSections: an NYU course code ("CS-GY 6033") and a FOSE term id. */
export const NyuSectionsInput = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9][A-Za-z0-9 .&-]*$/),
  term: z
    .string()
    .trim()
    .regex(/^\d{1,8}$/),
});
