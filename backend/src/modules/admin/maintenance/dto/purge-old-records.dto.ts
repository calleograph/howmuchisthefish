import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export const PURGE_TARGETS = ['audit_logs', 'campaign_events'] as const;
export type PurgeTarget = (typeof PURGE_TARGETS)[number];

export class PurgeOldRecordsDto {
  @ApiProperty({ enum: PURGE_TARGETS })
  @IsIn(PURGE_TARGETS)
  target!: PurgeTarget;

  @ApiProperty({ description: 'Удалить записи старше N дней', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  olderThanDays!: number;
}
