import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthenticatedHeader } from "@/components/AuthenticatedHeader";
import { CONTACT_EMAIL, SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";

const LAST_UPDATED = "November 12, 2026";

export const Route = createFileRoute("/privacy")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Privacy Policy | LectureLoop" },
      {
        name: "description",
        content: "How LectureLoop collects, uses and protects your information.",
      },
      { property: "og:title", content: "Privacy Policy | LectureLoop" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: PrivacyPage,
});

const sections: { id: string; title: string; body: string[] }[] = [
  {
    id: "collect",
    title: "What we collect",
    body: [
      "Account details: your name, your NYU email address (@nyu.edu or @stern.nyu.edu) and your university. If you sign in with Google, we receive your name, email address and profile picture from Google. If you use a password, it is stored only as a secure hash.",
      "Content you create: class notes, handwritten pages (the images and their text), lecture slides you upload, slide bookmarks and comments, lecture transcripts, your AI summaries, and feedback you send us.",
      "Lecture audio: when you use the Transcribe tab we store only the resulting text. Audio recordings are never saved.",
      "Class activity: the classes you join or create, and your role (student or admin).",
      "On your device: your browser keeps small preferences (such as the notes/slides split) and an unsaved transcript draft, so a reload doesn't lose a lecture. These stay in your browser.",
    ],
  },
  {
    id: "use",
    title: "How we use it",
    body: [
      "To run LectureLoop: sign you in, show your classes and notes, and let you upload and view lecture slides.",
      'To power the AI features you choose to use: when you press "Summarize my notes", your notes for that class are sent to an AI model and the summary is saved with your notes. Handwritten pages are sent to be turned into text, slide headlines are sent to create slide overviews, and in AI transcription mode short chunks of lecture audio are sent to be transcribed.',
      "We do not use your content to train AI models, and we do not sell it or use it for advertising.",
    ],
  },
  {
    id: "who-sees",
    title: "Who can see your content",
    body: [
      "Your notes, handwriting, transcripts and summaries are private: other students cannot see them.",
      "LectureLoop admins can manage accounts and classes. To do this they can see account details, class lists, and a short preview (the first line or so) of notes, for moderation and support. Admins cannot edit your notes.",
    ],
  },
  {
    id: "providers",
    title: "Service providers",
    body: [
      "We use service providers to operate the app, and they process data only to provide their service: Supabase (database, sign-in and file storage), Vercel (web hosting), Google Gemini (summaries, handwriting, slide overviews and AI transcription) and, when enabled, Groq (Whisper speech-to-text for AI transcription).",
      "In Live transcription mode, speech recognition is performed by your browser's built-in service (for example Google in Chrome, or Apple in Safari) under that browser's privacy terms.",
    ],
  },
  {
    id: "google",
    title: "Google user data",
    body: [
      "If you sign in with Google, we use your Google account information only to create and identify your LectureLoop account. We do not request access to your Gmail, Drive or other Google services, and we do not transfer Google user data to third parties except the service providers listed above as needed to run the app.",
    ],
  },
  {
    id: "delete",
    title: "Keeping and deleting your data",
    body: [
      "We keep your account and content while your account is active.",
      'You can delete your notes, slides, bookmarks and transcripts in the app at any time. Removing a class from your dashboard with "also delete my data" deletes everything you created for that class.',
      `To delete your account and all associated data, email ${CONTACT_EMAIL} from the address on your account. We will complete the request within 30 days.`,
    ],
  },
  {
    id: "security",
    title: "Security",
    body: [
      "Data is sent over HTTPS, files are stored in private storage, and database access rules limit each person to the data they are allowed to see. No system is perfectly secure, so please use a strong, unique password.",
    ],
  },
  {
    id: "contact",
    title: "Changes and contact",
    body: [
      "If we change this policy we will update the date at the top of this page and, for significant changes, tell you in the app.",
      `Questions or requests? Contact ${CONTACT_EMAIL}.`,
    ],
  },
];

function PrivacyPage() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {signedIn ? (
        <AuthenticatedHeader />
      ) : (
        <header className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-4 py-6 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            <span className="font-display text-xl">LectureLoop</span>
          </Link>
          <Button asChild variant="outline" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </header>
      )}

      <main className="mx-auto w-full max-w-[1600px] px-4 py-10 sm:px-6 sm:py-14">
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
            <h1 className="text-4xl">Privacy Policy</h1>
            <p className="mt-2 text-sm text-muted-foreground">Last updated {LAST_UPDATED}</p>
            <p className="mt-6 text-muted-foreground">
              LectureLoop is a personal class-notes app for NYU students: you take your own notes
              next to the lecture slides and get an AI summary of what you wrote. This page explains
              what information we collect, how we use it, and the choices you have.
            </p>

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
