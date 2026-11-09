import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

// "restore" намеренно отсутствует здесь — updater.sh сам отклоняет его с
// явным сообщением ("требует ручного вызова scripts/restore.sh"), не через
// очередь — восстановление из резервной копии слишком рискованная операция
// для one-click кнопки без явного выбора конкретного файла архива.
export const UPDATE_ACTIONS = ['check', 'update', 'backup'] as const;

export class RequestUpdateActionDto {
  @ApiProperty({ enum: UPDATE_ACTIONS })
  @IsIn(UPDATE_ACTIONS)
  action!: (typeof UPDATE_ACTIONS)[number];
}
