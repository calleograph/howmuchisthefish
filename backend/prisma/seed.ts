/**
 * Создаёт первого администратора. Используется:
 *  - в разработке: `npm run seed`
 *  - установщиком (scripts/install.sh) при первом запуске на чистом сервере —
 *    пароль передаётся через переменные окружения и печатается ТОЛЬКО в /dev/tty,
 *    никогда в файл или лог (см. docs/INSTALL.md).
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

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
