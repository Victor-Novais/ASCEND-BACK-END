import { Global, Module } from '@nestjs/common';
import { ScoreModule } from '../score/score.module';
import { ReportService } from './report.service';

@Global()
@Module({
  imports: [ScoreModule],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}
