// A broken or interrupted module download must not leave the learner with a blank page.
import("./main").catch(() => {
  const app = document.querySelector("#app");
  if (app) {
    app.innerHTML =
      '<main style="max-width:600px;margin:12vh auto;padding:24px;font-family:system-ui;line-height:1.7;color:#264e3f"><h1>Не удалось открыть Tilra</h1><p>Проверьте соединение и обновите страницу. Сохранённый прогресс останется в браузере.</p><button id="reload" style="padding:12px 20px;background:#264e3f;color:white;border:0;border-radius:8px;cursor:pointer">Попробовать снова</button></main>';
    document
      .querySelector("#reload")
      ?.addEventListener("click", () => location.reload());
  }
});
