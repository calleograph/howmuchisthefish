import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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
}
