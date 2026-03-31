import { Injectable } from '@nestjs/common';
import { MaturityLevel } from '@prisma/client';

type ScoringAnswerInput = {
  assessmentQuestionId: number;
  selectedWeight: number;
  category: string;
  maxWeight: number;
};

export type CategoryScoreItem = {
  category: string;
  score: number;
};

export type FinalizedAssessmentPayload = {
  score: number;
  maturityLevel: MaturityLevel;
  categories: CategoryScoreItem[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
};

@Injectable()
export class AssessmentScoringService {
  getMaturityLevel(score: number): MaturityLevel {
    if (score <= 25) return MaturityLevel.ARTESANAL;
    if (score <= 50) return MaturityLevel.EFICIENTE;
    if (score <= 75) return MaturityLevel.EFICAZ;
    return MaturityLevel.ESTRATEGICO;
  }

  compute(answers: ScoringAnswerInput[]): FinalizedAssessmentPayload {
    const categoryBuckets = new Map<string, { total: number; max: number }>();
    let totalSelected = 0;
    let totalMax = 0;

    for (const answer of answers) {
      totalSelected += answer.selectedWeight;
      totalMax += answer.maxWeight;

      const current = categoryBuckets.get(answer.category) ?? { total: 0, max: 0 };
      current.total += answer.selectedWeight;
      current.max += answer.maxWeight;
      categoryBuckets.set(answer.category, current);
    }

    const score = this.round2(totalMax > 0 ? (totalSelected / totalMax) * 100 : 0);
    const maturityLevel = this.getMaturityLevel(score);

    const categories: CategoryScoreItem[] = [...categoryBuckets.entries()]
      .map(([category, bucket]) => ({
        category,
        score: this.round2(bucket.max > 0 ? (bucket.total / bucket.max) * 100 : 0),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));

    const strengths = categories.filter((c) => c.score >= 75).map((c) => c.category);
    const weaknesses = categories.filter((c) => c.score < 50).map((c) => c.category);
    const recommendations = weaknesses.map((category) =>
      `Improve ${category.toLowerCase()} processes and standardization`,
    );

    return {
      score,
      maturityLevel,
      categories,
      strengths,
      weaknesses,
      recommendations,
    };
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
