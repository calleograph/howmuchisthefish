import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum SegmentConditionDto {
  EMAIL_OPENED = 'EMAIL_OPENED',
  LINK_CLICKED = 'LINK_CLICKED',
  FORM_SUBMITTED = 'FORM_SUBMITTED',
  NOT_OPENED = 'NOT_OPENED',
}

// Таргетинг по результатам прошлой кампании — "кликнувшие в кампании X" без
// ручного экспорта-импорта CSV (эскалационный/адаптивный сценарий обучения).
export class SegmentTargetDto {
  @ApiProperty({ description: 'ID кампании-источника' })
  @IsUUID()
  sourceCampaignId!: string;

  @ApiProperty({ enum: SegmentConditionDto })
  @IsEnum(SegmentConditionDto)
  condition!: SegmentConditionDto;
}

export class RandomTargetDto {
  @ApiProperty({ description: 'Сколько случайных сотрудников выбрать' })
  @IsInt()
  @Min(1)
  @Max(10000)
  count!: number;

  @ApiPropertyOptional({ description: 'Ограничить выборку этой группой' })
  @IsOptional()
  @IsUUID()
  groupId?: string;
}

export class CreateCampaignDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty()
  @IsUUID()
  templateId!: string;

  @ApiProperty()
  @IsUUID()
  pageId!: string;

  @ApiProperty()
  @IsUUID()
  smtpConfigId!: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'ID сотрудников-получателей',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  employeeIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'ID групп-получателей' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  groupIds?: string[];

  @ApiPropertyOptional({ type: SegmentTargetDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentTargetDto)
  segment?: SegmentTargetDto;

  @ApiPropertyOptional({ type: RandomTargetDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RandomTargetDto)
  random?: RandomTargetDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  sendRateLimit?: number;

  @ApiPropertyOptional({
    type: [String],
    description: 'Если задано — получатели ограничены этими доменами',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedDomains?: string[];
}

export class UpdateCampaignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  pageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  smtpConfigId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  employeeIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  groupIds?: string[];

  @ApiPropertyOptional({ type: SegmentTargetDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentTargetDto)
  segment?: SegmentTargetDto;

  @ApiPropertyOptional({ type: RandomTargetDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RandomTargetDto)
  random?: RandomTargetDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  sendRateLimit?: number;
}

export class ScheduleCampaignDto {
  @ApiProperty({ description: 'ISO-дата/время запуска' })
  @IsDateString()
  scheduledAt!: string;
}

export class TestSendDto {
  @ApiProperty()
  @IsUUID()
  templateId!: string;

  @ApiProperty()
  @IsString()
  toAddress!: string;

  @ApiProperty()
  @IsUUID()
  smtpConfigId!: string;
}

export class BulkTargetsDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  employeeIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  groupIds?: string[];

  @ApiPropertyOptional({ type: SegmentTargetDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentTargetDto)
  segment?: SegmentTargetDto;

  @ApiPropertyOptional({ type: RandomTargetDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RandomTargetDto)
  random?: RandomTargetDto;
}
