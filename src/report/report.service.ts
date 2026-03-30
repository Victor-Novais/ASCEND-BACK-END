import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssessmentStatus,
  Prisma,
  QuestionCategory,
  Report,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScoreService } from '../score/score.service';
import { ScoreEngineItemInput } from '../score/score.types';
import {
  ReportCategoryScoresJson,
  ReportGenerationResult,
  ReportRecommendationItem,
  ReportStrengthItem,
  ReportWeaknessItem,
} from './report.types';
import { maturityFromTotalScore } from './rules/maturity.rules';
import {
  buildRecommendations,
  buildStrengthsAndWeaknesses,
} from './rules/recommendation.rules';

@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoreService: ScoreService,
  ) { }

  payloadFromPersisted(report: Report): ReportGenerationResult {
    return {
      assessmentId: report.assessmentId,
      totalScore: Number(report.totalScore),
      maturityLevel: report.maturityLevel,
      categoryScores: report.categoryScores as unknown as ReportCategoryScoresJson,
      strengths: report.strengths as unknown as ReportStrengthItem[],
      weaknesses: report.weaknesses as unknown as ReportWeaknessItem[],
      recommendations: report.recommendations as unknown as ReportRecommendationItem[],
    };
  }


  async generateAndPersist(assessmentId: number): Promise<Report & { payload: ReportGenerationResult }> {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            segment: true,
          },
        },
        assessor: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
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
            evidenceFiles: true,
          },
          orderBy: { id: 'asc' },
        },
      },
    });

    if (!assessment) {
      throw new NotFoundException(`Assessment with id '${assessmentId}' not found`);
    }

    if (assessment.status !== AssessmentStatus.SUBMITTED) {
      throw new BadRequestException(
        'Report can only be generated for a submitted assessment',
      );
    }

    const items = this.buildScoreItems(assessment.responses);
    if (items.length === 0) {
      throw new BadRequestException(
        'Cannot generate a report without assessment responses',
      );
    }

    const scoreResult = this.scoreService.compute({ items });
    const maturityLevel = maturityFromTotalScore(scoreResult.totalScore);
    const { strengths, weaknesses } = buildStrengthsAndWeaknesses(scoreResult);
    const recommendations = buildRecommendations(
      scoreResult,
      weaknesses.length,
    );

    const categoryScoresJson = scoreResult.categoryScores as Record<
      QuestionCategory,
      number
    >;

    const payload: ReportGenerationResult = {
      assessmentId,
      totalScore: scoreResult.totalScore,
      maturityLevel,
      categoryScores: categoryScoresJson,
      strengths,
      weaknesses,
      recommendations,
    };

    const totalDecimal = new Prisma.Decimal(scoreResult.totalScore);

    const persisted = await this.prisma.$transaction(async (tx) => {
      await tx.assessment.update({
        where: { id: assessmentId },
        data: {
          totalScore: totalDecimal,
          maturityLevel,
        },
      });

      return tx.report.upsert({
        where: { assessmentId },
        create: {
          assessmentId,
          totalScore: totalDecimal,
          maturityLevel,
          categoryScores: categoryScoresJson as unknown as Prisma.InputJsonValue,
          strengths: strengths as unknown as Prisma.InputJsonValue,
          weaknesses: weaknesses as unknown as Prisma.InputJsonValue,
          recommendations: recommendations as unknown as Prisma.InputJsonValue,
        },
        update: {
          totalScore: totalDecimal,
          maturityLevel,
          categoryScores: categoryScoresJson as unknown as Prisma.InputJsonValue,
          strengths: strengths as unknown as Prisma.InputJsonValue,
          weaknesses: weaknesses as unknown as Prisma.InputJsonValue,
          recommendations: recommendations as unknown as Prisma.InputJsonValue,
        },
      });
    });

    return { ...persisted, payload };
  }


  private buildScoreItems(
    responses: Array<{
      id: number;
      questionId: number;
      responseValue: string;
      question: {
        id: number;
        category: QuestionCategory;
        responseType: ScoreEngineItemInput['responseType'];
        weight: Prisma.Decimal;
      };
    }>,
  ): ScoreEngineItemInput[] {
    const latestByQuestion = new Map<number, (typeof responses)[number]>();

    for (const r of responses) {
      const prev = latestByQuestion.get(r.questionId);
      if (!prev || r.id > prev.id) {
        latestByQuestion.set(r.questionId, r);
      }
    }

    return [...latestByQuestion.values()].map((r) => ({
      questionId: r.questionId,
      category: r.question.category,
      responseType: r.question.responseType,
      responseValue: r.responseValue,
      weight: Number(r.question.weight),
    }));
  }
}
