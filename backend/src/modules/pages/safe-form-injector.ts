/**
 * ТРЕБОВАНИЕ БЕЗОПАСНОСТИ ПО УМОЛЧАНИЮ (ТЗ §5, §2.5, §3): значения, введённые
 * сотрудником в форму учебной страницы, по умолчанию НЕ должны попадать на
 * backend — ни в теле запроса, ни в логах, ни в диагностике, ни в резервной
 * копии. Это свойство механизма отправки для ОБЫЧНОЙ (безопасной) страницы:
 * скрипт buildSafeFormScript() перехватывает submit и ЯВНО НЕ ОБРАЩАЕТСЯ к
 * значениям полей формы вообще — ни через FormData(form), ни через
 * element.value. Он отправляет единственный фиксированный payload
 * {token, type}, независимый от того, что ввёл пользователь.
 *
 * ПЕРЕСМОТРЕНО в v0.3.0 (явный запрос владельца продукта — см.
 * docs/SECURITY.md "История решения о значениях форм"): если администратор
 * ЯВНО включил LandingPage.capturesCredentials для конкретной страницы (не
 * глобальная настройка), buildCapturingFormScript() ниже читает значения
 * полей и шлёт их на ОТДЕЛЬНЫЙ эндпоинт (/t/credential, не /t/event) —
 * backend немедленно шифрует их отдельным ключом (CREDENTIAL_ENCRYPTION_KEY,
 * не APP_MASTER_KEY) до сохранения, см. CryptoService.encryptCredential().
 * Это сознательный, явный opt-in за страницу — обычные учебные страницы
 * (capturesCredentials: false, по умолчанию) продолжают использовать
 * buildSafeFormScript() и сохраняют исходную гарантию без изменений.
 *
 * Токен (trackingToken) передаётся странице через query-параметр при переходе по
 * ссылке из письма — он identifies цель кампании, но сам не является ПДн и не
 * раскрывает, кто ввёл какие данные в форму.
 */
export function buildSafeFormScript(
  trackingToken: string,
  publicBaseUrl: string,
): string {
  // JSON.stringify для безопасной вставки токена в JS-литерал (защита от инъекции
  // через token, хотя сам токен генерируется сервером как uuid и не контролируется
  // пользователем — защита "на всякий случай", дешёвая и не помешает).
  const tokenLiteral = JSON.stringify(trackingToken);
  const eventsUrl = JSON.stringify(
    `${publicBaseUrl.replace(/\/$/, '')}/t/event`,
  );

  return `
<script>
(function () {
  var TRACKING_TOKEN = ${tokenLiteral};
  var EVENTS_URL = ${eventsUrl};

  function sendEvent(type) {
    try {
      // Fire-and-forget: сбой доставки события не должен ломать страницу для
      // сотрудника — это учебный материал, не критичная функциональность.
      fetch(EVENTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TRACKING_TOKEN, type: type }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  sendEvent('link_clicked');

  document.addEventListener('submit', function (event) {
    // НЕ читаем event.target как FormData и не обращаемся к .value полей —
    // намеренно, см. комментарий в safe-form-injector.ts. Отправляется только факт.
    event.preventDefault();
    sendEvent('form_submitted');
    var form = event.target;
    if (form && typeof form.reset === 'function') {
      form.reset();
    }
    var thankYou = document.getElementById('sap-thank-you');
    if (thankYou) thankYou.hidden = false;
  }, true);
})();
</script>`;
}

// Используется ТОЛЬКО когда LandingPage.capturesCredentials === true — явный,
// осознанный opt-in за конкретную страницу. Отдельная функция (не ветка
// внутри buildSafeFormScript) намеренно: читатель кода, ищущий "где именно
// мы читаем значения формы", находит единственное явное место, а не условие
// внутри "безопасной" функции.
export function buildCapturingFormScript(
  trackingToken: string,
  publicBaseUrl: string,
): string {
  const tokenLiteral = JSON.stringify(trackingToken);
  const eventsUrl = JSON.stringify(
    `${publicBaseUrl.replace(/\/$/, '')}/t/event`,
  );
  const credentialUrl = JSON.stringify(
    `${publicBaseUrl.replace(/\/$/, '')}/t/credential`,
  );

  return `
<script>
(function () {
  var TRACKING_TOKEN = ${tokenLiteral};
  var EVENTS_URL = ${eventsUrl};
  var CREDENTIAL_URL = ${credentialUrl};

  function sendEvent(type) {
    try {
      fetch(EVENTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TRACKING_TOKEN, type: type }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  sendEvent('link_clicked');

  document.addEventListener('submit', function (event) {
    event.preventDefault();
    var form = event.target;
    try {
      // Читаем поля формы ТОЛЬКО здесь — только для страниц с явно включённым
      // capturesCredentials. Пароли и прочие значения уходят на отдельный
      // эндпоинт (не /t/event) и шифруются backend-ом немедленно при приёме.
      var fields = [];
      if (form && form.elements) {
        for (var i = 0; i < form.elements.length; i++) {
          var el = form.elements[i];
          if (el.name && el.value && el.type !== 'submit' && el.type !== 'button') {
            fields.push({ name: el.name, value: el.value });
          }
        }
      }
      fetch(CREDENTIAL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TRACKING_TOKEN, fields: fields }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
    if (form && typeof form.reset === 'function') {
      form.reset();
    }
    var thankYou = document.getElementById('sap-thank-you');
    if (thankYou) thankYou.hidden = false;
  }, true);
})();
</script>`;
}
