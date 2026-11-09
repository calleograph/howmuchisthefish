import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * ВАЖНО: это DTO намеренно не имеет полей для содержимого формы — используется
 * обычным (безопасным) путём /t/event. Любое поле, которое клиентский JS
 * попытался бы добавить (например пароль), будет отброшено
 * ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }) в main.ts —
 * второй уровень защиты поверх того, что безопасный скрипт (safe-form-injector.ts
 * buildSafeFormScript) вообще не читает значения полей. Для страниц с явно
 * включённым LandingPage.capturesCredentials используется ОТДЕЛЬНЫЙ путь
 * /t/credential с CredentialSubmitDto ниже — не этот DTO.
 */
export class TrackEventDto {
  @ApiProperty({
    description: 'trackingToken цели кампании (CampaignTarget.trackingToken)',
  })
  @IsString()
  @IsUUID()
  token!: string;

  @ApiProperty({ enum: ['link_clicked', 'form_submitted', 'reported_phishing'] })
  @IsIn(['link_clicked', 'form_submitted', 'reported_phishing'])
  type!: 'link_clicked' | 'form_submitted' | 'reported_phishing';
}

export class CredentialFieldDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  value!: string;
}

/**
 * Используется ТОЛЬКО эндпоинтом /t/credential (buildCapturingFormScript) —
 * страница с явно включённым capturesCredentials. Значения шифруются
 * немедленно при приёме (EventsService.recordCredentials →
 * CryptoService.encryptCredential), отдельным от APP_MASTER_KEY ключом.
 */
export class CredentialSubmitDto {
  @ApiProperty()
  @IsString()
  @IsUUID()
  token!: string;

  @ApiProperty({ type: [CredentialFieldDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CredentialFieldDto)
  fields!: CredentialFieldDto[];
}
