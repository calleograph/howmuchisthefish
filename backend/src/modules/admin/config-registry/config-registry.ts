/**
 * Реестр политики переноса для резервного копирования/восстановления конфигурации
 * (задание §6, практика перенята из «Переговорки»: явная политика на каждое поле вместо
 * того, чтобы разработчик мог случайно забыть описать новое секретное поле).
 *
 * Политики:
 *  - data   — переносится как есть при экспорте/импорте конфигурации
 *  - secret — переносится зашифрованным (значение никогда не показывается в открытом виде
 *             при экспорте; для восстановления на новом сервере нужен тот же APP_MASTER_KEY)
 *  - hash   — переносится как хэш: продолжает работать после восстановления, но исходное
 *             значение не восстанавливается (пример: passwordHash пользователя)
 *  - reset  — не переносится вообще; после восстановления поле нужно настроить заново
 *
 * test/config-registry.spec.ts проверяет, что каждое поле модели Prisma, помеченное
 * комментарием @policy:* в schema.prisma, имеет соответствующую запись здесь — и наоборот.
 * Новое поле без записи в реестре = тест падает. Это умышленно: секрет не должен "случайно"
 * попасть в открытый экспорт конфигурации только потому, что про него забыли.
 */

export type ConfigFieldPolicy = 'data' | 'secret' | 'hash' | 'reset';

export interface ConfigFieldEntry {
  model: string;
  field: string;
  policy: ConfigFieldPolicy;
}

export const CONFIG_REGISTRY: ConfigFieldEntry[] = [
  // User
  { model: 'User', field: 'email', policy: 'data' },
  { model: 'User', field: 'passwordHash', policy: 'hash' },
  { model: 'User', field: 'firstName', policy: 'data' },
  { model: 'User', field: 'lastName', policy: 'data' },
  { model: 'User', field: 'role', policy: 'data' },
  { model: 'User', field: 'mfaEnabled', policy: 'data' },
  { model: 'User', field: 'mfaSecret', policy: 'secret' },

  // SmtpConfig
  { model: 'SmtpConfig', field: 'name', policy: 'data' },
  { model: 'SmtpConfig', field: 'host', policy: 'data' },
  { model: 'SmtpConfig', field: 'port', policy: 'data' },
  { model: 'SmtpConfig', field: 'secure', policy: 'data' },
  { model: 'SmtpConfig', field: 'username', policy: 'data' },
  { model: 'SmtpConfig', field: 'passwordEnc', policy: 'secret' },
  { model: 'SmtpConfig', field: 'fromAddress', policy: 'data' },

  // Employee / Group / MailTemplate / LandingPage / Campaign — все поля policy:data,
  // перечислены по модели для простоты (детальный список — в schema.prisma комментариях).
  { model: 'Employee', field: '*', policy: 'data' },
  { model: 'Group', field: '*', policy: 'data' },
  { model: 'MailTemplate', field: '*', policy: 'data' },
  { model: 'LandingPage', field: '*', policy: 'data' },
  { model: 'Domain', field: '*', policy: 'data' }, // verificationToken не секрет — публичная DNS-запись
  { model: 'Campaign', field: '*', policy: 'data' },
  { model: 'CampaignTarget', field: '*', policy: 'data' },
  { model: 'CampaignEvent', field: '*', policy: 'data' },
  { model: 'AuditLog', field: '*', policy: 'data' },
  { model: 'EmployeeHistory', field: '*', policy: 'data' },
  { model: 'Setting', field: '*', policy: 'data' }, // политика по конкретному key — см. SETTINGS_POLICY ниже
  { model: 'Backup', field: '*', policy: 'data' }, // сама запись о бэкапе, не его содержимое
  { model: 'CustomFieldDef', field: '*', policy: 'data' }, // схема доп. полей сотрудников — не их значения

  // CapturedCredential — зашифрован отдельным от APP_MASTER_KEY ключом
  // (CREDENTIAL_ENCRYPTION_KEY, см. CryptoService), поэтому НЕ @policy:secret
  // в обычном смысле (export/import через config-registry работает с
  // APP_MASTER_KEY-шифрованием). Явная политика 'reset' для valueEnc: при
  // восстановлении из бэкапа на другом сервере без исходного
  // CREDENTIAL_ENCRYPTION_KEY значение всё равно не расшифровать — честнее
  // пометить как не переносимое, чем притворяться 'secret'.
  { model: 'CapturedCredential', field: 'fieldName', policy: 'data' },
  { model: 'CapturedCredential', field: 'valueEnc', policy: 'reset' },
  { model: 'CapturedCredential', field: 'valueHash', policy: 'hash' },
];

/**
 * Настройки (Setting key/value) имеют собственную политику по ключу, так как набор
 * ключей расширяемый и не фиксирован схемой. Любой новый ключ по умолчанию 'reset'
 * (безопасный выбор) — чтобы явно включить перенос, нужно явно прописать его здесь.
 */
export const SETTINGS_POLICY: Record<string, ConfigFieldPolicy> = {
  'app.name': 'data',
  'app.timezone': 'data',
  'app.locale': 'data',
  'oidc.issuerUrl': 'data',
  'oidc.clientId': 'data',
  'oidc.clientSecret': 'secret',
  'saml.idpMetadataUrl': 'data',
  'retention.eventsDays': 'data',
  'retention.auditLogDays': 'data',
};

export function getSettingPolicy(key: string): ConfigFieldPolicy {
  return SETTINGS_POLICY[key] ?? 'reset';
}
