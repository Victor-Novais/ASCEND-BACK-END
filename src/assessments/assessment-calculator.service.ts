import { ForbiddenException, Injectable } from '@nestjs/common';
import { MaturityLevel, Prisma, QuestionCategory, ResponseType, Role } from '@prisma/client';
import { userCompanyScope } from '../auth/user-scope.helper';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildRecommendations,
  buildStrengthsAndWeaknesses,
} from '../report/rules/recommendation.rules';
import { ReportGenerationResult } from '../report/report.types';
import { ScoreEngineResult } from '../score/score.types';
import { computeResponseScore } from './utils/response-scoring';

type CurrentUser = {
  sub: string;
  role: Role;
};

@Injectable()
export class AssessmentCalculatorService {
  constructor(private readonly prisma: PrismaService) {}

  async recalculate(assessmentId: number, currentUser: CurrentUser): Promise<ReportGenerationResult> {
    const assessment = await this.prisma.assessment.findFirst({
      // Security: scoring can only read/write assessments within caller tenant scope.
      where: currentUser.role === Role.ADMIN
        ? { id: assessmentId }
        : {
          id: assessmentId,
          company: userCompanyScope(currentUser.sub),
        },
      include: {
        responses: {
          include: {
            question: {
              select: {
                id: true,
                category: true,
                responseType: true,
                weight: true,
              },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!assessment) {
      throw new ForbiddenException('You do not have access to this assessment');
    }

    const latestByQuestion = new Map<number, (typeof assessment.responses)[number]>();
    for (const response of assessment.responses) {
      const previous = latestByQuestion.get(response.questionId);
      if (!previous || response.id > previous.id) {
        latestByQuestion.set(response.questionId, response);
      }
    }

    const categoryWeightedScores = this.emptyCategoryAccumulator();
    const categoryWeights = this.emptyCategoryAccumulator();
    const categoryQuestionCounts = this.emptyCategoryAccumulator();

    for (const response of latestByQuestion.values()) {
      const { score } = computeResponseScore(
        response.question.responseType as ResponseType,
        response.responseValue,
      );
      const weight = Number(response.question.weight);
      const weightedQuestionScore = (score / 100) * weight;

      categoryWeightedScores[response.question.category] += weightedQuestionScore;
      categoryWeights[response.question.category] += weight;
      categoryQuestionCounts[response.question.category] += 1;
    }

    const categoryScores = this.emptyCategoryAccumulator();
    for (const category of Object.values(QuestionCategory) as QuestionCategory[]) {
      if (categoryQuestionCounts[category] === 0 || categoryWeights[category] <= 0) {
        categoryScores[category] = 0;
        continue;
      }

      // Business rule: average weighted question scores and normalize to 0-100.
      categoryScores[category] = this.round2(
        (categoryWeightedScores[category] / categoryWeights[category]) * 100,
      );
    }

    const totalScore = this.round2(
      Object.values(categoryScores).reduce((acc, value) => acc + value, 0) /
      Object.values(QuestionCategory).length,
    );
    const maturityLevel = this.maturityFromTotalScore(totalScore);

    const scoreForRecommendations: ScoreEngineResult = {
      totalScore,
      totalWeight: this.round2(
        Object.values(categoryWeights).reduce((acc, value) => acc + value, 0),
      ),
      categoryScores,
      categoryWeights: this.roundCategoryAccumulator(categoryWeights),
      items: [],
    };

    const { strengths, weaknesses } = buildStrengthsAndWeaknesses(scoreForRecommendations);
    const recommendations = buildRecommendations(
      scoreForRecommendations,
      weaknesses.length,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.assessment.update({
        where: { id: assessmentId },
        data: {
          totalScore: new Prisma.Decimal(totalScore),
          maturityLevel,
        },
      });

      await tx.report.upsert({
        where: { assessmentId },
        create: {
          assessmentId,
          totalScore: new Prisma.Decimal(totalScore),
          maturityLevel,
          categoryScores: categoryScores as unknown as Prisma.InputJsonValue,
          strengths: strengths as unknown as Prisma.InputJsonValue,
          weaknesses: weaknesses as unknown as Prisma.InputJsonValue,
          recommendations: recommendations as unknown as Prisma.InputJsonValue,
        },
        update: {
          totalScore: new Prisma.Decimal(totalScore),
          maturityLevel,
          categoryScores: categoryScores as unknown as Prisma.InputJsonValue,
          strengths: strengths as unknown as Prisma.InputJsonValue,
          weaknesses: weaknesses as unknown as Prisma.InputJsonValue,
          recommendations: recommendations as unknown as Prisma.InputJsonValue,
        },
      });
    });

    return {
      assessmentId,
      totalScore,
      maturityLevel,
      categoryScores,
      strengths,
      weaknesses,
      recommendations,
    };
  }

  private maturityFromTotalScore(totalScore: number): MaturityLevel {
    if (totalScore <= 25) {
      return MaturityLevel.ARTESANAL;
    }
    if (totalScore <= 50) {
      return MaturityLevel.EFICIENTE;
    }
    if (totalScore <= 75) {
      return MaturityLevel.EFICAZ;
    }
    return MaturityLevel.ESTRATEGICO;
  }

  private emptyCategoryAccumulator(): Record<QuestionCategory, number> {
    const acc = {} as Record<QuestionCategory, number>;
    for (const category of Object.values(QuestionCategory) as QuestionCategory[]) {
      acc[category] = 0;
    }
    return acc;
  }

  private roundCategoryAccumulator(
    input: Record<QuestionCategory, number>,
  ): Record<QuestionCategory, number> {
    const out = {} as Record<QuestionCategory, number>;
    for (const category of Object.values(QuestionCategory) as QuestionCategory[]) {
      out[category] = this.round2(input[category]);
    }
    return out;
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
