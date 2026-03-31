import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AssessmentStatus, Role } from '@prisma/client';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { AssessmentsService } from '../assessments/assessments.service';
import { SubmitAnswersDto } from './dto/submit-answers.dto';

@Injectable()
export class AnswersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assessmentsService: AssessmentsService,
  ) {}

  async submitAnswers(dto: SubmitAnswersDto, user: JwtPayload) {
    if (user.role !== Role.COLLABORATOR) {
      throw new ForbiddenException('Only collaborators can submit answers');
    }

    const assessment = await this.prisma.assessment.findFirst({
      where: {
        id: dto.assessmentId,
        assignments: { some: { userId: user.sub } },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    if (assessment.status === AssessmentStatus.COMPLETED) {
      throw new BadRequestException('Assessment is completed');
    }
    if (assessment.status === AssessmentStatus.SUBMITTED) {
      throw new BadRequestException('Assessment is submitted');
    }

    const seen = new Set<number>();
    for (const item of dto.answers) {
      if (seen.has(item.assessmentQuestionId)) {
        throw new BadRequestException(
          `Duplicate answer for assessmentQuestionId ${item.assessmentQuestionId}`,
        );
      }
      seen.add(item.assessmentQuestionId);
    }

    const questionIds = dto.answers.map((a) => a.assessmentQuestionId);
    const questions = await this.prisma.assessmentQuestion.findMany({
      where: {
        id: { in: questionIds },
        assessmentId: dto.assessmentId,
      },
      select: { id: true },
    });
    const questionSet = new Set(questions.map((q) => q.id));

    for (const qid of questionIds) {
      if (!questionSet.has(qid)) {
        throw new BadRequestException(`Question ${qid} does not belong to this assessment`);
      }
    }

    const optionIds = dto.answers.map((a) => a.selectedOptionId);
    const options = await this.prisma.assessmentQuestionOption.findMany({
      where: {
        id: { in: optionIds },
      },
      select: { id: true, assessmentQuestionId: true },
    });
    const optionById = new Map(options.map((o) => [o.id, o]));

    for (const item of dto.answers) {
      const option = optionById.get(item.selectedOptionId);
      if (!option) {
        throw new BadRequestException(`Option ${item.selectedOptionId} not found`);
      }
      if (option.assessmentQuestionId !== item.assessmentQuestionId) {
        throw new BadRequestException(
          `Option ${item.selectedOptionId} does not belong to question ${item.assessmentQuestionId}`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.answers) {
        await tx.answer.upsert({
          where: {
            assessmentId_assessmentQuestionId_answeredBy: {
              assessmentId: dto.assessmentId,
              assessmentQuestionId: item.assessmentQuestionId,
              answeredBy: user.sub,
            },
          },
          create: {
            assessmentId: dto.assessmentId,
            assessmentQuestionId: item.assessmentQuestionId,
            selectedOptionId: item.selectedOptionId,
            answeredBy: user.sub,
          },
          update: {
            selectedOptionId: item.selectedOptionId,
          },
        });
      }

      if (assessment.status === AssessmentStatus.NOT_STARTED) {
        await tx.assessment.update({
          where: { id: dto.assessmentId },
          data: {
            status: AssessmentStatus.IN_PROGRESS,
            startedAt: new Date(),
          },
        });
      }
    });

    const [totalQuestions, answeredCount] = await Promise.all([
      this.prisma.assessmentQuestion.count({
        where: { assessmentId: dto.assessmentId },
      }),
      this.prisma.answer.count({
        where: {
          assessmentId: dto.assessmentId,
          answeredBy: user.sub,
        },
      }),
    ]);

    let finalized: Awaited<ReturnType<AssessmentsService['finalizeAssessment']>> | null = null;
    if (totalQuestions > 0 && answeredCount === totalQuestions) {
      finalized = await this.assessmentsService.finalizeAssessment(dto.assessmentId);
    }

    return {
      assessmentId: dto.assessmentId,
      answeredBy: user.sub,
      count: dto.answers.length,
      finalized,
    };
  }
}
