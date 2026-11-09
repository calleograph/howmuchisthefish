import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PURGE_TARGETS, PurgeTarget } from './purge-old-records.dto';

export class PurgePreviewQueryDto {
  @ApiProperty({ enum: PURGE_TARGETS })
  @IsIn(PURGE_TARGETS)
  target!: PurgeTarget;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  olderThanDays!: number;
}
