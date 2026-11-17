import { createFileRoute, Link } from "@tanstack/react-router";
import { CONTACT_EMAIL } from "@/components/SiteFooter";
import { LegalPage, type LegalSection } from "@/components/LegalPage";

const LAST_UPDATED = "November 17, 2026";

export const Route = createFileRoute("/terms")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Terms of Use | LectureLoop" },
      { name: "description", content: "The rules for using LectureLoop." },
      { property: "og:title", content: "Terms of Use | LectureLoop" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: TermsPage,
});

const sections: LegalSection[] = [
  {
    id: "who",
    title: "Who can use LectureLoop",
    body: [
      "LectureLoop is for students with an NYU email address. You must be at least 18, or have permission from a parent or guardian, and you must give accurate information when you create your account.",
      "LectureLoop is an independent student project. It is not affiliated with, sponsored or endorsed by New York University. NYU's name is used only to describe who the app is for.",
    ],
  },
  {
    id: "account",
    title: "Your account",
    body: [
      "You are responsible for what happens under your account. Keep your password private and tell us right away if you think someone else has used your account.",
      "One account per person. Don't share your account or create accounts for other people.",
    ],
  },
  {
    id: "content",
    title: "Your notes and files",
    body: [
      "You own the notes, handwriting, transcripts and other content you create. You give LectureLoop permission to store, process and display that content only as needed to run the app for you, including sending it to the AI services described in the Privacy Policy when you use an AI feature.",
      "Only upload material you are allowed to use. Lecture slides and recordings usually belong to your professor or NYU: use them only for your own study, as your course and NYU's policies allow, and don't upload anything you have been told not to share or record.",
      "Recording a lecture may need your professor's permission. Ask first, and follow your class's rules on recording.",
    ],
  },
  {
    id: "integrity",
    title: "Academic integrity",
    body: [
      "LectureLoop is a study tool. Using it doesn't change your obligations under NYU's academic integrity policies. Don't use it to cheat, to submit AI-generated work as your own where that isn't allowed, or to share course material in ways your course forbids.",
    ],
  },
  {
    id: "ai",
    title: "AI features",
    body: [
      "Summaries, handwriting conversion, slide overviews and transcripts are produced by AI and can be incomplete or wrong. Check them against your notes and course materials before relying on them.",
      "AI features have usage limits that depend on your plan and may change. We may pause an AI feature when its provider is unavailable.",
    ],
  },
  {
    id: "plans",
    title: "Free and Pro plans",
    body: [
      "LectureLoop is free to use. The Free plan includes a limited number of AI summaries each week. A Pro plan with more AI summaries may be offered. Before you pay for anything, we will show you the price, what it includes and how to cancel.",
    ],
  },
  {
    id: "acceptable",
    title: "Acceptable use",
    body: [
      "Don't break the law or others' rights; upload malware; try to access other people's accounts or data; probe, overload or get around LectureLoop's security or usage limits; or scrape or copy the service. Don't post content that is harassing, hateful or sexually explicit in feedback or contact messages.",
    ],
  },
  {
    id: "third-party",
    title: "Other services",
    body: [
      "LectureLoop relies on service providers (listed in the Privacy Policy) and links to or shows other apps, such as PDF Studio in My notes. Those apps have their own terms and privacy policies, and we are not responsible for them.",
    ],
  },
  {
    id: "ending",
    title: "Ending your account",
    body: [
      `You can stop using LectureLoop at any time and ask us to delete your account by emailing ${CONTACT_EMAIL}.`,
      "We may suspend or close an account that breaks these terms or puts other students or the service at risk. Where we can, we'll tell you first and give you a chance to download your notes.",
    ],
  },
  {
    id: "warranty",
    title: "No guarantees",
    body: [
      "LectureLoop is provided as is, without warranties of any kind. We work to keep your notes safe and backed up, but we can't promise the service will always be available or error-free. Keep your own copy of anything important (you can export notes and download notebooks as PDF).",
      "To the extent the law allows, LectureLoop and the people who build it are not liable for indirect or consequential losses, or for lost data, grades or opportunities, arising from your use of the service.",
    ],
  },
  {
    id: "changes",
    title: "Changes and contact",
    body: [
      "We may update these terms. We'll change the date at the top of this page and, for significant changes, tell you in the app. If you keep using LectureLoop after a change, the new terms apply.",
      "These terms are governed by the laws of the State of New York.",
      `Questions? Use the contact form at lectureloop.org/contact or email ${CONTACT_EMAIL}.`,
    ],
  },
];

function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      updated={LAST_UPDATED}
      sections={sections}
      intro={
        <p>
          These terms explain the rules for using LectureLoop. By creating an account or using the
          app, you agree to them and to our{" "}
          <Link to="/privacy" className="underline">
            Privacy Policy
          </Link>
          . Please read them; they're written to be short and plain.
        </p>
      }
    />
  );
}
