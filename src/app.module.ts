import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { QuestionsModule } from './questions/questions.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { QuestionnaireTemplatesModule } from './questionnaire-templates/questionnaire-templates.module';
import { ReportModule } from './report/report.module';
import { ScoreModule } from './score/score.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ScoreModule,
    ReportModule,
    UsersModule,
    AuthModule,
    CompaniesModule,
    QuestionsModule,
    QuestionnaireTemplatesModule,
    AssessmentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
