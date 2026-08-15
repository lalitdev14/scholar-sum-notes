import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRoles() {
  const { data, isPending } = useQuery({
    queryKey: ["my-roles"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return [] as string[];
      const { data: rows, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error) throw error;
      return (rows ?? []).map((r) => r.role as string);
    },
  });

  const roles = data ?? [];
  return {
    roles,
    isAdmin: roles.includes("admin"),
    isFaculty: roles.includes("faculty"),
    isReviewer: roles.includes("faculty") || roles.includes("admin"),
    isPending,
  };
}
