import { Link } from "@tanstack/react-router";
import { ArrowRight, AudioLines, FileDown, GraduationCap, PenLine } from "lucide-react";
import { INK, INK_PANEL, SOFT_GREY, VIOLET, VIOLET_TEXT, grotesk } from "@/lib/bold-theme";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * The public landing page (signed-out visitors): bold and modern. High contrast, big tight
 * headings, rounded white blocks on soft grey, electric violet for actions. It has its own
 * palette (src/theme.css) with light and dark values.
 */

const steps = [
  {
    title: "Pick your class",
    body: "Join the subject you're sitting in, with the professor and class code attached.",
  },
  {
    title: "Take notes your way",
    body: "Type, write with a pen next to the slides, or record the lecture. Your notes are private to you.",
  },
  {
    title: "Get your summary",
    body: "One click turns what you wrote into a clear, organised summary for revision.",
  },
  {
    title: "Review anytime",
    body: "Notes, summaries, handwriting, transcripts and slides stay together, class by class.",
  },
];

const features = [
  {
    icon: PenLine,
    title: "Handwriting next to the slides",
    body: "Write on each slide or in a notebook with an Apple Pencil or stylus, and turn it into text.",
  },
  {
    icon: AudioLines,
    title: "Lecture transcripts, fixed from the audio",
    body: "Record the lecture. After you save, LectureLoop listens again and corrects the transcript by topic.",
  },
  {
    icon: FileDown,
    title: "Export to Word or PDF",
    body: "Download your notes, summary, handwriting or a transcript whenever you need them.",
  },
];

const pill =
  "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2";

