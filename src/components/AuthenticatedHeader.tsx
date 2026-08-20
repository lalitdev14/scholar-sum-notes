import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useRoles } from "@/hooks/useRoles";
import {
  GraduationCap,
  Home,
  LogOut,
  ShieldCheck,
  BadgeCheck,
  User,
  University,
  MessageSquarePlus,
  Menu,
} from "lucide-react";
import { ReactNode, useState } from "react";
import { useUniversityTheme } from "@/hooks/useUniversityTheme";

type AuthenticatedHeaderProps = {
  trailing?: ReactNode;
};

export function AuthenticatedHeader({ trailing }: AuthenticatedHeaderProps) {
  const navigate = useNavigate();
  const { isAdmin, isFaculty } = useRoles();
  const uniTheme = useUniversityTheme();
  const [menuOpen, setMenuOpen] = useState(false);

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

  const navLinks = (
    <>
      <Button variant="ghost" size="sm" asChild className="text-white hover:bg-white/10">
        <Link to="/" onClick={() => setMenuOpen(false)}>
          <Home className="mr-2 h-4 w-4" /> Home
        </Link>
      </Button>
      <Button variant="ghost" size="sm" asChild className="text-white hover:bg-white/10">
        <Link to="/about" onClick={() => setMenuOpen(false)}>
          About
        </Link>
      </Button>
      <Button variant="ghost" size="sm" asChild className="text-white hover:bg-white/10">
        <Link to="/feedback" onClick={() => setMenuOpen(false)}>
          <MessageSquarePlus className="mr-2 h-4 w-4" /> Feedback
        </Link>
      </Button>
      {isAdmin && (
        <Button variant="ghost" size="sm" asChild className="text-white hover:bg-white/10">
          <Link to="/admin" onClick={() => setMenuOpen(false)}>
            <ShieldCheck className="mr-2 h-4 w-4" /> Admin
          </Link>
        </Button>
      )}
      {(isFaculty || isAdmin) && (
        <Button variant="ghost" size="sm" asChild className="text-white hover:bg-white/10">
          <Link to="/faculty" onClick={() => setMenuOpen(false)}>
            <BadgeCheck className="mr-2 h-4 w-4" /> Faculty
          </Link>
        </Button>
      )}
    </>
  );

  return (
    <header className="border-b border-black/10" style={{ backgroundColor: uniTheme.primary, color: "#fff" }}>
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 sm:px-6 sm:py-5 lg:flex lg:justify-between">
        <div className="flex min-w-0 items-center gap-4 lg:gap-6">
          <Link to="/dashboard" className="flex min-w-0 items-center gap-2" style={{ color: "#fff" }}>
            <GraduationCap className="h-5 w-5 shrink-0" style={{ color: "#fff" }} />
            <span className="truncate font-display text-lg font-bold sm:text-xl">LectureLoop</span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">{navLinks}</nav>
        </div>

        <div className="flex items-center justify-end gap-1">
          {me?.full_name && (
            <div className="hidden items-center gap-3 text-sm text-white/90 xl:flex">
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[10rem] truncate">{me.full_name}</span>
              </span>
              {universityName && (
                <span
                  className="flex items-center gap-1.5 rounded-full border border-white/30 px-2.5 py-1 text-white"
                  style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                >
                  <University className="h-3.5 w-3.5 shrink-0" style={{ color: "#fff" }} />
                  <span className="max-w-[12rem] truncate">{universityName}</span>
                </span>
              )}
            </div>
          )}

          {trailing}

          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="hidden text-white hover:bg-white/10 lg:inline-flex"
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open menu"
                className="text-white hover:bg-white/10 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] max-w-xs p-0">
              <div
                className="px-5 py-5 text-white"
                style={{ backgroundColor: uniTheme.primary }}
              >
                <p className="font-display text-lg font-bold">LectureLoop</p>
                {me?.full_name && <p className="mt-1 truncate text-sm text-white/90">{me.full_name}</p>}
                {universityName && (
                  <p className="mt-0.5 truncate text-xs text-white/75">{universityName}</p>
                )}
              </div>
              <div
                className="flex flex-col items-stretch gap-1 p-3 [&_a]:justify-start [&_button]:justify-start"
                style={{ backgroundColor: uniTheme.primary }}
              >
                {navLinks}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMenuOpen(false);
                    signOut();
                  }}
                  className="justify-start text-white hover:bg-white/10"
                >
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </Button>
              </div>
              <div className="h-full" style={{ backgroundColor: uniTheme.primary }} />
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
