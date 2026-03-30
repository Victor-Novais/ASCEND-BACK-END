import { QuestionCategory } from '@prisma/client';
import {
  ReportRecommendationItem,
  ReportStrengthItem,
  ReportWeaknessItem,
} from '../report.types';
import { ScoreEngineResult } from '../../score/score.types';

const CATEGORY_LABEL: Record<QuestionCategory, string> = {
  [QuestionCategory.GOVERNANCA]: 'Governance',
  [QuestionCategory.SEGURANCA]: 'Security',
  [QuestionCategory.PROCESSOS]: 'Processes',
  [QuestionCategory.INFRAESTRUTURA]: 'Infrastructure',
  [QuestionCategory.CULTURA]: 'Culture',
};

const CATEGORY_RECOMMENDATION: Record<QuestionCategory, string> = {
  [QuestionCategory.GOVERNANCA]:
    'Define clear governance ownership and decision-making rituals.',
  [QuestionCategory.SEGURANCA]:
    'Improve access control and authentication policies.',
  [QuestionCategory.PROCESSOS]:
    'Document and standardize operational processes.',
  [QuestionCategory.INFRAESTRUTURA]:
    'Modernize infrastructure baselines and observability routines.',
  [QuestionCategory.CULTURA]:
    'Strengthen continuous improvement and team enablement practices.',
};

export function buildStrengthsAndWeaknesses(score: ScoreEngineResult): {
  strengths: ReportStrengthItem[];
  weaknesses: ReportWeaknessItem[];
} {
  const ranked = (Object.values(QuestionCategory) as QuestionCategory[])
    .filter((key) => score.categoryWeights[key] > 0)
    .map((key) => ({ category: key, score: score.categoryScores[key] }))
    .sort((a, b) => b.score - a.score);

  const strengths = ranked.slice(0, 2).map((row) => ({
    category: row.category,
    score: row.score,
    title: `Strong performance: ${CATEGORY_LABEL[row.category]}`,
    summary: `This is one of the highest maturity categories (${row.score}).`,
  }));

  const weaknesses = [...ranked]
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map((row) => ({
      category: row.category,
      score: row.score,
      title: `Improvement area: ${CATEGORY_LABEL[row.category]}`,
      summary: `This is one of the lowest maturity categories (${row.score}).`,
    }));

  return { strengths, weaknesses };
}

export function buildRecommendations(
  score: ScoreEngineResult,
  _weaknessCount: number,
): ReportRecommendationItem[] {
  const items: ReportRecommendationItem[] = [];
  const categories = Object.values(QuestionCategory) as QuestionCategory[];

  for (const cat of categories) {
    if (score.categoryWeights[cat] <= 0) {
      continue;
    }
    const s = score.categoryScores[cat];
    if (s < 50) {
      items.push({
        id: `rec-improve-${cat.toLowerCase()}`,
        priority: 'medium',
        category: cat,
        title: `Elevate ${CATEGORY_LABEL[cat]}`,
        action: CATEGORY_RECOMMENDATION[cat],
        rationale: `Category score ${s} is below 50 and needs focused remediation.`,
      });
    }
  }

  if (items.length === 0) {
    items.push({
      id: 'rec-global-sustain',
      priority: 'low',
      category: 'GLOBAL',
      title: 'Maintain current maturity gains',
      action: 'Keep reassessing periodically and preserve effective practices.',
      rationale: `All active categories are at or above the baseline threshold.`,
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => order[a.priority] - order[b.priority]);
  return items;
}
