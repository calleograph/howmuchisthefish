import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTemplateDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  subject!: string;

  @ApiProperty({ description: 'Исходник в формате MJML' })
  @IsString()
  mjmlSource!: string;

  @ApiPropertyOptional({
    description: 'Список переменных персонализации, например ["firstName", "lastName"]',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];
}

export class UpdateTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mjmlSource?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];
}

export class PreviewTemplateDto {
  @ApiPropertyOptional({
    description: 'Значения переменных для предпросмотра, например {"firstName": "Иван"}',
  })
  @IsOptional()
  sampleData?: Record<string, string>;
}
