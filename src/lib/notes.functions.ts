import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SaveNoteInput = z.object({
  classId: z.string().uuid(),
  noteId: z.string().uuid().nullable().optional(),
  content: z.string().min(1).max(20000),
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

const ClassInput = z.object({ classId: z.string().uuid() });

export const refreshClassSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ClassInput.parse(input))
  .handler(async ({ data, context }) => {


    const { data: klass, error: classError } = await context.supabase
      .from("classes")
      .select("id, subject, professor, code, term")
      .eq("id", data.classId)
      .single();
    if (classError || !klass) throw new Error("Class not found");

    // Every student's notes for this class feed the shared summary.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: notes, error: notesError } = await supabaseAdmin
      .from("notes")
      .select("content, created_at")
      .eq("class_id", data.classId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (notesError) throw new Error(notesError.message);

    const corpus = (notes ?? [])
      .map((n, i) => `--- Student note ${i + 1} ---\n${n.content}`)
      .join("\n\n")
      .slice(0, 60000);

    if (!corpus.trim()) throw new Error("No notes to summarize yet.");

    const { resolveTextModel } = await import("./ai-gateway.server");
    const { streamText, Output } = await import("ai");
    const model = resolveTextModel();

    const schema = z.object({
      summary: z.string(),
      key_points: z.array(z.string()),
    });

    const result = streamText({
      model,

      output: Output.object({ schema }),
      system:
        "You merge multiple students' raw class notes into ONE refined class summary. " +
        "STRICT RULE: never add facts, explanations, examples, definitions or context that are not " +
        "already present in the students' notes. Do not use outside knowledge. Only clean up, " +
        "reorganise, deduplicate and clarify what the students actually wrote. Resolve contradictions " +
        "by consensus among the notes; if something is unclear or missing, leave it out rather than " +
        "inventing it. Keep the students' own definitions, formulas and examples verbatim where possible. " +
        "Write clean markdown paragraphs for `summary` (no headings) and 4-8 crisp bullet strings for " +
        "`key_points`, each drawn directly from the notes.",
      prompt:
        `Class: ${klass.subject} (${klass.code}) — ${klass.professor}, ${klass.term}\n\n` +
        `Refine and merge ONLY the content below into a shared class summary. Add nothing new.\n\n${corpus}`,
    });

    let output: z.infer<typeof schema>;
    try {
      output = (await result.output) as z.infer<typeof schema>;
    } catch {
      throw new Error("The AI could not summarize these notes. Please try again.");
    }

    const { error: upsertError } = await supabaseAdmin.from("class_summaries").upsert({
      class_id: data.classId,
      summary: output.summary,
      key_points: output.key_points,
      notes_count: notes?.length ?? 0,
      updated_at: new Date().toISOString(),
    });
    if (upsertError) throw new Error(upsertError.message);

    return { summary: output.summary, key_points: output.key_points, notes_count: notes?.length ?? 0 };
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
            { type: "image", image: new URL(data.imageDataUrl) },
          ],
        },
      ],
    });

    return { text: (result.text ?? "").trim() };
  });
