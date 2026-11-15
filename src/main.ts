import "./style.css";
import {
  createIcons,
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  Languages,
  RotateCcw,
  ChartNoAxesCombined,
  Settings,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  Check,
  CheckCheck,
  Clock,
  Volume2,
  Lock,
  Leaf,
  Headphones,
  MessageCircle,
  PenLine,
  Mic,
  Square,
  Play,
  Download,
  Upload,
  ShieldCheck,
  Info,
  X,
  Target,
  CalendarDays,
  Menu,
  Search,
  Plus,
  ExternalLink,
  Sparkles,
} from "lucide";
import { courses, lessons, courseById, lessonById } from "./content";
import {
  checkAnswer,
  objective,
  type Course,
  type Exercise,
  type Lesson,
} from "./model";
import {
  KEY,
  loadProgress,
  saveProgress,
  progressSchema,
  finishLesson,
  hasPracticed,
  hasPassed,
  score,
  passed,
  dueCards,
  reviewCard,
  skillSummary,
  type Progress,
  type Attempt,
  type ReviewCard,
} from "./progress";
import { t, ui } from "./i18n";
import { heroArt } from "./art";

const iconSet = {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  Languages,
  RotateCcw,
  ChartNoAxesCombined,
  Settings,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  Check,
  CheckCheck,
  Clock,
  Volume2,
  Lock,
  Leaf,
  Headphones,
  MessageCircle,
  PenLine,
  Mic,
  Square,
  Play,
  Download,
  Upload,
  ShieldCheck,
  Info,
  X,
  Target,
  CalendarDays,
  Menu,
  Search,
  Plus,
  ExternalLink,
  Sparkles,
};
const $ = document.querySelector<HTMLDivElement>("#app")!;
const browserStorage = {
  getItem: (key: string) => window.localStorage.getItem(key),
  setItem: (key: string, value: string) =>
    window.localStorage.setItem(key, value),
};
const initial = loadProgress(browserStorage);
let progress: Progress = initial.data;
let storageError = initial.error;
let storageLocked = !!initial.error;
let route = location.hash.slice(1) || "home";
let menu = false;
let query = "";
let dictionaryFilter = "all";
let answer = "";
let selected: number[] = [];
let assisted = false;
let heard = false;
let audioNotice = "";
let showSample = false;
let currentFeedback: Attempt | null = null;
let reviewQueue: ReviewCard[] = [];
let reviewIndex = 0;
let reviewStarted = false;
let reviewDone = 0;
let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let recordingUrl = "";
let micNotice = "";
let recording = false;
let audioEpoch = 0;
const esc = (s: string | number) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const icon = (name: string, cls = "") =>
  `<i data-lucide="${name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}" class="${cls}" aria-hidden="true"></i>`;
const go = (path: string) => {
  if (route === path) {
    render();
    return;
  }
  location.hash = path;
};
function persist() {
  if (storageLocked) return;
  const error = saveProgress(browserStorage, progress);
  storageError = error;
  if (error) render();
}
function update(fn: (p: Progress) => Progress) {
  if (!storageLocked && !storageError) {
    const latest = loadProgress(browserStorage);
    if (!latest.error) progress = latest.data;
    else {
      storageLocked = true;
      storageError = latest.error;
    }
  }
  progress = fn(progress);
  persist();
}
const currentCourse = () => courseById(progress.courseId);
const currentLesson = () =>
  progress.session ? lessonById(progress.session.lessonId) : undefined;
const courseLessons = (c: Course) => lessons.filter((l) => l.courseId === c.id);
const nextLesson = (c: Course) =>
  courseLessons(c).find((l) => !hasPassed(progress, l.id)) ??
  courseLessons(c)[0];
const availableCount = (c: Course) => courseLessons(c).length;
const practicedCount = (c: Course) =>
  courseLessons(c).filter((l) => hasPracticed(progress, l.id)).length;
const today = () => new Date().toLocaleDateString("en-CA");
const dateKey = (at: number) => new Date(at).toLocaleDateString("en-CA");
const todayResults = () =>
  progress.results.filter((r) => dateKey(r.at) === today());
function minutesToday() {
  return todayResults().reduce(
    (sum, r) => sum + (lessonById(r.lessonId)?.minutes ?? 0),
    0,
  );
}
function stopRecording() {
  if (recorder?.state === "recording") recorder.stop();
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  recording = false;
}
function resetExercise() {
  audioEpoch++;
  answer = "";
  selected = [];
  assisted = false;
  heard = false;
  audioNotice = "";
  showSample = false;
  currentFeedback = null;
  micNotice = "";
  stopRecording();
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  recordingUrl = "";
  window.speechSynthesis?.cancel();
}
function startLesson(id: string) {
  const l = lessonById(id);
  if (!l) return;
  if (l.prerequisites.some((p) => !hasPassed(progress, p))) {
    go(`course/${l.courseId}`);
    return;
  }
  resetExercise();
  if (progress.session?.lessonId !== id)
    update((p) => ({
      ...p,
      courseId: l.courseId,
      drafts: {
        ...p.drafts,
        ...(p.session ? { [p.session.lessonId]: p.session } : {}),
      },
      session: p.drafts[id] ?? { lessonId: id, attempts: [], step: 0 },
    }));
  go(`lesson/${id}`);
}
function langText(text: string, c: Course, cls = "") {
  const ar = c.language === "ar" && /[\u0600-\u06ff]/.test(text);
  const lang = /[а-яё]/i.test(text) && !ar ? "ru" : c.language;
  return `<bdi class="${ar ? "arabic " : ""}${cls}" lang="${lang}" dir="${ar ? "rtl" : "ltr"}">${esc(text)}</bdi>`;
}
const badge = (text: string, cls = "") =>
  `<span class="badge ${cls}">${esc(text)}</span>`;
