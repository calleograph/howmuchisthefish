import { Module } from '@nestjs/common';
import { ReportJobsController } from './report-jobs.controller';
import { ReportJobsService } from './report-jobs.service';
import { ReportDataService } from './report-data.service';

@Module({
  controllers: [ReportJobsController],
  providers: [ReportJobsService, ReportDataService],
})
export class ReportJobsModule {}
