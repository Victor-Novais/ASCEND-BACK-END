import { MaturityLevel, QuestionCategory } from '@prisma/client';


export type ReportCategoryScoresJson = Record<QuestionCategory, number>;

export interface ReportStrengthItem {
  category: QuestionCategory;
  score: number;
  title: string;
  summary: string;
}

export interface ReportWeaknessItem {
  category: QuestionCategory;
  score: number;
  title: string;
  summary: string;
}

export type ReportRecommendationPriority = 'high' | 'medium' | 'low';

export interface ReportRecommendationItem {
  id: string;
  priority: ReportRecommendationPriority;
  category: QuestionCategory | 'GLOBAL';
  title: string;
  action: string;
  rationale: string;
}

/** Structured payload produced by ReportService (matches persisted JSON + metadata) */
export interface ReportGenerationResult {
  assessmentId: number;
  totalScore: number;
  maturityLevel: MaturityLevel;
  categoryScores: ReportCategoryScoresJson;
  strengths: ReportStrengthItem[];
  weaknesses: ReportWeaknessItem[];
  recommendations: ReportRecommendationItem[];
}
