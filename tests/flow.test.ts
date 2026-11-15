// @vitest-environment jsdom
import { it, expect, vi } from "vitest";
import { KEY, loadProgress, fresh, DAY, finishLesson } from "../src/progress";
import { lessons, lessonById } from "../src/content";
const tick = () => new Promise((r) => setTimeout(r, 10));
const click = async (selector: string) => {
  const el = document.querySelector<HTMLElement>(selector);
  expect(el, selector).not.toBeNull();
  el!.click();
  await tick();
};
const type = (value: string) => {
  const el = document.querySelector<HTMLInputElement>("#answer")!;
  expect(el).not.toBeNull();
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const go = async (hash: string) => {
  location.hash = hash;
  await tick();
};
it("completes course → lesson → correction → result → dictionary → review; restores data and renders RTL", async () => {
  document.body.innerHTML = '<div id="app"></div>';
  window.scrollTo = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, "speechSynthesis", {
    value: { cancel: vi.fn(), getVoices: () => [], speak: vi.fn() },
    configurable: true,
  });
  localStorage.clear();
  await import("../src/main");
  expect(document.querySelectorAll("i[data-lucide]")).toHaveLength(0);
  expect(document.querySelectorAll("svg").length).toBeGreaterThan(10);
  expect(document.body.textContent).toContain("Большое начинается с малого");
  await click('[data-action="select-course"][data-id="english"]');
  expect(
    (document.querySelector('[data-id="en-cafe"]') as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await click('[data-action="start-lesson"][data-id="en-hello"]');
  expect(document.body.textContent).toContain("После урока вы сможете");
  await click('[data-action="begin-practice"]');
  await click('[data-action="choose"][data-index="0"]');
  await click('[data-action="check"]');
  expect(document.querySelector(".feedback.error")?.textContent).toContain(
    "From Kazakhstan",
  );
  expect(loadProgress(localStorage).data.session?.attempts).toHaveLength(1);
  await click('[data-action="check"]'.replace("check", "next-exercise"));
  // First answer survives a navigation away and back.
  await go("course/turkish");
  await click('[data-action="start-lesson"][data-id="tr-hello"]');
  expect(loadProgress(localStorage).data.drafts["en-hello"]?.step).toBe(2);
  await go("course/english");
  await click('[data-action="start-lesson"][data-id="en-hello"]');
  expect(document.body.textContent).toContain("Как зовут собеседника Даны?");
  await click('[data-action="choose"][data-index="0"]');
  await click('[data-action="check"]');
  await click('[data-action="next-exercise"]');
  type("am");
  await click('[data-action="check"]');
  const attemptsBefore =
    loadProgress(localStorage).data.session!.attempts.length;
  document
    .querySelector("#answer-form")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  expect(loadProgress(localStorage).data.session!.attempts).toHaveLength(
    attemptsBefore,
  );
  await click('[data-action="next-exercise"]');
  for (const i of [2, 3, 1, 0])
    await click(`[data-action="token"][data-index="${i}"]`);
  await click('[data-action="check"]');
  expect(document.querySelector(".feedback.success")).not.toBeNull();
  await click('[data-action="next-exercise"]');
  await click('[data-action="listen"]');
  expect(document.body.textContent).toContain(
    "Голос для этого языка не найден",
  );
  await click('[data-action="choose"][data-index="0"]');
  await click('[data-action="check"]');
  expect(document.querySelector(".form-error")).not.toBeNull();
  await click('[data-action="transcript"]');
  await click('[data-action="check"]');
  expect(document.querySelector(".feedback")?.textContent).toContain(
    "Ответ с подсказкой",
  );
  await click('[data-action="next-exercise"]');
  type("I’m Ali.");
  await click('[data-action="check"]');
  await click('[data-action="next-exercise"]');
  await click('[data-action="choose"][data-index="1"]');
  await click('[data-action="check"]');
  await click('[data-action="next-exercise"]');
  type("I am from Turkey");
  await click('[data-action="check"]');
  await click('[data-action="next-exercise"]');
  type("Hello! I am Dana. I am from Kazakhstan.");
  await click('[data-action="sample"]');
  expect(document.querySelector(".feedback")).toBeNull();
  await click('[data-action="check"]');
  await click('[data-action="next-exercise"]');
  await click('[data-action="record"]');
  expect(document.body.textContent).toContain("Запись не поддерживается");
  await click('[data-action="sample"]');
  await click('[data-action="check"]');
  await click('[data-action="next-exercise"]');
  expect(location.hash).toBe("#result/en-hello");
  expect(document.body.textContent).toContain("Хорошее начало!");
  let saved = loadProgress(localStorage).data;
  expect(saved.results).toHaveLength(1);
  expect(saved.results[0].attempts).toHaveLength(10);
  expect(saved.session).toBeNull();
  expect(
    saved.results[0].attempts.filter((a) => a.correct === null),
  ).toHaveLength(2);
  await go("dictionary");
  expect(document.querySelectorAll(".word-card")).toHaveLength(4);
  const search =
    document.querySelector<HTMLInputElement>("#dictionary-search")!;
  search.value = "name";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  expect(document.querySelectorAll(".word-card")).toHaveLength(1);
  await go("course/english");
  expect(
    (document.querySelector('[data-id="en-cafe"]') as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  await go("review");
  await click('[data-action="start-review"]');
  await click('[data-action="choose"][data-index="1"]');
  await click('[data-action="check"]');
  saved = loadProgress(localStorage).data;
  const card = saved.cards["error:en-hello:read1"];
  expect(card.streak).toBe(1);
  expect(card.due).toBeGreaterThan(Date.now() + DAY - 1000);
  await go("course/quran");
  expect(document.querySelectorAll(".lesson-row")).toHaveLength(0);
  expect(document.body.textContent).toContain("лиценз");
  expect(document.querySelector('[data-action="listen"]')).toBeNull();
  // Start Arabic and reach its script exercise through persisted session state.
  const p = {
    ...fresh(),
    courseId: "arabic",
    session: { lessonId: "ar-letters", step: 5, attempts: [] },
  };
  localStorage.setItem(KEY, JSON.stringify(p));
  window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
  await go("lesson/ar-letters");
  expect(document.querySelector("#answer")?.getAttribute("dir")).toBe("rtl");
  await click('[data-action="letter"][data-letter="ب"]');
  expect(document.querySelector<HTMLInputElement>("#answer")?.value).toBe("ب");
  await click('[data-action="check"]');
  expect(document.querySelector(".feedback.success")).not.toBeNull();
  await go("course/arabic");
  await click('[data-action="start-lesson"][data-id="ar-letters"]');
  expect(document.querySelector('bdi[lang="ar"][dir="rtl"]')).not.toBeNull();
  // Escape learner text rather than interpreting it as HTML.
  await click('[data-action="next-exercise"]');
  await click('[data-action="choose"][data-index="1"]');
  await click('[data-action="check"]');
  await click('[data-action="next-exercise"]');
  type("<img src=x onerror=alert(1)>");
  await click('[data-action="check"]');
  expect(document.querySelector(".exercise-panel img")).toBeNull();
  await go("settings");
  expect(document.querySelector("#daily-goal")).not.toBeNull();
  expect(document.body.textContent).toContain("Восстановить из файла");

  // Other published modules use the same real UI and retain their own curriculum.
  for (const lesson of lessons.filter((l) => l.id !== "en-hello")) {
    let seeded = fresh();
    for (const id of lesson.prerequisites) {
      const prerequisite = lessonById(id)!;
      seeded = finishLesson(
        seeded,
        prerequisite,
        prerequisite.exercises.map((e) => ({
          exerciseId: e.id,
          answer: "seed",
          correct: e.type === "free" || e.type === "speak" ? null : true,
          assisted: false,
          at: Date.now(),
        })),
      );
    }
    localStorage.setItem(KEY, JSON.stringify(seeded));
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    await go(`course/${lesson.courseId}`);
    await click(`[data-action="start-lesson"][data-id="${lesson.id}"]`);
    await click('[data-action="begin-practice"]');
    for (const exercise of lesson.exercises) {
      if (exercise.type === "choice" || exercise.type === "listen") {
        if (exercise.type === "listen")
          await click('[data-action="transcript"]');
        await click(`[data-action="choose"][data-index="${exercise.correct}"]`);
      } else if (exercise.type === "input") type(exercise.answers[0]);
      else if (exercise.type === "order") {
        const used: number[] = [];
        for (const word of exercise.answer.split(" ")) {
          const index = exercise.tokens.findIndex(
            (t, i) => t === word && !used.includes(i),
          );
          expect(index).toBeGreaterThanOrEqual(0);
          used.push(index);
          await click(`[data-action="token"][data-index="${index}"]`);
        }
      } else {
        if (exercise.type === "free") type(exercise.sample);
        await click('[data-action="sample"]');
      }
      await click('[data-action="check"]');
      expect(document.querySelector(".feedback.error")).toBeNull();
      await click('[data-action="next-exercise"]');
    }
    expect(location.hash).toBe(`#result/${lesson.id}`);
    expect(
      loadProgress(localStorage).data.results.at(-1)?.attempts,
    ).toHaveLength(lesson.exercises.length);
  }
});
