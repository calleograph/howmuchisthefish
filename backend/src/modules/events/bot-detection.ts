/**
 * Классификация "подозрительно автоматических" событий (задание §2.5): многие
 * корпоративные почтовые шлюзы и антифишинговые сканеры автоматически открывают
 * письма и переходят по ссылкам до того, как это сделает реальный сотрудник —
 * из-за этого email_opened/link_clicked могут быть ложноположительными сигналами
 * "попался". Это не полная защита от спуфинга, а эвристика для аналитики —
 * помечает событие флагом isSuspiciousAutomated, не отбрасывает его.
 */

const KNOWN_SCANNER_UA_PATTERNS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /proofpoint/i,
  /mimecast/i,
  /symantec/i,
  /barracuda/i,
  /microsoft.*safelinks/i,
  /googlesecuritybot/i,
  /outlook.*preview/i,
  /^$/, // отсутствующий User-Agent — тоже подозрительно для перехода человеком
];

export function isLikelyAutomatedScanner(userAgent: string | null | undefined): boolean {
  const ua = userAgent ?? '';
  return KNOWN_SCANNER_UA_PATTERNS.some((pattern) => pattern.test(ua));
}
