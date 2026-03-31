import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { AnswersController } from './answers.controller';
import { AnswersService } from './answers.service';

@Module({
  controllers: [AnswersController],
  providers: [AnswersService, RolesGuard],
  exports: [AnswersService],
})
export class AnswersModule {}