function courseFlag(c: Course) {
  return `<span class="flag flag-${c.id}" ${c.language === "ar" ? 'lang="ar"' : ""}>${c.flag}</span>`;
}
function pageTitle(
  eyebrow: string,
  title: string,
  description: string,
  action = "",
) {
  return `<div class="page-title"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
}
const button = (label: string, action: string, cls = "primary", extra = "") =>
  `<button ${/\btype=/.test(extra) ? "" : 'type="button"'} class="btn ${cls}" data-action="${action}" ${extra}>${label}</button>`;
function sidebar() {
  const nav = [
    ["home", "LayoutDashboard", t("home")],
    ["courses", "Languages", t("courses")],
    ["dictionary", "BookOpen", t("dictionary")],
    ["review", "RotateCcw", t("review")],
    ["stats", "ChartNoAxesCombined", t("stats")],
  ];
  return `<aside class="sidebar ${menu ? "is-open" : ""}" aria-label="${ui("Главная навигация")}"><a class="brand" href="#home"><span class="brand-symbol">${icon("Languages")}</span>tilra<span class="brand-dot">.</span></a><div class="brand-caption">${t("tagline")}</div><div class="nav-label">${ui("ВАШЕ ПРОСТРАНСТВО")}</div><nav>${nav.map(([path, i, label]) => `<a href="#${path}" class="nav-item ${route === path || (path === "courses" && route.startsWith("course/")) ? "active" : ""}" ${route === path ? 'aria-current="page"' : ""}>${icon(i)}<span>${label}</span>${path === "review" && dueCards(progress).length ? `<span class="nav-count">${dueCards(progress).length}</span>` : ""}</a>`).join("")}</nav><div class="sidebar-bottom"><div class="small-note">${icon("Leaf")}<strong>${ui("Маленькие шаги.")}<br>${ui("Большие возможности.")}</strong><p>${ui("Каждый новый навык открывает")}<br>${ui("чуть больше мира.")}</p></div><a href="#settings" class="nav-item ${route === "settings" ? "active" : ""}">${icon("Settings")}<span>${t("settings")}</span></a><div class="profile"><span class="avatar">${ui("В")}</span><div><strong>${ui("Ваше пространство")}</strong><span>${ui("Начало большого пути")}</span></div><span class="online-dot"></span></div></div></aside>`;
}
function topbar() {
  return `<header class="topbar"><div class="top-left"><button class="icon-btn mobile-menu" data-action="menu" aria-label="${menu ? ui("Закрыть") : ui("Открыть")} ${ui("меню")}" aria-expanded="${menu}">${icon(menu ? "X" : "Menu")}</button><span class="breadcrumb">${t("home")}${route !== "home" ? `<span>/</span><strong>${route.startsWith("lesson") ? ui("Урок") : route.startsWith("course/") ? currentCourse().title : ({ courses: t("courses"), dictionary: t("dictionary"), review: t("review"), stats: t("stats"), settings: t("settings") }[route.split("/")[0]] ?? ui("Результат"))}</strong>` : ""}</span></div><div class="top-right"><span class="local-status"><span></span>${storageError ? ui("Сохранение требует внимания") : ui("Сохраняется на устройстве")}</span><a href="#settings" class="locale">RU <span>⌄</span></a><span class="avatar avatar-small">${ui("В")}</span></div></header>`;
}
function courseCard(c: Course, full = false) {
  const n = availableCount(c);
  const completed = practicedCount(c);
  return `<button class="course-card ${c.id === progress.courseId ? "selected" : ""} ${c.kind === "quran" ? "quran-card" : ""}" data-action="select-course" data-id="${c.id}"><div class="course-card-top">${courseFlag(c)}${c.id === progress.courseId ? `<span class="selected-label">${icon("Check")}${ui("Вы изучаете")}</span>` : badge(c.kind === "quran" ? ui("Отдельное направление") : ui("Цели A1–A2"))}</div><h3>${c.title}</h3><p>${c.description}</p><div class="course-card-bottom"><span>${n ? `${n} ${n === 1 ? ui("урок доступен") : ui("урока доступны")}` : ui("Подготовка материалов")}${full && n ? ` · ${completed} ${ui("пройдено")}` : ""}</span>${icon("ArrowRight")}</div>${n ? `<div class="tiny-progress"><span style="width:${(completed / n) * 100}%"></span></div>` : ""}</button>`;
}
function week() {
  const days = [
    ui("Вс"),
    ui("Пн"),
    ui("Вт"),
    ui("Ср"),
    ui("Чт"),
    ui("Пт"),
    ui("Сб"),
  ];
  return `<div class="week">${Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    const active = progress.results.some(
      (r) => dateKey(r.at) === dateKey(d.getTime()),
    );
    return `<div class="week-day ${i === 6 ? "today" : ""} ${active ? "done" : ""}"><span>${days[d.getDay()]}</span><b>${active ? icon("Check") : d.getDate()}</b></div>`;
  }).join("")}</div>`;
}
function dailyPanel() {
  const mins = minutesToday();
  const n = Object.keys(progress.cards).filter(
    (k) => progress.cards[k].kind === "word",
  ).length;
  return `<section class="panel daily-panel"><div class="section-heading"><h2>${ui("Ваш ритм")}</h2>${icon("CalendarDays")}</div><p class="muted small">${ui("Регулярность важнее скорости")}</p>${week()}<div class="daily-goal"><div><span>${ui("Цель на сегодня")}</span><strong>${mins} <small>/ ${progress.dailyGoal} ${ui("мин")}</small></strong></div><a href="#settings" class="text-link">${ui("Изменить")}</a></div><div class="progress-track"><span style="width:${Math.min(100, (mins / progress.dailyGoal) * 100)}%"></span></div><p class="micro">${ui("Время рассчитано по длительности завершённых уроков.")}</p><div class="mini-stats"><div><span class="stat-icon peach">${icon("BookOpen")}</span><strong>${n}</strong><span>${ui("слов в словаре")}</span></div><div><span class="stat-icon lavender">${icon("CheckCheck")}</span><strong>${new Set(progress.results.map((r) => r.lessonId)).size}</strong><span>${ui("уроков пройдено")}</span></div></div></section><section class="review-promo"><span class="stat-icon sage">${icon("RotateCcw")}</span><h3>${ui("Вернёмся к знакомому?")}</h3><p>${dueCards(progress).length ? `${dueCards(progress).length} ${ui("заданий готовы к повторению. Закрепите слова и разберите ошибки.")}` : ui("После урока здесь появятся слова и ошибки для повторения.")}</p><a href="#review" class="text-link">${ui("К повторению")} ${icon("ArrowRight")}</a></section><div class="trust-note">${icon("ShieldCheck")}<span>${ui("Ваш прогресс — на этом устройстве.")}<br><a href="#settings">${ui("Сохранить резервную копию")}</a></span></div>`;
}
function lessonRow(l: Lesson, index: number) {
  const complete = hasPassed(progress, l.id);
  const locked = l.prerequisites.some((id) => !hasPassed(progress, id));
  const started = hasPracticed(progress, l.id);
  return `<button class="lesson-row ${locked ? "locked" : ""}" data-action="start-lesson" data-id="${l.id}" ${locked ? "disabled" : ""}><span class="lesson-number ${complete ? "complete" : ""}">${complete ? icon("Check") : locked ? icon("Lock") : String(index + 1).padStart(2, "0")}</span><div class="lesson-row-copy"><strong>${esc(l.title)}</strong><span>${esc(l.subtitle)}</span></div><span class="lesson-meta">${started ? (complete ? ui("Практика пройдена") : ui("Нужна практика")) : `${l.minutes} ${ui("мин")}`}</span>${icon(locked ? "Lock" : "ChevronRight")}</button>`;
}
function dashboard() {
  const c = currentCourse();
  const next = nextLesson(c);
  const resume = progress.session && lessonById(progress.session.lessonId);
  return `${pageTitle(ui("ПОНЕМНОГУ, КАЖДЫЙ ДЕНЬ"), ui('Большое начинается с малого<span class="heading-dot">.</span>'), ui("Новый язык — это новые возможности. Сделаем ещё один шаг?"))}<div class="dashboard-layout"><div class="dashboard-main"><section class="hero"><div class="hero-copy"><span class="hero-eyebrow">${icon("Sparkles")} ${ui("ВАШ СЛЕДУЮЩИЙ ШАГ")}</span><h2>${resume ? ui("Продолжим с того места,<br>где остановились?") : ui("Мир становится ближе.<br>С каждым новым словом.")}</h2><p>${resume ? `${ui("Вас ждёт урок")} «${esc(resume.title)}».` : ui("Учитесь понимать, говорить и находить<br>общий язык — в своём темпе.")}</p>${next || resume ? button(`${resume ? ui("Продолжить урок") : ui("Начать обучение")} ${icon("ArrowRight")}`, "start-lesson", "primary", `data-id="${(resume || next)!.id}"`) : `<a class="btn primary" href="#course/quran">${ui("О направлении")} ${icon("ArrowRight")}</a>`}<div class="hero-foot">${icon("Clock")} ${resume?.minutes ?? next?.minutes ?? 10}–15 ${ui("минут для нового навыка")}</div></div>${heroArt}</section><section class="section courses-section"><div class="section-heading"><h2>${ui("Какой язык откроем сегодня?")}</h2><a href="#courses" class="text-link muted-link">${ui("Все направления")} ${icon("ArrowRight")}</a></div><div class="course-grid">${courses
    .filter((c) => c.kind === "modern")
    .map((c) => courseCard(c))
    .join(
      "",
    )}</div><a class="quran-link" href="#course/quran"><span class="quran-mark">۞</span><span><strong>${ui("Язык Корана")}</strong><span>${ui("Отдельное направление · материалы готовятся")}</span></span>${icon("ArrowRight")}</a></section><section class="panel path-preview"><div class="section-heading"><div><span class="eyebrow">${ui("ВАША УЧЕБНАЯ ДОРОЖКА")}</span><h2>${c.title}: ${c.units[0].title.toLocaleLowerCase("ru")}</h2></div><a href="#course/${c.id}" class="text-link">${ui("Карта курса")} ${icon("ArrowRight")}</a></div><div class="path-description"><span class="level-tag">${c.kind === "quran" ? ui("Этап 1") : ui("A1 · Начало")}</span><span>${practicedCount(c)} ${ui("из")} ${availableCount(c)} ${ui("доступных уроков пройдено")}</span></div>${courseLessons(c).map(lessonRow).join("") || ui('<div class="empty-inline">Подготавливаем проверенные материалы.</div>')}<div class="panel-foot">${icon("Info")} ${ui("Это стартовый модуль, а не полный курс A1/A2.")}</div></section></div><aside class="dashboard-aside">${dailyPanel()}</aside></div>`;
}
function allCourses() {
  return `${pageTitle(ui("ВЫБЕРИТЕ СВОЙ ПУТЬ"), ui("Языки открывают двери."), ui("Начните с одного направления. Переключиться можно в любой момент."))}<div class="notice neutral">${icon("Info")}<div><strong>${ui("Стартовая библиотека Tilra")}</strong><p>${ui("Доступны")} ${lessons.length} ${ui("уроков. A1 и A2 — цели программы; полные уровни ещё не опубликованы. Все материалы пока имеют статус учебного черновика.")}</p></div></div><div class="all-courses">${courses.map((c) => courseCard(c, true)).join("")}</div><section class="panel philosophy"><span class="stat-icon sage">${icon("GraduationCap")}</span><div><h2>${ui("Не просто знать слова. Уметь ими пользоваться.")}</h2><p>${ui("В каждом уроке: понятная цель, короткое объяснение, примеры и практика в новых ситуациях. Затем — повторение и возвращение к ошибкам.")}</p></div></section>`;
}
function coursePage(id: string) {
  const c = courseById(id);
  const ls = courseLessons(c);
  return `<a href="#courses" class="back-link">${icon("ArrowLeft")} ${ui("Все направления")}</a>${pageTitle(c.kind === "quran" ? ui("ОТДЕЛЬНОЕ НАПРАВЛЕНИЕ") : ui("КАРТА ОБУЧЕНИЯ"), `${courseFlag(c)} ${c.title}`, c.goal, c.kind === "modern" ? badge(ui("Цели A1–A2"), "sage") : badge(ui("Собственные этапы"), "sage"))}${c.kind === "quran" ? `<div class="notice amber">${icon("Lock")}<div><strong>${ui("Материалы пока не опубликованы")}</strong><p>${ui("Для запуска нужны: проверенный корпус коранического текста с версионированием, источник перевода, записи квалифицированного чтеца с разрешением на использование и экспертная проверка учебной последовательности. Источники и лицензии пока не выбраны.")}</p><p>${ui("Приложение не генерирует аяты, толкования или правила таджвида. Синтез речи здесь не используется. Этапы этого направления не соответствуют уровням CEFR.")}</p></div></div>` : `<div class="notice neutral">${icon("Info")}<div><strong>${ls.length} ${ls.length === 1 ? ui("урок доступен") : ui("урока доступны")} · ${ui("учебные черновики")}</strong><p>${c.id === "arabic" ? ui("Фусха — современный литературный арабский. Она полезна для письма и формального общения, но не заменяет разговорные диалекты ОАЭ и Саудовской Аравии. ") : ""}A1/A2 — ${ui("ориентиры будущей программы. Завершение стартовых уроков не означает прохождение уровня.")}</p></div></div>`}<div class="course-map">${c.units.map((u, i) => `<section class="unit ${u.planned ? "planned-unit" : ""}"><div class="unit-timeline"><span>${u.planned ? icon("Lock") : i + 1}</span></div><div class="unit-content"><div class="section-heading"><h2>${u.title}</h2>${badge(u.level)}</div><p>${u.description}</p>${u.planned ? `<div class="planned-box">${icon("Lock")} ${ui("Запланировано")} · ${c.kind === "quran" ? ui("ожидает источников и экспертной проверки") : ui("материалы ещё не опубликованы")}</div>` : `<div class="panel">${u.lessonIds.map((id, i) => lessonRow(lessonById(id)!, i)).join("")}</div>`}</div></section>`).join("")}</div>`;
}
function provenance(l: Lesson) {
  return `<details class="provenance"><summary>${icon("Info")} ${ui("Источник и проверка материалов")}</summary><p><strong>${ui("Статус")}:</strong> ${ui("учебный черновик, не проверен специалистом.")}</p><p><strong>${ui("Источник")}:</strong> ${esc(l.review.source)}</p><p><strong>${ui("Примечания")}:</strong> ${esc(l.review.notes)}</p></details>`;
}
function lessonIntro(l: Lesson, c: Course) {
  return `<span class="eyebrow">${ui("СНАЧАЛА РАЗБЕРЁМСЯ")}</span><h1>${esc(l.title)}</h1><div class="goal-box">${icon("Target")}<div><strong>${ui("После урока вы сможете")}</strong><p>${esc(l.goal)}</p></div></div><h2>${ui("Коротко о главном")}</h2><p class="explanation">${esc(l.explanation)}</p><h2>${ui("Посмотрим на примеры")}</h2><div class="examples">${l.examples.map((e) => `<div><strong>${langText(e.text, c)}</strong><span>${esc(e.translation)}</span></div>`).join("")}</div>${l.prerequisites.length ? `<div class="notice neutral small">${icon("RotateCcw")} ${ui("В уроке встречается материал предыдущих занятий.")}</div>` : ""}${provenance(l)}<div class="exercise-actions">${button(`${ui("Перейти к практике")} ${icon("ArrowRight")}`, "begin-practice")}</div>`;
}
function answerCorrectText(e: Exercise) {
  if (e.type === "input") return e.answers[0];
  if (e.type === "order") return e.answer;
  if (e.type === "choice" || e.type === "listen") return e.options[e.correct];
  return e.sample;
}
function exerciseContent(e: Exercise, c: Course, feedback: Attempt | null) {
  const done = !!feedback;
  const opts = e.type === "choice" || e.type === "listen" ? e.options : [];
  const chosen = feedback?.answer ?? answer;
  let field = "";
  if (e.type === "choice" || e.type === "listen")
    field = `<div class="options" role="radiogroup" aria-label="${ui("Варианты ответа")}">${opts.map((o, i) => `<button type="button" role="radio" tabindex="${chosen ? (chosen === String(i) ? 0 : -1) : i === 0 ? 0 : -1}" aria-checked="${chosen === String(i)}" class="option ${chosen === String(i) ? "chosen" : ""} ${done && i === e.correct ? "correct-option" : ""} ${done && chosen === String(i) && i !== e.correct ? "wrong-option" : ""}" data-action="choose" data-index="${i}" ${done ? "disabled" : ""}><span class="option-letter">${String.fromCharCode(65 + i)}</span><span>${langText(o, c)}</span>${done && i === e.correct ? icon("Check") : ""}</button>`).join("")}</div>`;
  if (e.type === "input")
    field = `<label class="input-label" for="answer">${ui("Ваш ответ")}</label><input id="answer" class="answer-input ${c.language === "ar" ? "arabic" : ""}" lang="${c.language}" dir="${c.language === "ar" ? "rtl" : "ltr"}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${c.language === "ar" ? "اكتب هنا" : ui("Напишите ответ…")}" value="${esc(chosen)}" ${done ? "disabled" : ""}>${e.hint ? `<p class="micro">${esc(e.hint)}</p>` : ""}${c.language === "ar" && !done ? `<div class="keyboard" aria-label="${ui("Арабские буквы")}">${["ا", "ب", "ت", "س", "م", "ي", "َ", "ِ", "ُ", "ْ", "ّ", " "].map((letter) => `<button type="button" data-action="letter" data-letter="${letter}" aria-label="${letter === " " ? ui("Пробел") : letter}">${letter === " " ? "␣" : letter}</button>`).join("")}</div>` : ""}`;
  if (e.type === "order") {
    field = `<div class="sentence-zone ${c.language === "ar" ? "rtl" : ""}" aria-label="${ui("Составленное предложение")}" aria-live="polite">${done ? langText(chosen, c) : selected.length ? selected.map((i, n) => `<button type="button" class="token placed" data-action="remove-token" data-index="${n}" aria-label="${ui("Убрать")} ${esc(e.tokens[i])}">${langText(e.tokens[i], c)}</button>`).join("") : ui("<span>Нажимайте слова в нужном порядке</span>")}</div><div class="tokens ${c.language === "ar" ? "rtl" : ""}">${e.tokens.map((token, i) => `<button type="button" class="token ${selected.includes(i) ? "used" : ""}" data-action="token" data-index="${i}" ${done || selected.includes(i) ? "disabled" : ""}>${langText(token, c)}</button>`).join("")}</div>`;
  }
  if (e.type === "free" || e.type === "speak") {
    field =
      e.type === "free"
        ? `<label class="input-label" for="answer">${ui("Ваш вариант · без автоматической оценки")}</label><textarea id="answer" class="answer-input ${c.language === "ar" ? "arabic" : ""}" dir="${c.language === "ar" ? "rtl" : "ltr"}" rows="4" placeholder="${ui("Сформулируйте ответ…")}" ${done ? "disabled" : ""}>${esc(chosen)}</textarea>`
        : `<div class="speaking-text">${langText(e.text, c)}</div><p class="small muted">${ui("Проговорите вслух. Запись необязательна, хранится только в памяти этой страницы и удалится при переходе.")}</p><div class="record-actions">${button(`${icon(recording ? "Square" : "Mic")} ${recording ? ui("Остановить запись") : ui("Записать себя")}`, recording ? "stop-recording" : "record", "secondary")}${recordingUrl ? `<audio controls src="${recordingUrl}" aria-label="${ui("Ваша запись")}"></audio>` : ""}</div>${micNotice ? `<p role="status" class="micro">${esc(micNotice)}</p>` : ""}`;
    if (showSample || done)
      field += `<div class="sample"><span class="eyebrow">${ui("ВОЗМОЖНЫЙ ВАРИАНТ")}</span><p>${langText(e.sample, c)}</p><div class="self-checklist">${e.checklist.map((item, i) => `<label><input type="checkbox" ${done ? "disabled" : ""} name="self-${i}"> ${esc(item)}</label>`).join("")}</div><p class="micro">${ui("Самопроверка. Эти отметки не превращаются в балл за навык.")}</p></div>`;
  }
  return `<div class="exercise-type">${icon({ choice: "BookOpen", input: "PenLine", order: "Languages", listen: "Headphones", free: "MessageCircle", speak: "Mic" }[e.type])} ${e.skill}${e.type === "free" || e.type === "speak" ? badge(ui("Самопроверка")) : ""}</div><h1>${esc(e.prompt)}</h1>${e.type === "choice" && e.passage ? `<div class="passage">${langText(e.passage, c)}</div>` : ""}${e.type === "listen" ? `<div class="listening-box">${button(`${icon("Volume2")} ${ui("Прослушать")}`, "listen", "audio-button", done ? "disabled" : "")}<span>${ui("Синтез речи устройства · не эталон произношения")}</span></div>${audioNotice ? `<p class="audio-notice" role="status">${esc(audioNotice)}</p>` : ""}<details class="transcript" ${assisted || feedback?.assisted ? "open" : ""}><summary data-action="transcript">${ui("Показать текст · ответ с подсказкой")}</summary><p>${langText(e.text, c)}</p><span class="micro">${ui("Это задание не будет засчитано как самостоятельное понимание на слух.")}</span></details>` : ""}<form id="answer-form">${field}<div id="inline-message" role="status"></div>${feedback ? `<div class="feedback ${feedback.correct === null ? "neutral" : feedback.correct ? "success" : "error"}" role="status"><span class="feedback-icon">${icon(feedback.correct === false ? "RotateCcw" : feedback.correct ? "Check" : "Info")}</span><div><strong>${feedback.correct === null ? ui("Практика выполнена") : feedback.assisted ? ui("Ответ с подсказкой") : feedback.correct ? ui("Верно! Так держать.") : ui("Разберём вместе")}</strong>${feedback.correct === false ? `<p>${ui("Вариант ответа")}: ${langText(answerCorrectText(e), c)}</p>` : ""}<p>${esc(e.explanation)}</p></div></div>` : ""}<div class="exercise-actions">${!done && (e.type === "free" || e.type === "speak") && !showSample ? button(ui("Сравнить с образцом"), "sample", "secondary") : ""}${done ? button(`${ui("Далее")} ${icon("ArrowRight")}`, "next-exercise") : button(e.type === "free" || e.type === "speak" ? ui("Завершить самопроверку") : t("check"), "check", "primary", `${(e.type === "free" || e.type === "speak") && !showSample ? "disabled" : ""} type="submit"`)}<span class="micro">${objective(e) ? ui("Проверка по допустимым вариантам") : ui("Без балла за речь")}</span></div></form>`;
}
function lessonPage(id: string) {
  const l = lessonById(id);
  if (!l)
    return emptyPage(
      ui("Урок не найден"),
      ui("Вернитесь к карте и выберите доступный урок."),
      ui("К направлениям"),
      "#courses",
    );
  const c = courseById(l.courseId);
  if (!progress.session || progress.session.lessonId !== id)
    return `<div class="panel standalone">${pageTitle(ui("УРОК"), l.title, l.goal)}${button(ui("Открыть урок"), "start-lesson", "primary", `data-id="${l.id}"`)}</div>`;
  const session = progress.session;
  const step = Math.min(session.step, l.exercises.length);
  const e = l.exercises[step - 1];
  const feedback = session.attempts.find((a) => a.exerciseId === e?.id) ?? null;
  return `<div class="lesson-heading"><a href="#course/${c.id}" class="back-link">${icon("ArrowLeft")} ${ui("Карта курса")}</a><span>${courseFlag(c)} ${c.title} <span class="divider">/</span> ${l.title}</span>${badge(ui("Черновик"), "amber")}</div><div class="lesson-progress-head"><span>${step === 0 ? ui("Объяснение") : `${ui("Задание")} ${step} ${ui("из")} ${l.exercises.length}`}</span><span>${Math.round((step / (l.exercises.length + 1)) * 100)}%</span></div><div class="progress-track lesson-track"><span style="width:${(step / (l.exercises.length + 1)) * 100}%"></span></div><div class="lesson-layout"><section class="panel exercise-panel">${step === 0 ? lessonIntro(l, c) : exerciseContent(e, c, feedback)}</section><aside class="lesson-aside"><div class="panel"><span class="eyebrow">${ui("СЕГОДНЯ В ФОКУСЕ")}</span><h3>${esc(l.title)}</h3><p>${esc(l.goal)}</p><div class="lesson-outline"><span class="${step === 0 ? "current" : "finished"}">${icon(step === 0 ? "BookOpen" : "Check")}${ui("Объяснение и примеры")}</span><span class="${step > 0 ? "current" : ""}">${icon("PenLine")}${ui("Практика в новых ситуациях")}</span><span>${icon("ChartNoAxesCombined")}${ui("Результат и следующие шаги")}</span></div></div><div class="lesson-tip">${icon("Leaf")}<p>${ui("Ошибки — часть обучения.")}<br>${ui("Мы сохраним их, чтобы вы могли вернуться и разобраться.")}</p></div><details class="reference"><summary>${ui("Открыть объяснение")}</summary><p>${esc(l.explanation)}</p>${l.examples.map((e) => `<p>${langText(e.text, c)}<br><span>${esc(e.translation)}</span></p>`).join("")}</details></aside></div>`;
}
function resultPage(id: string) {
  const l = lessonById(id);
  const r = progress.results.filter((r) => r.lessonId === id).at(-1);
  if (!l || !r)
    return emptyPage(
      ui("Результата пока нет"),
      ui("Сначала пройдите доступный урок."),
      ui("К направлениям"),
      "#courses",
    );
  const s = score(r);
  const incorrect = r.attempts.filter((a) => a.correct === false);
  const assistedCount = r.attempts.filter((a) => a.assisted).length;
  const skipped = r.attempts.filter(
    (a) => a.correct === null && !a.assisted,
  ).length;
  const c = courseById(l.courseId);
  return `<div class="result-wrap"><div class="result-icon">${icon(passed(r) ? "CheckCheck" : "Leaf")}</div><span class="eyebrow">${ui("ЕЩЁ ОДИН ШАГ ВПЕРЁД")}</span><h1>${passed(r) ? ui("Хорошее начало!") : ui("Практика завершена")}</h1><p class="muted">${l.title} · ${c.title}</p><div class="result-stats"><div><strong>${s.correct}<small>/${s.total}</small></strong><span>${ui("верно самостоятельно")}</span></div><div><strong>${l.words.length}</strong><span>${ui("слов для повторения")}</span></div><div><strong>${incorrect.length}</strong><span>${ui("ошибок для разбора")}</span></div></div><div class="notice neutral">${icon("Info")}<div><strong>${passed(r) ? ui("Первичная практика пройдена") : ui("Навык стоит потренировать ещё")}</strong><p>${passed(r) ? ui("Верно выполнено не менее 80% из минимум 4 самостоятельных заданий.") : ui("Для открытия следующего урока нужно минимум 4 самостоятельных ответа и 80% верных.")} ${skipped} ${ui("заданий самопроверки,")} ${assistedCount} ${ui("ответов с подсказкой не входят в балл. Завершение урока не подтверждает владение уровнем A1/A2.")}</p></div></div><section class="panel skill-panel"><h2>${ui("Что вы потренировали")}</h2>${skillSummary(
    progress,
    l,
  )
    .map(
      (s) =>
        `<div class="skill-row"><div><strong>${s.skill}</strong><span>${s.correct} ${ui("из")} ${s.total} ${ui("разных заданий отвечены верно")}</span></div>${badge(s.label, "sage")}</div>`,
    )
    .join(
      "",
    )}<p class="micro">${ui("Это результаты отдельных навыков в стартовом уроке. Для подтверждения освоения нужны новые задания и отсроченная проверка; она пока не опубликована.")}</p></section>${
    incorrect.length
      ? `<details class="panel mistakes"><summary>${ui("Разобрать ошибки")} · ${incorrect.length}</summary>${incorrect
          .map((a) => {
            const e = l.exercises.find((e) => e.id === a.exerciseId)!;
            return `<div><strong>${esc(e.prompt)}</strong><p>${ui("Верный вариант")}: ${langText(answerCorrectText(e), c)}</p><p>${esc(e.explanation)}</p></div>`;
          })
          .join("")}</details>`
      : ""
  }<div class="result-actions"><a href="#review" class="btn primary">${ui("Повторить ошибки")} ${icon("ArrowRight")}</a><a href="#course/${c.id}" class="btn secondary">${ui("Карта курса")}</a>${button(ui("Пройти урок ещё раз"), "restart", "ghost", `data-id="${l.id}"`)}</div><p class="micro">${storageError ? ui("Сохранение требует внимания — см. сообщение выше.") : ui("Результат сохранён на этом устройстве. Слова вернутся на повторение завтра.")}</p></div>`;
}
function emptyPage(
  title: string,
  description: string,
  label: string,
  href: string,
) {
  return `<div class="empty-state"><span class="empty-icon">${icon("BookOpen")}</span><h1>${title}</h1><p>${description}</p><a href="${href}" class="btn primary">${label} ${icon("ArrowRight")}</a></div>`;
}
function dictionaryPage() {
  const words = Object.values(progress.cards)
    .filter((c) => c.kind === "word")
    .flatMap((card) => {
      const l = lessonById(card.lessonId);
      const w = l?.words.find((w) => w.id === card.itemId);
      return l && w ? [{ card, l, w, c: courseById(l.courseId) }] : [];
    })
    .filter(
      (x) =>
        (dictionaryFilter === "all" || x.c.id === dictionaryFilter) &&
        `${x.w.text} ${x.w.translation}`
          .toLocaleLowerCase("ru")
          .includes(query.toLocaleLowerCase("ru")),
    );
  return `${pageTitle(ui("СЛОВА С КОНТЕКСТОМ"), ui("Ваш маленький большой словарь."), ui("Здесь появляются слова из завершённых уроков. Возвращайтесь к ним в новых фразах."))}<div class="dictionary-tools"><label class="search-field">${icon("Search")}<input id="dictionary-search" type="search" value="${esc(query)}" placeholder="${ui("Найти слово или перевод")}" aria-label="${ui("Найти слово или перевод")}"></label><select id="dictionary-filter" aria-label="${ui("Язык словаря")}"><option value="all">${ui("Все языки")}</option>${courses
    .filter((c) => c.kind === "modern")
    .map(
      (c) =>
        `<option value="${c.id}" ${dictionaryFilter === c.id ? "selected" : ""}>${c.title}</option>`,
    )
    .join(
      "",
    )}</select></div>${words.length ? `<div class="word-grid">${words.map(({ card, l, w, c }) => `<article class="panel word-card"><div class="section-heading">${badge(c.short)}<span class="micro">${card.reviews ? `${ui("Повторений")}: ${card.reviews}` : ui("Новое слово")}</span></div><h2>${langText(w.text, c)}</h2><p>${esc(w.translation)}</p><div class="word-example">${langText(w.example, c)}</div><div class="word-foot"><a href="#course/${c.id}" class="micro">${esc(l.title)}</a><span class="micro">${card.due <= Date.now() ? ui("Пора повторить") : `${ui("Повтор")}: ${new Date(card.due).toLocaleDateString("ru")}`}</span></div><span class="draft-label">${ui("Перевод ожидает редакторской проверки")}</span></article>`).join("")}</div>` : emptyPage(query ? ui("Ничего не найдено") : ui("Здесь появятся ваши слова"), query ? ui("Попробуйте другой запрос или выберите все языки.") : ui("Завершите первый урок — новые слова сохранятся вместе с примерами."), ui("К обучению"), "#home")}`;
}
function reviewExercise() {
  const card = reviewQueue[reviewIndex];
  const l = card && lessonById(card.lessonId);
  if (!card || !l) return null;
  const c = courseById(l.courseId);
  if (card.kind === "error") {
    const e = l.exercises.find((e) => e.id === card.itemId);
    return e ? { card, l, c, e } : null;
  }
  const w = l.words.find((w) => w.id === card.itemId);
  if (!w) return null;
  const e: Exercise = {
    id: `review-${w.id}`,
    type: "input",
    skill: ui("Активный словарь"),
    prompt: `${ui("Напишите на изучаемом языке")}: «${w.translation}».`,
    answers: [w.text],
    explanation: `${ui("Вариант")}: ${w.text}. ${ui("Пример употребления")}: ${w.example}`,
    hint: ui("Вспомните слово или выражение целиком."),
  };
  return { card, l, c, e };
}
function reviewPage() {
  if (reviewStarted) {
    if (reviewIndex >= reviewQueue.length)
      return `<div class="result-wrap"><div class="result-icon">${icon("CheckCheck")}</div><h1>${ui("Повторение завершено")}</h1><p>${reviewDone} ${ui("из")} ${reviewQueue.length} ${ui("ответов верны самостоятельно.")}</p><div class="notice neutral">${icon("CalendarDays")}<p>${ui("Верные ответы вернутся через 1, 3, 7, 14 и 30 дней. Ошибки — через 10 минут. Срок зависит от ваших предыдущих результатов.")}</p></div><a href="#home" class="btn primary">${ui("К обучению")} ${icon("ArrowRight")}</a></div>`;
    const current = reviewExercise();
    if (!current)
      return emptyPage(
        ui("Материал изменился"),
        ui("Эта карточка больше недоступна. Начните новую сессию."),
        ui("К обучению"),
        "#home",
      );
    return `<a href="#home" class="back-link">${icon("ArrowLeft")} ${ui("Завершить повторение")}</a><div class="lesson-progress-head"><span>${ui("Повторение")} ${reviewIndex + 1} ${ui("из")} ${reviewQueue.length}</span>${badge(current.card.kind === "error" ? ui("Разбор ошибки") : ui("Словарь"), "sage")}</div><div class="progress-track lesson-track"><span style="width:${(reviewIndex / reviewQueue.length) * 100}%"></span></div><section class="panel exercise-panel review-exercise">${exerciseContent(current.e, current.c, currentFeedback)}</section>`;
  }
  const due = dueCards(progress);
  const future = Object.values(progress.cards)
    .filter((c) => c.due > Date.now())
    .sort((a, b) => a.due - b.due);
  return `${pageTitle(ui("ВСПОМНИТЬ, ЧТОБЫ ЗАПОМНИТЬ"), ui("Знакомое становится своим."), ui("Короткое повторение помогает удержать слова и разобраться с ошибками."))}<div class="review-overview"><section class="panel review-start"><span class="result-icon small-result">${icon("RotateCcw")}</span><h2>${due.length ? `${due.length} ${ui("заданий ждут вас")}` : ui("На сегодня всё спокойно")}</h2><p>${due.length ? ui("Ошибки из уроков и слова, которые пора вспомнить. Одна небольшая сессия — и ещё немного уверенности.") : Object.keys(progress.cards).length ? ui("Слова уже в расписании. Отдохните или продолжите обучение.") : ui("Завершите урок, чтобы создать личное расписание повторений.")}</p>${due.length ? button(`${ui("Начать повторение")} ${icon("ArrowRight")}`, "start-review") : ui('<a href="#home" class="btn primary">Продолжить обучение</a>')}${future[0] ? `<p class="micro">${ui("Ближайшее повторение")}: ${new Date(future[0].due).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}</p>` : ""}</section><section class="panel"><h2>${ui("Почему именно эти задания?")}</h2><div class="review-reason">${icon("RotateCcw")}<div><strong>${ui("Ошибки возвращаются раньше")}</strong><p>${ui("Сразу после урока, затем через 10 минут при повторной ошибке.")}</p></div></div><div class="review-reason">${icon("CalendarDays")}<div><strong>${ui("Знакомые слова — с интервалами")}</strong><p>${ui("Сначала через день. Верные ответы постепенно увеличивают промежуток.")}</p></div></div><div class="review-reason">${icon("ShieldCheck")}<div><strong>${ui("Без фиктивного освоения")}</strong><p>${ui("Устная практика и подсказки не увеличивают балл самостоятельных ответов.")}</p></div></div></section></div>`;
}
function statsPage() {
  const completed = new Set(progress.results.map((r) => r.lessonId)).size;
  const all = progress.results
    .flatMap((r) => r.attempts)
    .filter((a) => a.correct !== null && !a.assisted);
  return `${pageTitle(ui("ПРОГРЕСС БЕЗ СПЕШКИ"), ui("Смотрите, что уже получается."), ui("Результаты практики помогают выбрать следующий шаг. Это не сертификат языкового уровня."))}<div class="summary-cards"><div class="panel"><span>${ui("Разных уроков пройдено")}</span><strong>${completed}<small> / ${lessons.length} ${ui("доступных")}</small></strong></div><div class="panel"><span>${ui("Самостоятельных ответов")}</span><strong>${all.length}</strong></div><div class="panel"><span>${ui("Верных ответов")}</span><strong>${all.filter((a) => a.correct).length}<small> ${ui("из")} ${all.length}</small></strong></div></div><div class="stats-course-grid">${courses
    .filter((c) => c.kind === "modern")
    .map(
      (c) =>
        `<section class="panel stats-course"><div class="section-heading"><h2>${courseFlag(c)} ${c.title}</h2><a href="#course/${c.id}" class="text-link">${ui("Карта")} ${icon("ArrowRight")}</a></div><p>${practicedCount(c)} ${ui("из")} ${availableCount(c)} ${ui("доступных уроков пройдено · полный уровень ещё не опубликован.")}</p>${
          courseLessons(c)
            .filter((l) => hasPracticed(progress, l.id))
            .map(
              (l) =>
                `<h3>${l.title}</h3>${skillSummary(progress, l)
                  .map(
                    (s) =>
                      `<div class="skill-row"><strong>${s.skill}</strong>${badge(s.label, "sage")}</div>`,
                  )
                  .join(
                    "",
                  )}<a class="text-link small" href="#result/${l.id}">${ui("Последний результат")} ${icon("ArrowRight")}</a>`,
            )
            .join("") ||
          ui(
            '<div class="empty-inline">Начните с первого урока — здесь появятся навыки.</div>',
          )
        }</section>`,
    )
    .join("")}</div>`;
}
function settingsPage() {
  return `${pageTitle(ui("ВАШ ТЕМП И ВАШИ ДАННЫЕ"), ui("Настроим пространство."), ui("Простые настройки, чтобы учиться было удобно."))}<div class="settings-grid"><section class="panel settings-panel"><h2>${icon("Target")} ${ui("Ежедневная цель")}</h2><p>${ui("Это личный ориентир. Пропущенный день не обнуляет ваши знания.")}</p><label for="daily-goal">${ui("Минут в день")}</label><select id="daily-goal">${[5, 10, 15, 20, 30, 45, 60].map((v) => `<option value="${v}" ${v === progress.dailyGoal ? "selected" : ""}>${v} ${ui("минут")}</option>`).join("")}</select><h2>${icon("Languages")} ${ui("Язык интерфейса")}</h2><label for="ui-language">${ui("Доступный язык")}</label><select id="ui-language"><option>${ui("Русский")}</option></select><p class="micro">${ui("Казахская локализация запланирована. Словарь интерфейса хранится отдельно от учебного контента.")}</p></section><section class="panel settings-panel"><h2>${icon("ShieldCheck")} ${ui("Ваш прогресс")}</h2><p>${ui("Хранится в этом браузере. Очистка данных браузера удалит его. Между устройствами прогресс пока не синхронизируется.")}</p><div class="backup-actions">${button(`${icon("Download")} ${ui("Выгрузить копию")}`, "export", "secondary")}<label class="btn ghost upload" tabindex="0" role="button">${icon("Upload")} ${ui("Восстановить из файла")}<input id="import-file" type="file" accept="application/json,.json" hidden></label></div><p class="micro">${ui("При восстановлении текущий прогресс заменяется. Сначала сохраните резервную копию. Файл проверяется по схеме версии 1.")}</p><div id="import-message" role="status"></div></section><section class="panel settings-panel wide"><h2>${icon("Info")} ${ui("О первой версии")}</h2><p>Tilra ${ui("для взрослых · интерфейс на русском · стартовый рынок — Казахстан. Доступны только стартовые уроки. Цели A1/A2 ещё не покрыты полной программой. Оценка произношения и экспертная оценка свободной речи пока отсутствуют.")}</p><p>${ui("Все опубликованные здесь учебные примеры — черновики для ознакомительной практики. Английские и турецкие тексты ожидают редактора, арабские — специалиста по языку. Коранические тексты и записи не опубликованы.")}</p></section></div>`;
}
function render() {
  let content = "";
  const [page, id] = route.split("/");
  switch (page) {
    case "home":
      content = dashboard();
      break;
    case "courses":
      content = allCourses();
      break;
    case "course":
      content = coursePage(id);
      break;
    case "lesson":
      content = lessonPage(id);
      break;
    case "result":
      content = resultPage(id);
      break;
    case "dictionary":
      content = dictionaryPage();
      break;
    case "review":
      content = reviewPage();
      break;
    case "stats":
      content = statsPage();
      break;
    case "settings":
      content = settingsPage();
      break;
    default:
      content = emptyPage(
        ui("Страница не найдена"),
        ui("Выберите раздел в меню."),
        ui("Моё обучение"),
        "#home",
      );
  }
  $.innerHTML = `${sidebar()}${menu ? ui('<button class="menu-backdrop" data-action="menu" aria-label="Закрыть меню"></button>') : ""}<div class="app-shell">${topbar()}<main id="main" tabindex="-1">${storageError ? `<div class="notice amber" role="alert">${icon("Info")}<div><strong>${ui("Сохранение требует внимания")}</strong><p>${esc(storageError)}</p><a href="#settings">${ui("Открыть резервные копии")}</a></div></div>` : ""}${content}<footer><span>tilra<span class="brand-dot">.</span></span><span>${ui("Учитесь для жизни, а не для галочки.")}</span><span>${ui("Ранняя версия · материалы на проверке")}</span></footer></main></div>`;
  createIcons({ icons: iconSet, attrs: { "stroke-width": 1.7 } });
  document.title = `Tilra — ${page === "home" ? ui("языки для жизни") : page === "lesson" ? ui("практика") : page === "dictionary" ? ui("мой словарь") : ui("ваше обучение")}`;
}
function activeExercise() {
  if (route === "review") return reviewExercise();
  const l = currentLesson();
  if (!l || !progress.session || progress.session.step === 0) return null;
  return {
    e: l.exercises[progress.session.step - 1],
    l,
    c: courseById(l.courseId),
  };
}
function inlineError(message: string) {
  const el = document.querySelector("#inline-message");
  if (el)
    el.innerHTML = `<p class="form-error" role="alert">${esc(message)}</p>`;
}
function submitAnswer() {
  const current = activeExercise();
  if (!current) return;
  const { e, c } = current;
  if (route === "review" && currentFeedback) return;
  const existing = progress.session?.attempts.find(
    (a) => a.exerciseId === e.id,
  );
  if (route !== "review" && existing) return;
  if (e.type === "input" || e.type === "free")
    answer = (
      document.querySelector<HTMLInputElement>("#answer")?.value ?? ""
    ).trim();
  if (e.type === "order") answer = selected.map((i) => e.tokens[i]).join(" ");
  if (e.type === "speak") answer = ui("Устная практика · самопроверка");
  if (!answer.trim()) {
    inlineError(ui("Сначала добавьте свой ответ."));
    return;
  }
  if (e.type === "order" && selected.length !== e.tokens.length) {
    inlineError(ui("Используйте все слова."));
    return;
  }
  if (e.type === "listen" && !heard && !assisted) {
    inlineError(
      ui(
        "Сначала послушайте фразу. Если озвучка недоступна, откройте текст — ответ сохранится с подсказкой.",
      ),
    );
    return;
  }
  if ((e.type === "free" || e.type === "speak") && !showSample) {
    inlineError(ui("Сначала сравните ответ с образцом."));
    return;
  }
  const a: Attempt = {
    exerciseId: e.id,
    correct: checkAnswer(e, answer, c.language),
    answer,
    assisted,
    at: Date.now(),
  };
  if (route === "review") {
    const card = reviewQueue[reviewIndex];
    const correct = a.correct === true && !assisted;
    if (correct) reviewDone++;
    update((p) => ({
      ...p,
      cards: {
        ...p.cards,
        [card.id]: reviewCard(p.cards[card.id] ?? card, correct),
      },
    }));
    currentFeedback = a;
  } else
    update((p) => ({
      ...p,
      session: p.session
        ? { ...p.session, attempts: [...p.session.attempts, a] }
        : null,
    }));
  render();
  document
    .querySelector(".feedback")
    ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  document
    .querySelector<HTMLElement>('[data-action="next-exercise"]')
    ?.focus({ preventScroll: true });
}
async function listenTo(e: Exercise, c: Course) {
  if (e.type !== "listen") return;
  const epoch = audioEpoch;
  if (!("speechSynthesis" in window)) {
    audioNotice = ui(
      "Синтез речи в браузере недоступен. Можно открыть текст и выполнить задание с подсказкой.",
    );
    render();
    return;
  }
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang.toLowerCase().startsWith(c.language));
  if (!voice) {
    audioNotice = ui(
      "Голос для этого языка не найден на устройстве. Установите языковой голос в системе или используйте текст с подсказкой.",
    );
    render();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(e.text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.rate = 0.85;
  audioNotice = ui("Воспроизводится синтезированная речь…");
  render();
  utterance.onend = () => {
    if (epoch !== audioEpoch) return;
    heard = true;
    audioNotice = ui("Фраза прослушана. Можно выбрать ответ.");
    render();
  };
  utterance.onerror = () => {
    if (epoch !== audioEpoch) return;
    heard = false;
    audioNotice = ui(
      "Озвучка не запустилась. Попробуйте ещё раз или откройте текст с подсказкой.",
    );
    render();
  };
  window.speechSynthesis.speak(utterance);
}
async function startRecording() {
  const epoch = audioEpoch;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    micNotice = ui(
      "Запись не поддерживается этим браузером. Выполните упражнение вслух без записи.",
    );
    render();
    return;
  }
  try {
    const activeStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    if (epoch !== audioEpoch) {
      activeStream.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = activeStream;
    const activeRecorder = new MediaRecorder(activeStream);
    recorder = activeRecorder;
    const chunks: BlobPart[] = [];
    activeRecorder.ondataavailable = (e) => chunks.push(e.data);
    activeRecorder.onstop = () => {
      activeStream.getTracks().forEach((t) => t.stop());
      if (epoch !== audioEpoch) return;
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      recordingUrl = URL.createObjectURL(
        new Blob(chunks, { type: activeRecorder.mimeType || "audio/webm" }),
      );
      stream = null;
      recording = false;
      render();
    };
    activeRecorder.start();
    recording = true;
    micNotice = ui(
      "Идёт запись. Нажмите «Остановить запись», когда закончите.",
    );
    render();
  } catch {
    if (epoch !== audioEpoch) return;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    micNotice = ui(
      "Нет доступа к микрофону. Разрешите его в браузере или выполните упражнение вслух без записи.",
    );
    render();
  }
}
document.addEventListener("submit", (e) => {
  if ((e.target as HTMLElement).id === "answer-form") {
    e.preventDefault();
    submitAnswer();
  }
});
document.addEventListener("input", (e) => {
  const target = e.target as HTMLInputElement;
  if (target.id === "answer") answer = target.value;
  if (target.id === "dictionary-search") {
    query = target.value;
    const start = target.selectionStart;
    render();
    const input =
      document.querySelector<HTMLInputElement>("#dictionary-search");
    input?.focus();
    try {
      input?.setSelectionRange(start, start);
    } catch {}
  }
});
document.addEventListener("change", async (e) => {
  const target = e.target as HTMLInputElement;
  if (target.id === "daily-goal") {
    update((p) => ({ ...p, dailyGoal: Number(target.value) }));
    render();
  }
  if (target.id === "dictionary-filter") {
    dictionaryFilter = target.value;
    render();
  }
  if (target.id === "import-file" && target.files?.[0]) {
    const el = document.querySelector("#import-message");
    try {
      const file = target.files[0];
      if (file.size > 5_000_000)
        throw new Error(ui("Файл слишком большой (максимум 5 МБ)."));
      const parsed = progressSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success)
        throw new Error(
          ui("Формат резервной копии не подходит. Нужен файл Tilra версии 1."),
        );
      if (
        !confirm(
          ui(
            "Заменить прогресс на этом устройстве данными из файла? Текущий прогресс будет заменён.",
          ),
        )
      )
        return;
      const error = saveProgress(browserStorage, parsed.data);
      if (error) throw new Error(error);
      progress = parsed.data;
      storageLocked = false;
      storageError = "";
      resetExercise();
      render();
      const msg = document.querySelector("#import-message");
      if (msg) msg.textContent = ui("Прогресс восстановлен.");
    } catch (error) {
      if (el)
        el.textContent =
          error instanceof Error
            ? error.message
            : ui("Не удалось прочитать файл.");
    }
  }
});
document.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest<HTMLElement>(
    "[data-action]",
  );
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id ?? "";
  switch (action) {
    case "menu":
      menu = !menu;
      render();
      document
        .querySelector<HTMLElement>(menu ? ".sidebar a" : ".mobile-menu")
        ?.focus();
      break;
    case "select-course":
      update((p) => ({ ...p, courseId: id }));
      go(`course/${id}`);
      break;
    case "start-lesson":
      startLesson(id);
      break;
    case "begin-practice":
      update((p) => ({
        ...p,
        session: p.session ? { ...p.session, step: 1 } : null,
      }));
      resetExercise();
      render();
      document.querySelector("#main")?.scrollIntoView();
      break;
    case "choose":
      answer = target.dataset.index ?? "";
      render();
      document
        .querySelector<HTMLElement>("[role=radio][aria-checked=true]")
        ?.focus();
      break;
    case "token": {
      const current = activeExercise();
      if (current?.e.type === "order") {
        selected.push(Number(target.dataset.index));
        answer = selected
          .map((i) => (current.e.type === "order" ? current.e.tokens[i] : ""))
          .join(" ");
        render();
      }
      break;
    }
    case "remove-token":
      selected.splice(Number(target.dataset.index), 1);
      render();
      break;
    case "letter": {
      const input = document.querySelector<HTMLInputElement>("#answer");
      if (input) {
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? start;
        const letter = target.dataset.letter ?? "";
        input.value =
          input.value.slice(0, start) + letter + input.value.slice(end);
        answer = input.value;
        input.focus();
        input.setSelectionRange(start + letter.length, start + letter.length);
      }
      break;
    }
    case "check":
      e.preventDefault();
      submitAnswer();
      break;
    case "sample":
      if (activeExercise()?.e.type === "free" && !answer.trim()) {
        inlineError(
          ui("Сначала напишите свой вариант. Затем сравните его с образцом."),
        );
        break;
      }
      showSample = true;
      render();
      break;
    case "listen": {
      const current = activeExercise();
      if (current) void listenTo(current.e, current.c);
      break;
    }
    case "transcript":
      assisted = true;
      break;
    case "record":
      void startRecording();
      break;
    case "stop-recording":
      stopRecording();
      break;
    case "next-exercise": {
      if (route === "review") {
        reviewIndex++;
        resetExercise();
        render();
        window.scrollTo(0, 0);
        break;
      }
      const l = currentLesson();
      const session = progress.session;
      if (!l || !session) return;
      if (session.step >= l.exercises.length) {
        update((p) => finishLesson(p, l, session.attempts));
        resetExercise();
        go(`result/${l.id}`);
      } else {
        update((p) => ({
          ...p,
          session: p.session
            ? { ...p.session, step: p.session.step + 1 }
            : null,
        }));
        resetExercise();
        render();
        document.querySelector("#main")?.scrollIntoView();
      }
      break;
    }
    case "restart":
      update((p) => ({
        ...p,
        session: null,
        drafts: Object.fromEntries(
          Object.entries(p.drafts).filter(([key]) => key !== id),
        ),
      }));
      startLesson(id);
      break;
    case "start-review":
      reviewQueue = dueCards(progress)
        .filter((card) => {
          const l = lessonById(card.lessonId);
          return (
            l &&
            (card.kind === "word"
              ? l.words.some((w) => w.id === card.itemId)
              : l.exercises.some((e) => e.id === card.itemId))
          );
        })
        .slice(0, 15);
      reviewIndex = 0;
      reviewDone = 0;
      reviewStarted = true;
      resetExercise();
      render();
      break;
    case "export": {
      let data = JSON.stringify(progress, null, 2);
      const url = URL.createObjectURL(
        new Blob([data], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `tilra-progress-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      break;
    }
  }
});
window.addEventListener("hashchange", () => {
  route = location.hash.slice(1) || "home";
  menu = false;
  resetExercise();
  if (route !== "review") {
    reviewStarted = false;
    reviewQueue = [];
  }
  if (route.startsWith("course/")) {
    const id = route.split("/")[1];
    if (courses.some((c) => c.id === id))
      update((p) => ({ ...p, courseId: id }));
  }
  render();
  window.scrollTo(0, 0);
  document.querySelector<HTMLElement>("#main")?.focus({ preventScroll: true });
});
window.addEventListener("storage", (e) => {
  if (e.key === KEY) {
    const latest = loadProgress(browserStorage);
    if (!latest.error) {
      progress = latest.data;
      render();
    }
  }
});
window.addEventListener("beforeunload", () => {
  stopRecording();
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
});
render();
document.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;
  if (
    target.matches('[role="radio"]') &&
    ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.key)
  ) {
    const options = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[role="radio"]:not(:disabled)',
      ),
    ];
    const direction =
      event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    const index =
      (options.indexOf(target as HTMLButtonElement) +
        direction +
        options.length) %
      options.length;
    event.preventDefault();
    options[index]?.click();
  }
  if (
    target.matches(".upload") &&
    (event.key === "Enter" || event.key === " ")
  ) {
    event.preventDefault();
    document.querySelector<HTMLInputElement>("#import-file")?.click();
  }
  if (menu && event.key === "Escape") {
    menu = false;
    render();
    document.querySelector<HTMLElement>(".mobile-menu")?.focus();
  }
  if (menu && event.key === "Tab") {
    const items = [...document.querySelectorAll<HTMLElement>(".sidebar a")];
    const first = items[0];
    const last = items.at(-1);
    if (event.shiftKey && target === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && target === last) {
      event.preventDefault();
      first?.focus();
    }
  }
});
