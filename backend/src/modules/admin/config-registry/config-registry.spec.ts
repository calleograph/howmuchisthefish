import { readFileSync } from 'fs';
import { join } from 'path';
import { CONFIG_REGISTRY } from './config-registry';

/**
 * Guard-тест (практика из «Переговорки»): каждое поле schema.prisma, помеченное
 * комментарием @policy:*, должно иметь соответствующую запись в CONFIG_REGISTRY —
 * иначе при экспорте конфигурации новое секретное поле могло бы "случайно" попасть
 * в открытый вид или, наоборот, нужное поле не перенестись при восстановлении.
 */
describe('config registry соответствует schema.prisma', () => {
  const schemaPath = join(__dirname, '../../../../prisma/schema.prisma');
  const schema = readFileSync(schemaPath, 'utf8');

  // Извлекаем все строки вида "fieldName   Type   // @policy:xxx" внутри models.
  const modelBlocks = [...schema.matchAll(/model\s+(\w+)\s*{([^}]*)}/g)];

  it('находит хотя бы одну модель со @policy-аннотацией в схеме', () => {
    expect(modelBlocks.length).toBeGreaterThan(0);
  });

  for (const [, modelName, body] of modelBlocks) {
    const fieldLines = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.includes('@policy:'));

    for (const line of fieldLines) {
      const fieldMatch = line.match(/^(\w+)\s+/);
      const policyMatch = line.match(/@policy:(\w+)/);
      if (!fieldMatch || !policyMatch) continue;
      const fieldName = fieldMatch[1];
      const policy = policyMatch[1];

      it(`${modelName}.${fieldName} (@policy:${policy}) описан в CONFIG_REGISTRY`, () => {
        const entry = CONFIG_REGISTRY.find(
          (e) =>
            e.model === modelName && (e.field === fieldName || e.field === '*'),
        );
        expect(entry).toBeDefined();
        if (entry && entry.field === fieldName) {
          expect(entry.policy).toBe(policy);
        }
      });
    }
  }
});
