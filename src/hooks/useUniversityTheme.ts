import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type UniversityTheme = {
  name: string;
  primary: string;
  accent: string;
};

const FALLBACK: UniversityTheme = {
  name: "",
  primary: "#3f4a7e",
  accent: "#c2703d",
};

/**
 * Loads the signed-in user's university brand colors and exposes them as
 * CSS variables (--uni-primary / --uni-accent) on the document root.
 */
export function useUniversityTheme() {
  const { data } = useQuery({
    queryKey: ["my-university-theme"],
    queryFn: async (): Promise<UniversityTheme | null> => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return null;
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("universities(name, primary_color, accent_color)")
        .eq("id", userId)
        .single();
      if (error) throw error;
      const uni = (Array.isArray(profile?.universities)
        ? profile?.universities[0]
        : profile?.universities) as
        | { name: string; primary_color: string; accent_color: string }
        | null
        | undefined;
      if (!uni) return null;
      return {
        name: uni.name,
        primary: uni.primary_color,
        accent: uni.accent_color,
      };
    },
  });

  const theme = data ?? FALLBACK;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--uni-primary", theme.primary);
    root.style.setProperty("--uni-accent", theme.accent);
  }, [theme.primary, theme.accent]);

  return {
    ...theme,
    gradient: `linear-gradient(90deg, ${theme.primary} 0%, ${theme.accent} 100%)`,
    softGradient: `linear-gradient(120deg, ${theme.primary}1f 0%, ${theme.accent}1f 100%)`,
  };
}
