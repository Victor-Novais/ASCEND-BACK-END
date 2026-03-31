import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  AssessmentAssignmentStatus,
  MaturityLevel,
  Prisma,
  QuestionCategory,
  ResponseType,
  Role,
} from '@prisma/client';
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
      where:
        currentUser.role === Role.ADMIN
          ? { id: assessmentId }
          : {
            id: assessmentId,
            company: userCompanyScope(currentUser.sub),
          },
      include: {
        assignments: true,
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
            assessmentQuestion: {
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

    if (assessment.questionnaireTemplateId) {
      return this.recalculateTemplateAssessment(assessmentId, assessment);
    }

    return this.recalculateLegacyAssessment(assessmentId, assessment);
  }

  private async recalculateLegacyAssessment(
    assessmentId: number,
    assessment: {
      responses: Array<{
        id: number;
        questionId: number | null;
        responseValue: string;
        question: {
          id: number;
          category: QuestionCategory;
          responseType: ResponseType;
          weight: Prisma.Decimal;
        } | null;
      }>;
    },
  ): Promise<ReportGenerationResult> {
    const latestByQuestion = new Map<number, (typeof assessment.responses)[number]>();
    for (const response of assessment.responses) {
      if (response.questionId == null || response.question == null) {
        continue;
      }
      const previous = latestByQuestion.get(response.questionId);
      if (!previous || response.id > previous.id) {
        latestByQuestion.set(response.questionId, response);
      }
    }

    const categoryWeightedScores = this.emptyCategoryAccumulator();
    const categoryWeights = this.emptyCategoryAccumulator();
    const categoryQuestionCounts = this.emptyCategoryAccumulator();

    for (const response of latestByQuestion.values()) {
      const q = response.question!;
      const { score } = computeResponseScore(
        q.responseType as ResponseType,
        response.responseValue,
      );
      const weight = Number(q.weight);
      const weightedQuestionScore = (score / 100) * weight;

      categoryWeightedScores[q.category] += weightedQuestionScore;
      categoryWeights[q.category] += weight;
      categoryQuestionCounts[q.category] += 1;
    }

    return this.persistReportFromCategoryMath(
      assessmentId,
      categoryWeightedScores,
      categoryWeights,
      categoryQuestionCounts,
    );
  }

  private async recalculateTemplateAssessment(
    assessmentId: number,
    assessment: {
      assignments: Array<{ status: AssessmentAssignmentStatus; userId: string }>;
      responses: Array<{
        id: number;
        assessmentQuestionId: number | null;
        userId: string | null;
        responseValue: string;
        score: Prisma.Decimal;
        assessmentQuestion: {
          id: number;
          category: QuestionCategory | null;
          responseType: ResponseType;
          weight: Prisma.Decimal;
        } | null;
      }>;
    },
  ): Promise<ReportGenerationResult> {
    const pending = assessment.assignments.some((a) => a.status !== AssessmentAssignmentStatus.SUBMITTED);
    if (pending) {
      throw new BadRequestException(
        'Cannot score template assessment until every collaborator has submitted',
      );
    }

    const submittedUserIds = new Set(
      assessment.assignments
        .filter((a) => a.status === AssessmentAssignmentStatus.SUBMITTED)
        .map((a) => a.userId),
    );

    const byTemplate = new Map<number, number[]>();
    for (const r of assessment.responses) {
      if (
        r.assessmentQuestionId == null ||
        r.assessmentQuestion == null ||
        !r.userId ||
        !submittedUserIds.has(r.userId)
      ) {
        continue;
      }
      const list = byTemplate.get(r.assessmentQuestionId) ?? [];
      list.push(Number(r.score));
      byTemplate.set(r.assessmentQuestionId, list);
    }

    const categoryWeightedScores = this.emptyCategoryAccumulator();
    const categoryWeights = this.emptyCategoryAccumulator();
    const categoryQuestionCounts = this.emptyCategoryAccumulator();

    for (const [templateQuestionId, scores] of byTemplate) {
      const sample = assessment.responses.find(
        (r) => r.assessmentQuestionId === templateQuestionId && r.assessmentQuestion,
      );
      const qt = sample?.assessmentQuestion;
      if (!qt || qt.category == null || scores.length === 0) {
        continue;
      }

      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const weight = Number(qt.weight);
      const weightedQuestionScore = (avgScore / 100) * weight;

      categoryWeightedScores[qt.category] += weightedQuestionScore;
      categoryWeights[qt.category] += weight;
      categoryQuestionCounts[qt.category] += 1;
    }

    return this.persistReportFromCategoryMath(
      assessmentId,
      categoryWeightedScores,
      categoryWeights,
      categoryQuestionCounts,
    );
  }

  private async persistReportFromCategoryMath(
    assessmentId: number,
    categoryWeightedScores: Record<QuestionCategory, number>,
    categoryWeights: Record<QuestionCategory, number>,
    categoryQuestionCounts: Record<QuestionCategory, number>,
  ): Promise<ReportGenerationResult> {
    const categoryScores = this.emptyCategoryAccumulator();
    for (const category of Object.values(QuestionCategory) as QuestionCategory[]) {
      if (categoryQuestionCounts[category] === 0 || categoryWeights[category] <= 0) {
        categoryScores[category] = 0;
        continue;
      }

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
    const recommendations = buildRecommendations(scoreForRecommendations, weaknesses.length);

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
