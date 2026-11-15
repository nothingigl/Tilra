import { describe, it, expect } from "vitest";
import { lessons, courses } from "../src/content";
import { checkAnswer, normalize, lessonSchema } from "../src/model";
import {
  fresh,
  finishLesson,
  score,
  passed,
  dueCards,
  reviewCard,
  DAY,
  loadProgress,
  saveProgress,
  progressSchema,
  skillSummary,
  type Attempt,
} from "../src/progress";
const lesson = lessons[0];
const attempt = (
  id: string,
  correct: boolean | null,
  assisted = false,
): Attempt => ({ exerciseId: id, answer: "test", correct, assisted, at: 1000 });
describe("Curriculum contracts and answer checking", () => {
  it("validates all published lessons and keeps Quran separate", () => {
    expect(lessons.length).toBe(5);
    for (const l of lessons) {
      expect(lessonSchema.safeParse(l).success).toBe(true);
      expect(l.review.status).toBe("draft");
    }
    expect(lessons.filter((l) => l.courseId === "quran")).toEqual([]);
    expect(courses.find((c) => c.id === "quran")?.kind).toBe("quran");
  });
  it("requires an accountable reviewer for verified content", () => {
    expect(
      lessonSchema.safeParse({
        ...lesson,
        review: { ...lesson.review, status: "reviewed" },
      }).success,
    ).toBe(false);
  });
  it("rejects missing objective, duplicate exercise IDs and invalid choice index", () => {
    expect(lessonSchema.safeParse({ ...lesson, goal: undefined }).success).toBe(
      false,
    );
    expect(
      lessonSchema.safeParse({
        ...lesson,
        exercises: [...lesson.exercises, lesson.exercises[0]],
      }).success,
    ).toBe(false);
    expect(
      lessonSchema.safeParse({
        ...lesson,
        exercises: lesson.exercises.map((e, i) =>
          i === 0 ? { ...e, correct: 99 } : e,
        ),
      }).success,
    ).toBe(false);
  });
  it("accepts punctuation, typographic apostrophes and explicit alternatives", () => {
    expect(normalize("  I’M from Turkey!  ")).toBe("i'm from turkey");
    const ex = lesson.exercises.find((e) => e.id === "write2")!;
    expect(checkAnswer(ex, "I’m Ali!", "en")).toBe(true);
    expect(checkAnswer(ex, "Your name is Ali", "en")).toBe(false);
  });
  it("preserves Turkish dotted and dotless vowels", () => {
    const ex = lessons
      .find((l) => l.id === "tr-hello")!
      .exercises.find((e) => e.id === "i1")!;
    expect(checkAnswer(ex, "ADIM", "tr")).toBe(true);
    expect(checkAnswer(ex, "adim", "tr")).toBe(false);
  });
  it("accepts only declared Arabic vowel variants", () => {
    const ex = lessons
      .find((l) => l.id === "ar-hello")!
      .exercises.find((e) => e.id === "i1")!;
    expect(checkAnswer(ex, "اسمي", "ar")).toBe(true);
    expect(checkAnswer(ex, "اِسْمِي", "ar")).toBe(true);
    expect(checkAnswer(ex, "اسمك", "ar")).toBe(false);
  });
  it("never assigns correctness to free speech", () => {
    expect(
      checkAnswer(
        lesson.exercises.find((e) => e.type === "free")!,
        "anything",
        "en",
      ),
    ).toBeNull();
    expect(
      checkAnswer(
        lesson.exercises.find((e) => e.type === "speak")!,
        "anything",
        "en",
      ),
    ).toBeNull();
  });
});
describe("Persistence, results and spaced repetition", () => {
  it("excludes assisted and self-assessed responses from score", () => {
    const r = {
      lessonId: lesson.id,
      at: 1000,
      attempts: [
        attempt("1", true),
        attempt("2", false),
        attempt("3", true, true),
        attempt("4", null),
      ],
    };
    expect(score(r)).toEqual({ correct: 1, total: 2 });
    expect(passed(r)).toBe(false);
  });
  it("requires at least four objective answers and eighty percent correct", () => {
    const r = {
      lessonId: lesson.id,
      at: 1000,
      attempts: Array.from({ length: 3 }, (_, i) => attempt(String(i), true)),
    };
    expect(passed(r)).toBe(false);
    r.attempts.push(attempt("4", true));
    expect(passed(r)).toBe(true);
    r.attempts.push(attempt("5", false));
    expect(passed(r)).toBe(true);
    r.attempts.push(attempt("6", false));
    expect(passed(r)).toBe(false);
  });
  it("saves results, clears session, schedules words tomorrow and mistakes immediately", () => {
    const p = finishLesson(
      { ...fresh(), session: { lessonId: lesson.id, step: 1, attempts: [] } },
      lesson,
      [attempt("read1", false), attempt("listen1", true, true)],
      1000,
    );
    expect(p.results).toHaveLength(1);
    expect(p.session).toBeNull();
    expect(dueCards(p, 1000)).toHaveLength(2);
    expect(
      Object.values(p.cards)
        .filter((c) => c.kind === "word")
        .every((c) => c.due === 1000 + DAY),
    ).toBe(true);
    expect(dueCards(p, 1000 + DAY)).toHaveLength(6);
  });
  it("increases intervals only after correct retrieval and resets on failure", () => {
    let card = Object.values(
      finishLesson(fresh(), lesson, [attempt("read1", false)], 1000).cards,
    ).find((c) => c.kind === "error")!;
    card = reviewCard(card, true, 2000);
    expect(card.due).toBe(2000 + DAY);
    card = reviewCard(card, true, 3000);
    expect(card.due).toBe(3000 + 3 * DAY);
    card = reviewCard(card, false, 4000);
    expect(card.streak).toBe(0);
    expect(card.due).toBe(4000 + 600_000);
  });
  it("does not create duplicate vocabulary cards on replay", () => {
    let p = finishLesson(fresh(), lesson, [], 1000);
    p = finishLesson(p, lesson, [], 2000);
    expect(
      Object.values(p.cards).filter((c) => c.kind === "word"),
    ).toHaveLength(lesson.words.length);
  });
  it("does not label a few initial answers as mastered skills", () => {
    const p = finishLesson(
      fresh(),
      lesson,
      lesson.exercises.map((e) => attempt(e.id, true)),
      1000,
    );
    expect(
      skillSummary(p, lesson).every((s) => !s.label.includes("Освоен")),
    ).toBe(true);
  });
  it("round-trips a partially completed lesson", () => {
    const p = {
      ...fresh(),
      session: {
        lessonId: lesson.id,
        step: 2,
        attempts: [attempt("read1", false)],
      },
    };
    let raw = "";
    const storage = {
      getItem: () => raw,
      setItem: (_k: string, v: string) => {
        raw = v;
      },
    };
    expect(saveProgress(storage, p)).toBe("");
    expect(loadProgress(storage).data).toEqual(p);
    expect(progressSchema.safeParse(JSON.parse(raw)).success).toBe(true);
  });
  it("reports corrupt or incompatible data without overwriting it", () => {
    let writes = 0;
    const storage = {
      getItem: () => "{bad",
      setItem: () => {
        writes++;
      },
    };
    expect(loadProgress(storage).error).not.toBe("");
    expect(writes).toBe(0);
    expect(
      loadProgress({
        getItem: () => JSON.stringify({ ...fresh(), version: 2 }),
      }).error,
    ).not.toBe("");
  });
  it("reports unavailable storage and quota errors", () => {
    expect(
      loadProgress({
        getItem: () => {
          throw new Error("denied");
        },
      }).error,
    ).not.toBe("");
    expect(
      saveProgress(
        {
          setItem: () => {
            throw new Error("quota");
          },
        },
        fresh(),
      ),
    ).not.toBe("");
  });
});
