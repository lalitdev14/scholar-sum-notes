import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { noteToPlainText } from "@/lib/note-format";

const SaveNoteInput = z.object({
  classId: z.string().uuid(),
  noteId: z.string().uuid().nullable().optional(),
  content: z.string().min(1).max(500_000),
});

export const saveNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveNoteInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.noteId) {
      const { data: row, error } = await supabase
        .from("notes")
        .update({ content: data.content })
        .eq("id", data.noteId)
        .eq("user_id", userId)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return { id: row.id };
    }

    const { data: row, error } = await supabase
      .from("notes")
      .insert({ class_id: data.classId, user_id: userId, content: data.content })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

const SummarizeInput = z.object({ classId: z.string().uuid() });

/**
 * Summarizes the signed-in student's OWN notes for a class. Runs with the
 * student's session (RLS), so it only ever reads and writes their own note.
 */
export const summarizeMyNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SummarizeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: klass, error: classError } = await supabase
      .from("classes")
      .select("subject, professor, code, term")
      .eq("id", data.classId)
      .single();
    if (classError || !klass) throw new Error("Class not found");

    const { data: note, error: noteError } = await supabase
      .from("notes")
      .select("id, content")
      .eq("class_id", data.classId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (noteError) throw new Error(noteError.message);

    const text = noteToPlainText(note?.content ?? "");
    if (!note || !text) throw new Error("Write and save some notes first.");

    const { resolveTextModel } = await import("./ai-gateway.server");
    const { generateText, Output } = await import("ai");

    const schema = z.object({
      summary: z.string(),
      key_points: z.array(z.string()),
    });

    let output: z.infer<typeof schema>;
    try {
      const result = await generateText({
        model: resolveTextModel(),
        output: Output.object({ schema }),
        system:
          "You turn one student's raw class notes into a comprehensive, well-organised study summary. " +
          "Cover EVERY topic, definition, formula, example and detail the student wrote; do not drop content. " +
          "Group related points under short section headings, explain each point clearly in full sentences, " +
          "fix typos and shorthand, and keep the student's own formulas and examples. " +
          "Do not add facts that are not in the notes. " +
          "Format `summary` using only this markup: lines starting with '## ' for section headings, " +
          "lines starting with '- ' for bullets, '**bold**' for key terms, and blank lines between paragraphs. " +
          "`key_points` is 4-10 short takeaways a student should remember for an exam.",
        prompt:
          `Class: ${klass.subject} (${klass.code}) — ${klass.professor}${klass.term ? ", " + klass.term : ""}\n\n` +
          `Student notes:\n${text.slice(0, 60000)}`,
      });
      output = result.output as z.infer<typeof schema>;
    } catch (err) {
      console.error("[summarizeMyNotes]", err);
      throw new Error("The AI could not summarize your notes. Please try again.");
    }

    const summary_updated_at = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("notes")
      .update({ summary: output.summary, key_points: output.key_points, summary_updated_at })
      .eq("id", note.id)
      .eq("user_id", userId);
    if (updateError) throw new Error(updateError.message);

    return { summary: output.summary, key_points: output.key_points, summary_updated_at };
  });

const TranscribeInput = z.object({
  imageDataUrl: z.string().startsWith("data:image/").max(12_000_000),
});

export const transcribeHandwriting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TranscribeInput.parse(input))
  .handler(async ({ data }) => {
    const { resolveTextModel } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");
    const model = resolveTextModel();

    const result = await generateText({
      model,

      system:
        "You transcribe handwritten class notes from an image. Return ONLY the transcribed text, " +
        "preserving line breaks, bullets, formulas and indentation. No commentary, no markdown fences. " +
        "If nothing is legible, return an empty string.",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe this handwriting." },
            { type: "file", data: new URL(data.imageDataUrl), mediaType: data.imageDataUrl.slice(5, data.imageDataUrl.indexOf(";")) },
          ],
        },
      ],
    });

    return { text: (result.text ?? "").trim() };
  });

const SlideOverviewInput = z.object({
  headline: z.string().trim().min(1).max(300),
  slideText: z.string().max(3000).optional().default(""),
});

export const slideOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SlideOverviewInput.parse(input))
  .handler(async ({ data }) => {
    const { resolveTextModel } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");
    const result = await generateText({
      model: resolveTextModel(),
      system:
        "You help a university student follow a lecture. Given a slide headline (and optionally the slide's text), " +
        "write a short, plain-language overview of the topic: 2-3 sentences, then up to 3 short bullet points with key ideas. " +
        "Under 110 words. Plain text only, bullets start with '• '. No headings, no markdown symbols.",
      prompt: `Slide headline: ${data.headline}\n\nSlide text:\n${data.slideText || "(none)"}`,
    });
    return { text: (result.text ?? "").trim() };
  });
