import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useRoles } from "@/hooks/useRoles";
import { GraduationCap, Home, LogOut, ShieldCheck, BadgeCheck, User, University } from "lucide-react";
import { ReactNode } from "react";
import { useUniversityTheme } from "@/hooks/useUniversityTheme";

type AuthenticatedHeaderProps = {
  trailing?: ReactNode;
};

export function AuthenticatedHeader({ trailing }: AuthenticatedHeaderProps) {
  const navigate = useNavigate();
  const { isAdmin, isFaculty } = useRoles();
  const uniTheme = useUniversityTheme();

  const { data: me } = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, university_id, universities(id, name)")
        .eq("id", userId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const universityName =
    me && Array.isArray(me.universities) && me.universities.length > 0
      ? me.universities[0].name
      : (me?.universities as { name?: string } | null)?.name ?? "";

  return (
    <header className="border-b border-border/70">
      <div className="h-1 w-full" style={{ backgroundImage: uniTheme.gradient }} />
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" style={{ color: uniTheme.primary }} />
            <span className="font-display text-xl">LectureLoop</span>
          </Link>

          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <Home className="mr-2 h-4 w-4" /> Home
            </Link>
          </Button>
        </div>

        <div className="flex items-center gap-1">
          {me?.full_name && (
            <div className="hidden items-center gap-3 text-sm text-muted-foreground sm:flex">
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                {me.full_name}
              </span>
              {universityName && (
                <span
                  className="flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-foreground"
                  style={{ backgroundImage: uniTheme.softGradient }}
                >
                  <University className="h-3.5 w-3.5" style={{ color: uniTheme.accent }} />
                  {universityName}
                </span>
              )}
            </div>
          )}

          {isAdmin && (
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin">
                <ShieldCheck className="mr-2 h-4 w-4" /> Admin
              </Link>
            </Button>
          )}
          {(isFaculty || isAdmin) && (
            <Button variant="ghost" size="sm" asChild>
              <Link to="/faculty">
                <BadgeCheck className="mr-2 h-4 w-4" /> Faculty
              </Link>
            </Button>
          )}
          {trailing}
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
