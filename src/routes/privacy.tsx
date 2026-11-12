import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";

const CONTACT_EMAIL = "lalit.dev.jakher@nyu.edu";
const LAST_UPDATED = "November 11, 2026";

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

const sections: { title: string; body: string[] }[] = [
  {
    title: "What we collect",
    body: [
      "Account details: your email address, name and the university you choose. If you sign in with Google, we receive your name, email address and profile picture from Google. If you use a password, it is stored only as a secure hash.",
      "Content you create: class notes, handwritten pages (images and their transcriptions), lecture slides you upload, slide bookmarks and comments, and feedback you send us.",
      "Class activity: the classes you join or create and your role (student, faculty or admin).",
    ],
  },
  {
    title: "How we use it",
    body: [
      "To run LectureLoop: sign you in, show your notes and classes, and let you upload and view lecture slides.",
      "To create your personal summaries: when you ask for a summary, your notes for that class are sent to an AI model, and the summary is saved with your notes for only you to see. Handwritten pages are sent to an AI model to be transcribed into text, and slide headlines are sent to create slide overviews.",
      "To run the service: admins can see class lists and note activity in order to manage accounts and classes.",
    ],
  },
  {
    title: "Who we share it with",
    body: [
      "We do not sell your information or use it for advertising.",
      "We use service providers to operate the app: Supabase (database, sign-in and file storage), Vercel (web hosting) and an AI provider (Google Gemini or OpenAI) that processes note text and handwriting images to produce summaries and transcriptions. They process data only to provide these services.",
      "Your notes, handwriting and summaries are private to you: other students and faculty cannot see them. Platform admins can see class lists and note activity in order to run and moderate the service.",
    ],
  },
  {
    title: "Google user data",
    body: [
      "If you sign in with Google, we use your Google account information only to create and identify your LectureLoop account. We do not request access to your Gmail, Drive or other Google services, and we do not transfer Google user data to third parties except the service providers listed above as needed to run the app.",
    ],
  },
  {
    title: "Keeping and deleting your data",
    body: [
      "We keep your account and content while your account is active. You can delete your notes in the app at any time.",
      `To delete your account and all associated data, email ${CONTACT_EMAIL} from the address on your account. We will complete the request within 30 days.`,
    ],
  },
  {
    title: "Security",
    body: [
      "Data is sent over HTTPS, and database access rules limit each user to the data they are allowed to see. No system is perfectly secure, so please use a strong, unique password.",
    ],
  },
  {
    title: "Changes and contact",
    body: [
      "If we change this policy we will update the date at the top of this page.",
      `Questions? Contact ${CONTACT_EMAIL}.`,
    ],
  },
];

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-6 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          <span className="font-display text-xl">LectureLoop</span>
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <article className="surface-paper rounded-2xl p-8 md:p-12">
          <h1 className="text-4xl">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated {LAST_UPDATED}</p>
          <p className="mt-6 text-muted-foreground">
            LectureLoop is a collaborative class-notes app. This page explains what information we
            collect, how we use it, and the choices you have.
          </p>

          {sections.map((section) => (
            <section key={section.title} className="mt-10">
              <h2 className="text-2xl">{section.title}</h2>
              <div className="mt-3 space-y-3 text-muted-foreground">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </article>
      </main>
    </div>
  );
}
