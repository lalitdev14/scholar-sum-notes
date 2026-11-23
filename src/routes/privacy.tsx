import { createFileRoute, Link } from "@tanstack/react-router";
import { CONTACT_EMAIL } from "@/components/SiteFooter";
import { LegalPage, type LegalSection } from "@/components/LegalPage";

const LAST_UPDATED = "November 18, 2026";

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

const sections: LegalSection[] = [
  {
    id: "collect",
    title: "What we collect",
    body: [
      "Account details: your name, your NYU email address (@nyu.edu or @stern.nyu.edu) and your university. If you sign in with Google, we receive your name, email address and profile picture from Google. If you use a password, it is stored only as a secure hash.",
      "Content you create: class notes, handwritten pages (the images and their text), lecture slides you upload, slide bookmarks and comments, lecture transcripts, your AI summaries, and feedback you send us.",
      "Contact messages: if you use the contact form, we keep your name, email and message so we can reply.",
      'Lecture audio: when you use the Transcribe tab we store the resulting text. The audio itself is saved only if you turn on "Save the audio recording too" for that recording; it is kept in your private storage, and deleting the transcript deletes the audio.',
      "Class activity: the classes you join or create, and your role (student or admin).",
      "Plan and usage: whether you are on the Free or Pro plan, and how many AI features you used each day, so we can apply the plan limits.",
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
      "We send account emails (sign-up confirmation and password reset) through an email delivery service, which receives only your email address and the message.",
      "PDF Studio, the PDF tool shown inside My notes, is a separate app (pdfstudioapp.vercel.app). Files you add there are sent to PDF Studio's own server for processing and, as PDF Studio states, deleted automatically. LectureLoop does not send your notes to PDF Studio.",
      "When you upload a PowerPoint (.pptx) deck, the file is sent once to the PDF Studio server (run by the LectureLoop team) to make an exact PDF copy of the slides, which is saved with your deck in your own storage. PDF Studio does not keep the file: the converted result expires there after an hour.",
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
      `Questions or requests? Use the contact form at lectureloop.org/contact or email ${CONTACT_EMAIL}.`,
    ],
  },
];

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={LAST_UPDATED}
      sections={sections}
      intro={
        <p>
          LectureLoop is a personal class-notes app for NYU students: you take your own notes next
          to the lecture slides and get an AI summary of what you wrote. This page explains what
          information we collect, how we use it, and the choices you have. LectureLoop is an
          independent student project and is not affiliated with or endorsed by New York University.
          See also our{" "}
          <Link to="/terms" className="underline">
            Terms of Use
          </Link>
          .
        </p>
      }
    />
  );
}
