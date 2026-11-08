import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Помечает роут как не требующий JWT (например /auth/login, /health, публичные страницы). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
