/**
 * Сбрасывает пароль существующего пользователя (обычно администратора,
 * если пароль утерян и восстановить его иначе нельзя — почты в системе
 * нет, UI недоступен). Запуск:
 *   docker compose exec -e RESET_EMAIL=admin@example.local \
 *     -e RESET_PASSWORD='НовыйПароль123!' backend npm run reset-admin-password
 *
 * В отличие от seed.js (создаёт администратора, только если его ещё нет),
 * этот скрипт требует, чтобы пользователь уже существовал, и падает с
 * понятной ошибкой, если это не так — иначе было бы слишком легко случайно
 * завести второго пользователя с тем же email под видом "сброса".
 *
 * Обычный JS, не TypeScript — тот же повод, что и у seed.js: production-образ
 * ставится через `npm ci --omit=dev`, без ts-node.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const email = process.env.RESET_EMAIL;
  const password = process.env.RESET_PASSWORD;

  if (!email || !password) {
    console.error('Укажите RESET_EMAIL и RESET_PASSWORD через переменные окружения.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('RESET_PASSWORD должен быть не короче 8 символов.');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    console.error(`Пользователь ${email} не найден — сброс пароля невозможен.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { email }, data: { passwordHash } });
  console.log(`Пароль пользователя ${email} сброшен.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
