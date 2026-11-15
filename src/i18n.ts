import { ru } from "./locales/ru";
// Interface copy is separate from curriculum. Add kk here and choose it in settings when translated.
export const messages = {
  ru: {
    appName: "Tilra",
    tagline: "Языки для жизни",
    home: "Моё обучение",
    courses: "Все направления",
    dictionary: "Мой словарь",
    review: "Повторение",
    stats: "Мой прогресс",
    settings: "Настройки",
    continue: "Продолжить обучение",
    check: "Проверить ответ",
    next: "Продолжить",
    draft: "Учебный черновик",
    planned: "В разработке",
    back: "Назад",
    local: "Прогресс на этом устройстве",
  },
};
export type Locale = keyof typeof messages;
export const t = (key: keyof typeof messages.ru, locale: Locale = "ru") =>
  messages[locale][key];
export const ui = (key: keyof typeof ru, locale: Locale = "ru"): string =>
  ({ ru })[locale][key];
