import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { AssessmentsModule } from '../assessments/assessments.module';
import { AnswersController } from './answers.controller';
import { AnswersService } from './answers.service';

@Module({
  imports: [AssessmentsModule],
  controllers: [AnswersController],
  providers: [AnswersService, RolesGuard],
  exports: [AnswersService],
})
export class AnswersModule {}
