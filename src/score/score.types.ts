import { QuestionCategory, ResponseType } from '@prisma/client';

export interface ScoreEngineItemInput {
  questionId: number;
  category: QuestionCategory;
  responseType: ResponseType;

  responseValue: string;

  weight: number;
}

export interface ScoreEngineInput {
  items: ScoreEngineItemInput[];
}

export interface ScoreEngineItemDetail {
  questionId: number;
  category: QuestionCategory;
  responseType: ResponseType;
  normalizedScore: number;
  weight: number;

  weightedContribution: number;
}

export interface ScoreEngineResult {

  totalScore: number;

  totalWeight: number;

  categoryScores: Record<QuestionCategory, number>;

  categoryWeights: Record<QuestionCategory, number>;

  items: ScoreEngineItemDetail[];
}
