import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

// Доменное имя без схемы/порта/пути — www.example-org.co.uk и т.п.
// Умышленно не принимает голый IP или wildcard (*.example.com) — верификация
// владения через TXT-запись на уровне поддомена не имеет смысла для wildcard.
const HOSTNAME_PATTERN =
  /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

export class CreateDomainDto {
  @ApiProperty({ example: 'training.example-org.com' })
  @IsString()
  @MaxLength(253)
  @Matches(HOSTNAME_PATTERN, {
    message: 'Укажите домен без схемы/порта/пути, например example.com',
  })
  hostname!: string;
}
