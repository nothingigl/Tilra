import { z } from "zod";

export const reviewSchema = z
  .object({
    status: z.enum(["draft", "reviewed"]),
    source: z.string().min(1),
    notes: z.string(),
    reviewer: z.string().optional(),
    reviewedAt: z.string().optional(),
  })
  .superRefine((v, c) => {
    if (v.status === "reviewed" && (!v.reviewer || !v.reviewedAt))
      c.addIssue({
        code: "custom",
        message: "Reviewed content requires a reviewer and review date",
      });
  });
const base = {
  id: z.string(),
  skill: z.string(),
  prompt: z.string(),
  explanation: z.string(),
};
export const exerciseSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("choice"),
    passage: z.string().optional(),
    options: z.array(z.string()).min(2),
    correct: z.number().int().nonnegative(),
  }),
  z.object({
    ...base,
    type: z.literal("input"),
    answers: z.array(z.string()).min(1),
    hint: z.string().optional(),
  }),
  z.object({
    ...base,
    type: z.literal("order"),
    tokens: z.array(z.string()).min(2),
    answer: z.string(),
  }),
  z.object({
    ...base,
    type: z.literal("listen"),
    text: z.string(),
    options: z.array(z.string()).min(2),
    correct: z.number().int().nonnegative(),
  }),
  z.object({
    ...base,
    type: z.literal("free"),
    sample: z.string(),
    checklist: z.array(z.string()).min(1),
  }),
  z.object({
    ...base,
    type: z.literal("speak"),
    text: z.string(),
    sample: z.string(),
    checklist: z.array(z.string()).min(1),
  }),
]);
export const lessonSchema = z
  .object({
    id: z.string(),
    courseId: z.string(),
    title: z.string(),
    subtitle: z.string(),
    level: z.enum(["A1", "A2"]),
    minutes: z.number(),
    prerequisites: z.array(z.string()),
    goal: z.string(),
    explanation: z.string(),
    examples: z.array(z.object({ text: z.string(), translation: z.string() })),
    review: reviewSchema,
    words: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        translation: z.string(),
        example: z.string(),
      }),
    ),
    exercises: z.array(exerciseSchema).min(6),
  })
  .superRefine((v, c) => {
    const ids = new Set<string>();
    for (const ex of v.exercises) {
      if (ids.has(ex.id))
        c.addIssue({ code: "custom", message: "Duplicate exercise ID" });
      ids.add(ex.id);
      if (
        (ex.type === "choice" || ex.type === "listen") &&
        ex.correct >= ex.options.length
      )
        c.addIssue({ code: "custom", message: "Answer index out of range" });
    }
  });
export type Exercise = z.infer<typeof exerciseSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export interface Course {
  id: string;
  title: string;
  short: string;
  language: "en" | "tr" | "ar";
  flag: string;
  kind: "modern" | "quran";
  description: string;
  goal: string;
  units: {
    title: string;
    description: string;
    lessonIds: string[];
    planned?: boolean;
    level: string;
  }[];
}
export const objective = (e: Exercise) =>
  e.type !== "free" && e.type !== "speak";
export function normalize(s: string, lang = "en") {
  return s
    .normalize("NFKC")
    .toLocaleLowerCase(lang)
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?؟،؛:;。]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
export function checkAnswer(e: Exercise, value: string, lang: string) {
  if (e.type === "choice" || e.type === "listen")
    return value === String(e.correct);
  if (e.type === "input")
    return e.answers.some((a) => normalize(a, lang) === normalize(value, lang));
  if (e.type === "order")
    return normalize(e.answer, lang) === normalize(value, lang);
  return null;
}
