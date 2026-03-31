import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { QuestionnaireTemplatesController } from './questionnaire-templates.controller';
import { QuestionnaireTemplatesService } from './questionnaire-templates.service';

@Module({
  controllers: [QuestionnaireTemplatesController],
  providers: [QuestionnaireTemplatesService, RolesGuard],
  exports: [QuestionnaireTemplatesService],
})
export class QuestionnaireTemplatesModule {}
