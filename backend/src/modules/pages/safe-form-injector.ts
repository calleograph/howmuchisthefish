/**
 * КРИТИЧЕСКОЕ ТРЕБОВАНИЕ БЕЗОПАСНОСТИ (ТЗ §5, §2.5, §3): значения, введённые
 * сотрудником в форму учебной страницы, НИКОГДА не должны попасть на backend —
 * ни в теле запроса, ни в логах, ни в диагностике, ни в резервной копии.
 *
 * Это не правило бизнес-логики ("не сохранять поле X"), а свойство самого механизма
 * отправки: скрипт ниже перехватывает событие submit и ЯВНО НЕ ОБРАЩАЕТСЯ к значениям
 * полей формы вообще — ни через FormData(form), ни через element.value, ни через
 * serialize. Он отправляет единственный фиксированный payload {token, formId},
 * полностью независимый от того, что ввёл пользователь, и ПОДМЕНЯЕТ исходный submit
 * (preventDefault + не читает поля), так что даже если администратор organizации
 * добавит в HTML страницы дополнительные поля, их значения физически не попадают в
 * JS-переменную, которая формирует запрос.
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
