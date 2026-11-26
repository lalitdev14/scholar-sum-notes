/**
 * The NYU section each student picked for their classes (table `class_sections`, own rows
 * only). Browser-side helpers around the Supabase client.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { asMeetings, type Meeting } from "@/lib/meeting-times";
import type { NyuSection } from "@/lib/nyu-courses.functions";

export type SavedSection = {
  classId: string;
  term: string;
  sectionNo: string;
  scheduleType: string;
  meets: string;
  meetings: Meeting[];
  startDate: string | null;
  endDate: string | null;
};

/** React Query key of the signed-in student's saved sections. */
export const CLASS_SECTIONS_KEY = ["class-sections"] as const;

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** The student's saved sections, keyed by class id. */
export async function loadMySections(): Promise<Map<string, SavedSection>> {
  const userId = await currentUserId();
  const out = new Map<string, SavedSection>();
  if (!userId) return out;
  const { data, error } = await supabase
    .from("class_sections")
    .select("class_id, term, section_no, schedule_type, meets, meetings, start_date, end_date")
    .eq("user_id", userId);
  if (error) throw error;
  for (const r of data ?? []) {
    out.set(r.class_id, {
      classId: r.class_id,
      term: r.term,
      sectionNo: r.section_no,
      scheduleType: r.schedule_type,
      meets: r.meets,
      meetings: asMeetings(r.meetings),
      startDate: r.start_date,
      endDate: r.end_date,
    });
  }
  return out;
}

export function useMySections(enabled = true) {
  return useQuery({
    queryKey: CLASS_SECTIONS_KEY,
    enabled,
    staleTime: 60 * 1000,
    retry: 1,
    queryFn: loadMySections,
  });
}

export function useRefreshSections() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: CLASS_SECTIONS_KEY });
}

/** Saves (or replaces) the student's section for a class. */
export async function saveSection(classId: string, section: NyuSection): Promise<void> {
  const userId = await currentUserId();
  if (!userId) throw new Error("Not signed in");
  const { error } = await supabase.from("class_sections").upsert(
    {
      user_id: userId,
      class_id: classId,
      term: section.term,
      section_no: section.no,
      schedule_type: section.type,
      meets: section.meets,
      meetings: section.meetings as unknown as Json,
      start_date: section.startDate,
      end_date: section.endDate,
    },
    { onConflict: "user_id,class_id" },
  );
  if (error) throw error;
}

/**
 * Forgets the student's section for a class. Never throws: removing a class must not fail
 * because of this (the database also removes it when the enrollment is deleted).
 */
export async function deleteSection(classId: string, userId?: string): Promise<void> {
  try {
    const uid = userId ?? (await currentUserId());
    if (!uid) return;
    const { error } = await supabase
      .from("class_sections")
      .delete()
      .eq("user_id", uid)
      .eq("class_id", classId);
    if (error) console.warn("[sections] could not delete saved section", error);
  } catch (err) {
    console.warn("[sections] could not delete saved section", err);
  }
}

/**
 * Saves sections picked for courses just added in the subjects form, finding each class by
 * its code among the student's enrollments. Returns how many could not be saved.
 */
export async function savePendingSections(
  userId: string,
  pending: { code: string; section: NyuSection }[],
): Promise<number> {
  if (!pending.length) return 0;
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  let failed = 0;
  try {
    const { data: enrollments, error } = await supabase
      .from("enrollments")
      .select("class_id")
      .eq("user_id", userId);
    if (error) throw error;
    const ids = (enrollments ?? []).map((e) => e.class_id);
    const { data: classes, error: classesError } = ids.length
      ? await supabase.from("classes").select("id, code").in("id", ids).is("deleted_at", null)
      : { data: [], error: null };
    if (classesError) throw classesError;
    for (const p of pending) {
      const klass = (classes ?? []).find((c) => norm(c.code) === norm(p.code));
      if (!klass) {
        failed++;
        continue;
      }
      try {
        await saveSection(klass.id, p.section);
      } catch (err) {
        console.error("[sections] could not save", p.code, err);
        failed++;
      }
    }
  } catch (err) {
    console.error("[sections] could not save sections", err);
    return pending.length;
  }
  return failed;
}
