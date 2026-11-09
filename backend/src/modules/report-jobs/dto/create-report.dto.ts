import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { REPORT_TYPES } from '../report-data.service';

export class CreateReportDto {
  @ApiProperty({ enum: REPORT_TYPES })
  @IsString()
  type!: string;

  @ApiProperty({ enum: ['csv', 'xlsx'] })
  @IsEnum(['csv', 'xlsx'] as const)
  format!: 'csv' | 'xlsx';

  @ApiPropertyOptional({ description: 'Раздел-специфичные параметры, напр. { since: ISO-дата }' })
  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}

export class PreviewReportDto {
  @ApiProperty({ enum: REPORT_TYPES })
  @IsString()
  type!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}