export function LandingHeader() {
  return (
    <header data-public-home style={{ backgroundColor: INK_PANEL }} className="text-white">
      <div className="mx-auto flex w-full max-w-[100rem] items-center justify-between gap-2 px-4 py-4 sm:gap-4 sm:px-6 lg:px-10 xl:px-16">
        <Link to="/" className="flex items-center gap-2.5" aria-label="LectureLoop home">
          <GraduationCap
            className="h-5 w-5 shrink-0"
            style={{ color: "#fff" }}
            aria-hidden="true"
          />
          <span className="text-xl font-bold tracking-tight" style={grotesk}>
            LectureLoop
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-3">
          <ThemeToggle className="h-8 w-8 sm:h-9 sm:w-9 text-white/85 hover:bg-white/10 hover:text-white focus-visible:outline-white" />
          <a
            href="#how"
            className="hidden rounded-full px-4 py-2 text-sm font-medium text-white/70 hover:text-white sm:inline-flex"
          >
            How it works
          </a>
          <Link
            to="/auth"
            className="whitespace-nowrap rounded-full px-2 py-2 text-sm font-semibold text-white/85 hover:text-white sm:px-4"
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-5"
            style={{ backgroundColor: VIOLET, outlineColor: VIOLET }}
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function LandingMain() {
  return (
    <main data-public-home className="flex-1" style={{ backgroundColor: SOFT_GREY, color: INK }}>
      {/* Hero */}
      <section className="mx-auto grid w-full max-w-[100rem] items-center gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:px-10 xl:px-16">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full bg-bold-block px-3 py-1.5 text-xs font-semibold shadow-sm">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: VIOLET }} />
            For NYU students
          </span>
          <h1
            className="mt-6 text-bold-ink text-[2.75rem] font-bold leading-[0.98] tracking-[-0.035em] text-balance sm:text-7xl xl:text-[5.5rem]"
            style={grotesk}
          >
            Your notes, <span style={{ color: VIOLET_TEXT }}>summarized</span> for you.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-bold-text">
            Take your own notes in class, typed or handwritten next to the lecture slides. Then get
            a clear AI summary of everything you wrote, ready for revision.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              to="/auth"
              className={`${pill} text-white shadow-[0_10px_30px_-10px_rgba(109,74,255,0.8)] hover:brightness-110`}
              style={{ backgroundColor: VIOLET, outlineColor: VIOLET }}
            >
              Start taking notes <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#how"
              className={`${pill} border-2 bg-bold-block hover:bg-bold-hover`}
              style={{ borderColor: INK, outlineColor: INK }}
            >
              See how it works
            </a>
          </div>
          <p className="mt-5 text-sm font-medium text-bold-muted">
            Free to start · sign in with your NYU email
          </p>
        </div>

        <ProductPreview />
      </section>

      {/* How it works */}
      <section
        id="how"
        className="mx-auto w-full max-w-[100rem] scroll-mt-6 px-4 pb-20 sm:px-6 lg:px-10 xl:px-16"
      >
        <h2
          className="text-4xl font-bold tracking-[-0.03em] text-balance text-bold-ink sm:text-5xl"
          style={grotesk}
        >
          How it works
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="flex flex-col gap-3 rounded-[1.25rem] bg-bold-block p-6"
            >
              <span
                className="grid h-9 w-9 place-items-center rounded-full bg-bold-ink text-sm font-bold text-bold-on-ink"
                style={grotesk}
              >
                {i + 1}
              </span>
              <h3 className="text-xl font-bold tracking-tight text-bold-ink" style={grotesk}>
                {step.title}
              </h3>
              <p className="text-[0.95rem] leading-relaxed text-bold-text">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-[100rem] px-4 pb-20 sm:px-6 lg:px-10 xl:px-16">
        <div
          className="grid gap-10 rounded-[1.75rem] p-8 text-white sm:p-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
          style={{ backgroundColor: INK_PANEL }}
        >
          <h2
            className="text-4xl font-bold leading-[1.02] tracking-[-0.03em] text-balance text-white sm:text-5xl"
            style={grotesk}
          >
            Everything from class, in one place.
          </h2>
          <ul className="grid gap-6 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {features.map((f) => (
              <li key={f.title} className="flex flex-col gap-3">
                <span
                  className="grid h-10 w-10 place-items-center rounded-xl"
                  style={{ backgroundColor: VIOLET }}
                >
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="text-lg font-bold tracking-tight text-white" style={grotesk}>
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed text-white/70">{f.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Final call to action */}
      <section className="mx-auto w-full max-w-[100rem] px-4 pb-24 sm:px-6 lg:px-10 xl:px-16">
        <div
          className="flex flex-col items-start justify-between gap-6 rounded-[1.75rem] p-8 text-white sm:flex-row sm:items-center sm:p-12"
          style={{ backgroundColor: VIOLET }}
        >
          <div className="min-w-0">
            <h2
              className="text-3xl font-bold tracking-[-0.03em] text-balance text-white sm:text-4xl"
              style={grotesk}
            >
              Your next lecture, sorted.
            </h2>
            <p className="mt-2 text-white/80">
              Free includes 3 AI summaries a week. No card needed.
            </p>
          </div>
          <Link
            to="/auth"
            className={`${pill} shrink-0 bg-white text-[#0d0d12] hover:bg-[#ececea]`}
            style={{ outlineColor: "#fff" }}
          >
            Create your account <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}

/** A small, static picture of the class workspace (decorative). */
function ProductPreview() {
  return (
    <div className="min-w-0" aria-hidden="true">
      <div className="rounded-[1.5rem] bg-bold-block p-5 shadow-[0_30px_80px_-40px_rgba(13,13,18,0.45)] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-bold-muted">CS-221 · Fall 2026</p>
            <p className="truncate text-2xl font-bold tracking-tight" style={grotesk}>
              Data Structures
            </p>
          </div>
          <span
            className="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white"
            style={{ backgroundColor: VIOLET }}
          >
            Summarize
          </span>
        </div>
        <div className="mt-4 flex gap-1.5 text-xs font-semibold">
          <span className="rounded-full px-3 py-1.5 text-bold-subtle">Type</span>
          <span className="rounded-full px-3 py-1.5 text-bold-subtle">Handwrite</span>
          <span className="rounded-full bg-bold-ink px-3 py-1.5 text-bold-on-ink">Transcribe</span>
        </div>
        <div className="mt-4 rounded-2xl bg-bold-page p-4">
          <p className="text-sm font-semibold">
            Lecture 9: Quicksort
            <span className="ml-2 rounded-full bg-[#d6ff5c] px-2 py-0.5 text-[11px] font-bold text-[#0d0d12]">
              Improved
            </span>
          </p>
          <p className="mt-0.5 text-xs text-bold-muted">42 min · 6,120 words</p>
          <p className="mt-3 text-base font-bold" style={grotesk}>
            Choosing a pivot
          </p>
          <p className="mt-1 text-sm leading-relaxed text-bold-body">
            A bad pivot, like the smallest value every time, makes quicksort run in quadratic time,
            so we usually take the median of three.
          </p>
        </div>
      </div>
      <div
        className="relative -mt-4 ml-auto mr-4 w-64 max-w-[85%] rounded-2xl p-4 text-white shadow-xl sm:mr-8"
        style={{ backgroundColor: INK_PANEL }}
      >
        <p className="text-xs font-semibold text-white/60">AI summary</p>
        <p className="mt-1 text-sm leading-snug">
          Quicksort averages O(n log n). Pivot choice decides the worst case.
        </p>
      </div>
    </div>
  );
}
