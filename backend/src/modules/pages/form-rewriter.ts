/**
 * Убирает оригинальный action/method у тегов <form> в склонированном HTML
 * (граббер страниц, см. screenshot.service.ts clone()). Сама отправка формы
 * и так перехватывается на capture-фазе с preventDefault() в
 * safe-form-injector.ts (buildSafeFormScript/buildCapturingFormScript) —
 * это НЕ единственная защита, а дополнительный барьер: если по какой-то
 * причине наш JS не выполнился (блокировщик скриптов, ошибка загрузки),
 * форма со своим оригинальным action всё равно отправила бы данные
 * сотрудника на реальный внешний сайт вместо нашего трекинга.
 *
 * Простой regex на двух конкретных атрибутах — не полноценный HTML-парсер
 * (cheerio/jsdom), т.к. задача предельно узкая (один тег, два атрибута) и не
 * оправдывает добавление зависимости.
 */
export function rewriteFormsForCapture(html: string): string {
  return html.replace(/<form\b([^>]*)>/gi, (match, attrs: string) => {
    const withoutAction = attrs.replace(/\s+action\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '');
    const withoutMethod = withoutAction.replace(/\s+method\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '');
    return `<form${withoutMethod} action="" method="post">`;
  });
}
