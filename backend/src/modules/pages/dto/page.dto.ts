import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class CreatePageDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    description:
      'Публичный путь /lp/{slug} — только строчные латинские буквы, цифры, дефис',
  })
  @IsString()
  @Matches(SLUG_RE, { message: 'slug может содержать только a-z, 0-9 и дефис' })
  @MaxLength(100)
  slug!: string;

  @ApiProperty({ description: 'HTML учебной страницы' })
  @IsString()
  htmlSource!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  formEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Явный opt-in: сохранять зашифрованные значения полей формы для проверки факта компрометации. По умолчанию выключено.',
  })
  @IsOptional()
  @IsBoolean()
  capturesCredentials?: boolean;

  @ApiPropertyOptional({ description: 'Исходный URL, если страница получена граббером' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceUrl?: string;
}

export class UpdatePageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  htmlSource?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  formEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  capturesCredentials?: boolean;
}

export class CloneUrlDto {
  @ApiProperty({ description: 'URL страницы для клонирования (headless-рендер через screenshot-service)' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2000)
  url!: string;
}
