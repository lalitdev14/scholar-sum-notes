import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { waitAtMost } from "@/lib/wait-at-most";

/**
 * Queries shared by the dashboard, the home page and the class page, so a class can be
 * prefetched (on hover/focus/touch of its card, and in the route loader) before it opens.
 * Opening a class then shows the real header on the first frame instead of a placeholder.
 */

/** The signed-in student's id from the saved session (no network round trip). */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id) return data.session.user.id;
  const { data: userData } = await supabase.auth.getUser();
  return userData.user?.id ?? null;
}

export const classQueryOptions = (classId: string) =>
  queryOptions({
    queryKey: ["class", classId],
    // "No such class" (deleted or wrong link) is final: show the message right away.
    retry: (count, err) => (err as { code?: string }).code !== "PGRST116" && count < 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, subject, professor, code, term")
        .eq("id", classId)
        .single();
      if (error) throw error;
      return data;
    },
  });

export const myNoteQueryOptions = (classId: string) =>
  queryOptions({
    queryKey: ["my-note", classId],
    queryFn: async () => {
      const userId = await currentUserId();
      if (!userId) return null;
      const { data, error } = await supabase
        .from("notes")
        .select("id, content, summary, key_points, summary_updated_at, updated_at")
        .eq("class_id", classId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const dashboardProfileQueryOptions = () =>
  queryOptions({
    queryKey: ["dashboard-profile"],
    queryFn: async () => {
      const userId = await currentUserId();
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single();
      if (error) throw error;
      return data;
    },
  });

export const myEnrollmentsQueryOptions = () =>
  queryOptions({
    queryKey: ["my-enrollments"],
    queryFn: async () => {
      const userId = await currentUserId();
      if (!userId) return [] as string[];
      const { data, error } = await supabase
        .from("enrollments")
        .select("class_id")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).map((r) => r.class_id);
    },
  });

export const dashboardClassesQueryOptions = (enrolledIds: string[]) =>
  queryOptions({
    queryKey: ["classes", enrolledIds],
    queryFn: async () => {
      if (enrolledIds.length === 0) return [];
      const { data, error } = await supabase
        .from("classes")
        .select("id, subject, professor, code, term")
        .in("id", enrolledIds)
        .order("subject");
      if (error) throw error;

      // Only this student's own notes (reviewers can read more via RLS, so filter explicitly).
      const userId = await currentUserId();
      const { data: myNotes, error: notesError } = await supabase
        .from("notes")
        .select("class_id, content, summary, updated_at")
        .eq("user_id", userId!)
        .in("class_id", enrolledIds)
        .order("updated_at", { ascending: false });
      if (notesError) throw notesError;
      const noteByClass = new Map<string, NonNullable<typeof myNotes>[number]>();
      for (const n of myNotes ?? [])
        if (!noteByClass.has(n.class_id)) noteByClass.set(n.class_id, n);

      return (data ?? []).map((c) => ({ ...c, myNote: noteByClass.get(c.id) ?? null }));
    },
  });

/** Starts loading what the class page needs first; resolves when ready or after ~300 ms. */
export function preloadClass(queryClient: QueryClient, classId: string): Promise<void> {
  return waitAtMost(
    Promise.all([
      queryClient.ensureQueryData(classQueryOptions(classId)),
      queryClient.ensureQueryData(myNoteQueryOptions(classId)),
    ]),
  );
}

/** Starts loading the dashboard's class cards; resolves when ready or after ~300 ms. */
export function preloadDashboard(queryClient: QueryClient): Promise<void> {
  return waitAtMost(
    Promise.all([
      queryClient.ensureQueryData(dashboardProfileQueryOptions()),
      queryClient
        .ensureQueryData(myEnrollmentsQueryOptions())
        .then((ids) => queryClient.ensureQueryData(dashboardClassesQueryOptions(ids))),
    ]),
  );
}
