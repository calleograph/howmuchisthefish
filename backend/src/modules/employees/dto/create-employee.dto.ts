import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEmployeeDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  lastName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  position?: string;

  @ApiPropertyOptional({
    description: 'Значения доп. полей, ключи — из CustomFieldDef.key',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}
