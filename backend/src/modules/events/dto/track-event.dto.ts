import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID } from 'class-validator';

/**
 * ВАЖНО: это DTO намеренно не имеет полей для содержимого формы. Любое поле,
 * которое клиентский JS попытался бы добавить (например пароль), будет отброшено
 * ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }) в main.ts —
 * второй уровень защиты поверх того, что безопасный скрипт (safe-form-injector.ts)
 * вообще не читает значения полей.
 */
export class TrackEventDto {
  @ApiProperty({ description: 'trackingToken цели кампании (CampaignTarget.trackingToken)' })
  @IsString()
  @IsUUID()
  token!: string;

  @ApiProperty({ enum: ['link_clicked', 'form_submitted'] })
  @IsIn(['link_clicked', 'form_submitted'])
  type!: 'link_clicked' | 'form_submitted';
}
