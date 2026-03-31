import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { AssessmentCalculatorService } from './assessment-calculator.service';
import { AssessmentScoringService } from './assessment-scoring.service';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';

@Module({
  controllers: [AssessmentsController],
  providers: [AssessmentsService, AssessmentCalculatorService, AssessmentScoringService, RolesGuard],
  exports: [AssessmentsService, AssessmentScoringService],
})
export class AssessmentsModule {}
