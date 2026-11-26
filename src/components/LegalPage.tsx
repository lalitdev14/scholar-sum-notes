import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthenticatedHeader } from "@/components/AuthenticatedHeader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";

export type LegalSection = { id: string; title: string; body: string[] };

/** Layout shared by the Privacy Policy and Terms of Use pages. */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {signedIn ? (
        <AuthenticatedHeader />
      ) : (
        <header className="mx-auto flex w-full max-w-[100rem] items-center justify-between px-4 py-6 sm:px-6 lg:px-10 xl:px-16">
          <Link to="/" className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            <span className="font-display text-xl">LectureLoop</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle className="text-foreground hover:bg-muted focus-visible:outline-ring" />
            <Button asChild variant="outline" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        </header>
      )}

      <main className="mx-auto w-full max-w-[100rem] px-4 py-10 sm:px-6 sm:py-14 lg:px-10 xl:px-16">
        <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,48rem)]">
          {/* Contents: sticky on desktop */}
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                On this page
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <article className="surface-paper rounded-2xl p-6 sm:p-10">
            <h1 className="text-4xl">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
            <div className="mt-6 text-muted-foreground">{intro}</div>

            {sections.map((section) => (
              <section key={section.id} id={section.id} className="mt-10 scroll-mt-6">
                <h2 className="text-2xl">{section.title}</h2>
                <div className="mt-3 space-y-3 leading-relaxed text-muted-foreground">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </article>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
