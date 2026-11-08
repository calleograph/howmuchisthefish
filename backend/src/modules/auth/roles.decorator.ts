import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Например: @Roles('ADMIN', 'EDITOR') на контроллере или методе. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
