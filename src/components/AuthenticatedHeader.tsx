import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useRoles } from "@/hooks/useRoles";
import { ChevronDown, GraduationCap, LogOut, Menu, University } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReactNode, useState } from "react";
import { useUniversityTheme } from "@/hooks/useUniversityTheme";

type AuthenticatedHeaderProps = {
  trailing?: ReactNode;
};

export function AuthenticatedHeader({ trailing }: AuthenticatedHeaderProps) {
  const navigate = useNavigate();
  const { isAdmin } = useRoles();
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
      : ((me?.universities as { name?: string } | null)?.name ?? "");
  const isNyu = universityName === "New York University";

  const navItems: { to: string; label: string; exact?: boolean }[] = [
    { to: "/", label: "Home", exact: true },
    { to: "/notes", label: "My notes" },
    { to: "/plans", label: "Plans" },
    { to: "/about", label: "About" },
    { to: "/feedback", label: "Feedback" },
    ...(isAdmin ? [{ to: "/admin", label: "Admin" }] : []),
  ];
  const navLinks = (
    <>
      {navItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={() => setMenuOpen(false)}
          activeOptions={{ exact: !!item.exact }}
          className="inline-flex h-9 items-center rounded-lg px-3.5 text-[0.9rem] font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          activeProps={{ className: "bg-white/15 font-semibold text-white" }}
        >
          {item.label}
        </Link>
      ))}
    </>
  );
  const initial = (me?.full_name ?? "").trim().charAt(0).toUpperCase() || "?";

  return (
    <header
      className="border-b border-black/10"
      style={{ backgroundColor: uniTheme.primary, color: "#fff" }}
    >
      {/* Same container as every page (max-w-[100rem] px-4 sm:px-6) so the logo lines up with page content. */}
      <div className="mx-auto grid max-w-[100rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 sm:px-6 sm:py-5 md:flex md:justify-between lg:px-10 xl:px-16">
        <div className="flex min-w-0 items-center gap-4 md:gap-6">
          <Link
            to="/dashboard"
            className="flex min-w-0 items-center gap-2"
            style={{ color: "#fff" }}
          >
            <GraduationCap className="h-5 w-5 shrink-0" style={{ color: "#fff" }} />
            <span className="truncate font-display text-lg font-bold sm:text-xl">LectureLoop</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">{navLinks}</nav>
        </div>

        <div className="flex items-center justify-end gap-1">
          {/* Page-specific item (e.g. the class code) sits just before the university chip. */}
          {trailing && <span className="mr-1 flex shrink-0 items-center">{trailing}</span>}
          {universityName && (
            <span className="hidden items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold text-white lg:inline-flex">
              {isNyu ? (
                <img
                  src="/nyu-torch-white.png"
                  alt="NYU torch"
                  width={18}
                  height={18}
                  className="-my-0.5 h-[18px] w-[18px] shrink-0"
                />
              ) : (
                <University className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="max-w-[12rem] truncate">{universityName}</span>
            </span>
          )}
          {/* Always shown: signing out on desktop happens from this menu. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ml-2 hidden items-center gap-2 rounded-full border border-white/25 py-1 pl-1 pr-3 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:inline-flex"
                aria-label="Account menu"
              >
                <span
                  className="grid h-7 w-7 place-items-center rounded-full bg-white text-xs font-bold"
                  style={{ color: uniTheme.primary }}
                >
                  {initial}
                </span>
                <span className="max-w-[10rem] truncate">{me?.full_name || "Account"}</span>
                <ChevronDown className="h-4 w-4 opacity-80" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <span className="block truncate font-semibold">
                  {me?.full_name || "Your account"}
                </span>
                {universityName && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {universityName}
                  </span>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void signOut()}>
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open menu"
                className="text-white hover:bg-white/10 md:hidden"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[85vw] max-w-xs p-0 [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:opacity-100"
            >
              <div className="px-5 py-5 text-white" style={{ backgroundColor: uniTheme.primary }}>
                <p className="font-display text-lg font-bold">LectureLoop</p>
                {me?.full_name && (
                  <p className="mt-1 truncate text-sm text-white/90">{me.full_name}</p>
                )}
                {universityName && (
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-white/75">
                    {isNyu && (
                      <img
                        src="/nyu-torch-white.png"
                        alt=""
                        width={14}
                        height={14}
                        className="h-3.5 w-3.5"
                      />
                    )}
                    {universityName}
                  </p>
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
