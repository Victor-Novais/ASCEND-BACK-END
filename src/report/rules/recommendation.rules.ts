import { QuestionCategory } from '@prisma/client';
import {
  ReportRecommendationItem,
  ReportStrengthItem,
  ReportWeaknessItem,
} from '../report.types';
import { ScoreEngineResult } from '../../score/score.types';

const STRENGTH_THRESHOLD = 75;
const WEAKNESS_THRESHOLD = 50;
const CRITICAL_THRESHOLD = 40;

const CATEGORY_LABEL: Record<QuestionCategory, string> = {
  [QuestionCategory.GOVERNANCA]: 'Governance',
  [QuestionCategory.SEGURANCA]: 'Security',
  [QuestionCategory.PROCESSOS]: 'Processes',
  [QuestionCategory.INFRAESTRUTURA]: 'Infrastructure',
  [QuestionCategory.CULTURA]: 'Culture',
};

export function buildStrengthsAndWeaknesses(score: ScoreEngineResult): {
  strengths: ReportStrengthItem[];
  weaknesses: ReportWeaknessItem[];
} {
  const strengths: ReportStrengthItem[] = [];
  const weaknesses: ReportWeaknessItem[] = [];

  for (const key of Object.values(QuestionCategory) as QuestionCategory[]) {
    if (score.categoryWeights[key] <= 0) {
      continue;
    }

    const s = score.categoryScores[key];
    if (s >= STRENGTH_THRESHOLD) {
      strengths.push({
        category: key,
        score: s,
        title: `Strong performance: ${CATEGORY_LABEL[key]}`,
        summary: `Score ${s} in ${CATEGORY_LABEL[key]} indicates practices are well aligned with expectations.`,
      });
    } else if (s < WEAKNESS_THRESHOLD) {
      weaknesses.push({
        category: key,
        score: s,
        title: `Improvement area: ${CATEGORY_LABEL[key]}`,
        summary: `Score ${s} in ${CATEGORY_LABEL[key]} suggests gaps that should be prioritized in the action plan.`,
      });
    }
  }

  return { strengths, weaknesses };
}

export function buildRecommendations(
  score: ScoreEngineResult,
  weaknessCount: number,
): ReportRecommendationItem[] {
  const items: ReportRecommendationItem[] = [];
  const categories = Object.values(QuestionCategory) as QuestionCategory[];

  for (const cat of categories) {
    if (score.categoryWeights[cat] <= 0) {
      continue;
    }
    const s = score.categoryScores[cat];
    if (s < CRITICAL_THRESHOLD) {
      items.push({
        id: `rec-critical-${cat.toLowerCase()}`,
        priority: 'high',
        category: cat,
        title: `Stabilize ${CATEGORY_LABEL[cat]}`,
        action: `Run a focused remediation sprint on ${CATEGORY_LABEL[cat]} controls and evidence.`,
        rationale: `Category score ${s} is below ${CRITICAL_THRESHOLD}, increasing operational and compliance risk.`,
      });
    } else if (s < WEAKNESS_THRESHOLD) {
      items.push({
        id: `rec-improve-${cat.toLowerCase()}`,
        priority: 'medium',
        category: cat,
        title: `Elevate ${CATEGORY_LABEL[cat]}`,
        action: `Define measurable targets and quarterly checkpoints for ${CATEGORY_LABEL[cat]}.`,
        rationale: `Score ${s} indicates meaningful upside before reaching peer benchmarks.`,
      });
    }
  }

  if (score.totalScore < 55) {
    items.push({
      id: 'rec-global-foundation',
      priority: 'high',
      category: 'GLOBAL',
      title: 'Establish a cross-domain improvement backlog',
      action:
        'Prioritize the lowest-scoring categories first; sequence work to avoid conflicting initiatives.',
      rationale: `Overall maturity score ${score.totalScore} suggests foundational work is needed before advanced optimization.`,
    });
  } else if (score.totalScore >= 80 && weaknessCount === 0) {
    items.push({
      id: 'rec-global-sustain',
      priority: 'low',
      category: 'GLOBAL',
      title: 'Sustain and benchmark',
      action:
        'Institutionalize periodic reassessments and external benchmarking to prevent regression.',
      rationale: `Overall score ${score.totalScore} is strong; focus shifts to consistency and external validation.`,
    });
  } else if (score.totalScore < 70) {
    items.push({
      id: 'rec-global-governance-review',
      priority: 'medium',
      category: 'GLOBAL',
      title: 'Review executive ownership',
      action:
        'Assign accountable owners per weak category and tie milestones to leadership reviews.',
      rationale: `Mid-range overall score ${score.totalScore} benefits from clearer accountability.`,
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  items.sort((a, b) => order[a.priority] - order[b.priority]);
  return items;
}
