import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export enum CustomFieldTypeDto {
  STRING = 'STRING',
  NUMBER = 'NUMBER',
  BOOLEAN = 'BOOLEAN',
  ENUM = 'ENUM',
}

export class CreateCustomFieldDto {
  @ApiProperty({ description: 'Ключ в Employee.customFields, например "costCenter"' })
  @IsString()
  @MaxLength(100)
  key!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  label!: string;

  @ApiProperty({ enum: CustomFieldTypeDto })
  @IsEnum(CustomFieldTypeDto)
  type!: CustomFieldTypeDto;

  @ApiPropertyOptional({ type: [String], description: 'Варианты значений — только для типа ENUM' })
  @ValidateIf((o) => o.type === CustomFieldTypeDto.ENUM)
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  options?: string[];
}

export class UpdateCustomFieldDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];
}
