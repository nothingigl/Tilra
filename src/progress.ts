import { z } from "zod";
import { objective, type Lesson } from "./model";
const attemptSchema = z.object({
  exerciseId: z.string(),
  correct: z.boolean().nullable(),
  answer: z.string(),
  assisted: z.boolean(),
  at: z.number(),
});
export type Attempt = z.infer<typeof attemptSchema>;
const resultSchema = z.object({
  lessonId: z.string(),
  at: z.number(),
  attempts: z.array(attemptSchema),
});
export type Result = z.infer<typeof resultSchema>;
const cardSchema = z.object({
  id: z.string(),
  kind: z.enum(["word", "error"]),
  lessonId: z.string(),
  itemId: z.string(),
  due: z.number(),
  streak: z.number().int().nonnegative(),
  reviews: z.number().int().nonnegative(),
  last: z.number(),
});
export type ReviewCard = z.infer<typeof cardSchema>;
const sessionSchema = z.object({
  lessonId: z.string(),
  attempts: z.array(attemptSchema),
  step: z.number().int().nonnegative(),
});
export const progressSchema = z.object({
  version: z.literal(1),
  courseId: z.string(),
  dailyGoal: z.number().min(5).max(60),
  results: z.array(resultSchema),
  cards: z.record(cardSchema),
  session: sessionSchema.nullable(),
  drafts: z.record(sessionSchema).default({}),
});
export type Progress = z.infer<typeof progressSchema>;
export const KEY = "tilra.progress.v1";
export const fresh = (): Progress => ({
  version: 1,
  courseId: "english",
  dailyGoal: 15,
  results: [],
  cards: {},
  session: null,
  drafts: {},
});
export function loadProgress(storage: Pick<Storage, "getItem">): {
  data: Progress;
  error: string;
} {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { data: fresh(), error: "" };
    const parsed = progressSchema.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return {
        data: fresh(),
        error:
          "Сохранённый прогресс имеет неизвестный формат. Исходные данные не перезаписаны. Выгрузите их в настройках перед восстановлением.",
      };
    return { data: parsed.data, error: "" };
  } catch {
    return {
      data: fresh(),
      error:
        "Не удалось прочитать прогресс. Доступ к хранилищу браузера ограничен или файл повреждён.",
    };
  }
}
export function saveProgress(
  storage: Pick<Storage, "setItem">,
  data: Progress,
) {
  try {
    storage.setItem(KEY, JSON.stringify(progressSchema.parse(data)));
    return "";
  } catch {
    return "Не удалось сохранить прогресс. Проверьте свободное место и разрешения браузера. Выгрузите резервную копию в настройках.";
  }
}
export const DAY = 86_400_000;
export const score = (r: Result) => {
  const scored = r.attempts.filter((a) => a.correct !== null && !a.assisted);
  return {
    correct: scored.filter((a) => a.correct).length,
    total: scored.length,
  };
};
export const passed = (r: Result) => {
  const s = score(r);
  return s.total >= 4 && s.correct / s.total >= 0.8;
};
export const hasPracticed = (p: Progress, id: string) =>
  p.results.some((r) => r.lessonId === id);
export const hasPassed = (p: Progress, id: string) =>
  p.results.some((r) => r.lessonId === id && passed(r));
export const dueCards = (p: Progress, now = Date.now()) =>
  Object.values(p.cards)
    .filter((c) => c.due <= now)
    .sort((a, b) => a.due - b.due);
export function finishLesson(
  p: Progress,
  l: Lesson,
  attempts: Attempt[],
  now = Date.now(),
): Progress {
  const result: Result = { lessonId: l.id, at: now, attempts };
  const cards = { ...p.cards };
  for (const w of l.words) {
    const id = `word:${l.id}:${w.id}`;
    cards[id] ??= {
      id,
      kind: "word",
      lessonId: l.id,
      itemId: w.id,
      due: now + DAY,
      streak: 0,
      reviews: 0,
      last: now,
    };
  }
  for (const a of attempts) {
    if (a.correct === false || a.assisted) {
      const id = `error:${l.id}:${a.exerciseId}`;
      cards[id] = {
        id,
        kind: "error",
        lessonId: l.id,
        itemId: a.exerciseId,
        due: now,
        streak: 0,
        reviews: cards[id]?.reviews ?? 0,
        last: now,
      };
    }
  }
  const drafts = { ...p.drafts };
  delete drafts[l.id];
  return {
    ...p,
    results: [...p.results, result],
    cards,
    session: null,
    drafts,
  };
}
export function reviewCard(
  card: ReviewCard,
  correct: boolean,
  now = Date.now(),
): ReviewCard {
  const streak = correct ? card.streak + 1 : 0;
  const days = [0, 1, 3, 7, 14, 30];
  return {
    ...card,
    streak,
    reviews: card.reviews + 1,
    last: now,
    due: now + (correct ? days[Math.min(streak, 5)] * DAY : 10 * 60_000),
  };
}
export function skillSummary(p: Progress, l: Lesson) {
  return [...new Set(l.exercises.filter(objective).map((e) => e.skill))].map(
    (skill) => {
      const ids = l.exercises
        .filter((e) => e.skill === skill && objective(e))
        .map((e) => e.id);
      const observations = p.results
        .filter((r) => r.lessonId === l.id)
        .flatMap((r) => r.attempts)
        .filter((a) => ids.includes(a.exerciseId) && !a.assisted);
      const correct = new Set(
        observations.filter((a) => a.correct).map((a) => a.exerciseId),
      ).size;
      const reviewed = Object.values(p.cards).filter(
        (c) =>
          c.lessonId === l.id &&
          c.kind === "error" &&
          ids.includes(c.itemId) &&
          c.streak > 0,
      ).length;
      return {
        skill,
        correct,
        total: ids.length,
        label:
          correct === ids.length && ids.length >= 2
            ? "Нужна отсроченная проверка"
            : correct > 0 || reviewed > 0
              ? "Закрепляется"
              : "Нужна практика",
      };
    },
  );
}
