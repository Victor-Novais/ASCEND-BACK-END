import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';

@Module({
  controllers: [AssessmentsController],
  providers: [AssessmentsService, RolesGuard],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
