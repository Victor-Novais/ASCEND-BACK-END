import { BadRequestException, Injectable } from '@nestjs/common';
import { QuestionCategory, ResponseType } from '@prisma/client';
import {
  ScoreEngineInput,
  ScoreEngineItemDetail,
  ScoreEngineItemInput,
  ScoreEngineResult,
} from './score.types';

const ROUND_DIGITS = 2;

@Injectable()
export class ScoreService {
  /**
   * Normalizes a single response to 0–100:
   * - YES_NO: YES → 100, NO → 0
   * - SCALE: integer 0–10 → value × 10 (0–100)
   */
  normalizeResponse(responseType: ResponseType, responseValue: string): number {
    const trimmed = responseValue.trim();

    if (responseType === ResponseType.YES_NO) {
      const upper = trimmed.toUpperCase();
      if (upper === 'YES') {
        return 100;
      }
      if (upper === 'NO') {
        return 0;
      }
      throw new BadRequestException(
        `YES_NO response must be "YES" or "NO", got "${responseValue}"`,
      );
    }

    if (responseType === ResponseType.SCALE) {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0 || n > 10) {
        throw new BadRequestException(
          `SCALE response must be an integer from 0 to 10, got "${responseValue}"`,
        );
      }
      return n * 10;
    }

    throw new BadRequestException(`Unsupported response type: ${responseType}`);
  }

  /**
   * Weighted mean: Σ(score_i × w_i) / Σ(w_i).
   * Category scores use the same rule within each category.
   */
  compute(input: ScoreEngineInput): ScoreEngineResult {
    if (!input.items?.length) {
      throw new BadRequestException('At least one response item is required');
    }

    for (const item of input.items) {
      this.assertPositiveWeight(item);
    }

    const details: ScoreEngineItemDetail[] = input.items.map((item) => {
      const normalizedScore = this.normalizeResponse(
        item.responseType,
        item.responseValue,
      );
      return {
        questionId: item.questionId,
        category: item.category,
        responseType: item.responseType,
        normalizedScore,
        weight: item.weight,
        weightedContribution: normalizedScore * item.weight,
      };
    });

    let totalWeight = 0;
    let totalWeightedSum = 0;

    const categoryWeightedSums = this.emptyCategoryAccumulator();
    const categoryWeights = this.emptyCategoryAccumulator();

    for (const row of details) {
      totalWeight += row.weight;
      totalWeightedSum += row.weightedContribution;

      categoryWeightedSums[row.category] += row.weightedContribution;
      categoryWeights[row.category] += row.weight;
    }

    if (totalWeight <= 0) {
      throw new BadRequestException('Sum of weights must be greater than zero');
    }

    const totalScore = this.round2(totalWeightedSum / totalWeight);

    const categoryScores = {} as Record<QuestionCategory, number>;
    for (const key of Object.values(QuestionCategory) as QuestionCategory[]) {
      const w = categoryWeights[key];
      categoryScores[key] =
        w > 0 ? this.round2(categoryWeightedSums[key] / w) : 0;
    }

    return {
      totalScore,
      totalWeight,
      categoryScores,
      categoryWeights: this.roundCategoryWeights(categoryWeights),
      items: details.map((d) => ({
        ...d,
        normalizedScore: this.round2(d.normalizedScore),
        weightedContribution: this.round2(d.weightedContribution),
      })),
    };
  }

  private assertPositiveWeight(item: ScoreEngineItemInput): void {
    if (!Number.isFinite(item.weight) || item.weight <= 0) {
      throw new BadRequestException(
        `Question ${item.questionId} must have a positive finite weight`,
      );
    }
  }

  private emptyCategoryAccumulator(): Record<QuestionCategory, number> {
    const acc = {} as Record<QuestionCategory, number>;
    for (const key of Object.values(QuestionCategory) as QuestionCategory[]) {
      acc[key] = 0;
    }
    return acc;
  }

  private roundCategoryWeights(
    weights: Record<QuestionCategory, number>,
  ): Record<QuestionCategory, number> {
    const out = {} as Record<QuestionCategory, number>;
    for (const key of Object.values(QuestionCategory) as QuestionCategory[]) {
      out[key] = this.round2(weights[key]);
    }
    return out;
  }

  private round2(value: number): number {
    return Math.round(value * 10 ** ROUND_DIGITS) / 10 ** ROUND_DIGITS;
  }
}
