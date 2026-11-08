/**
 * Создаёт первого администратора. Используется:
 *  - в разработке: `npm run seed`
 *  - установщиком (scripts/install.sh) в production-контейнере —
 *    пароль передаётся через переменные окружения и печатается ТОЛЬКО
 *    вызывающей стороной в /dev/tty, никогда в файл или лог (см. docs/INSTALL.md).
 *
 * Обычный JS, не TypeScript: production-образ ставится через
 * `npm ci --omit=dev` (без ts-node) — компилировать отдельный скрипт вне
 * общего `nest build` pipeline ради него одного не стоит усложнения.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Администратор ${email} уже существует, пропускаю.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'ADMIN',
    },
  });
  console.log(`Создан администратор: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
