import { BadRequestException } from '@nestjs/common';
import { Prisma, ResponseType } from '@prisma/client';

const YES_NO_VALUES = new Set(['YES', 'NO']);

/**
 * Normalizes YES/NO input and returns score 0–100.
 */
export function scoreYesNo(raw: string): { normalizedValue: string; score: number } {
  const upper = raw.trim().toUpperCase();
  if (!YES_NO_VALUES.has(upper)) {
    throw new BadRequestException(
      `YES_NO response must be "YES" or "NO", got "${raw}"`,
    );
  }
  const score = upper === 'YES' ? 100 : 0;
  return { normalizedValue: upper, score };
}

/**
 * Likert-style scale 1–5 → score 0–100 (linear).
 */
export function scoreScale(raw: string): { normalizedValue: string; score: number } {
  const trimmed = raw.trim();
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new BadRequestException(
      'SCALE response must be an integer from 1 to 5',
    );
  }
  const score = Math.round(((n - 1) / 4) * 100 * 100) / 100;
  return { normalizedValue: String(n), score };
}

export function computeResponseScore(
  responseType: ResponseType,
  responseValue: string,
): { normalizedValue: string; score: number } {
  if (responseType === ResponseType.YES_NO) {
    return scoreYesNo(responseValue);
  }
  if (responseType === ResponseType.SCALE) {
    return scoreScale(responseValue);
  }
  throw new BadRequestException(`Unsupported response type: ${responseType}`);
}

type TemplateOptionRow = { id: number; scoreValue: Prisma.Decimal };
type AssessmentOptionRow = { id: number; weight: number };

/**
 * Template questions may define explicit options (0–5 scoreValue).
 * `responseValue` must be the selected option id as a string.
 */
export function computeTemplateQuestionScore(
  responseType: ResponseType,
  options: TemplateOptionRow[],
  responseValue: string,
): { normalizedValue: string; score: number } {
  const trimmed = responseValue.trim();
  if (options.length > 0) {
    const id = Number(trimmed);
    if (!Number.isInteger(id)) {
      throw new BadRequestException(
        `OPTION-style response must be a numeric option id, got "${responseValue}"`,
      );
    }
    const opt = options.find((o) => o.id === id);
    if (!opt) {
      throw new BadRequestException(`Invalid option id ${id} for this question`);
    }
    const raw = Number(opt.scoreValue);
    if (!Number.isFinite(raw) || raw < 0 || raw > 5) {
      throw new BadRequestException('Option scoreValue must be between 0 and 5');
    }
    const score = Math.round((raw / 5) * 100 * 100) / 100;
    return { normalizedValue: String(id), score };
  }
  return computeResponseScore(responseType, trimmed);
}

export function computeAssessmentQuestionScore(
  responseType: ResponseType,
  options: AssessmentOptionRow[],
  responseValue: string,
): { normalizedValue: string; score: number; selectedOptionId: number | null } {
  const trimmed = responseValue.trim();
  if (options.length > 0) {
    const id = Number(trimmed);
    if (!Number.isInteger(id)) {
      throw new BadRequestException(
        `OPTION-style response must be a numeric option id, got "${responseValue}"`,
      );
    }
    const opt = options.find((o) => o.id === id);
    if (!opt) {
      throw new BadRequestException(`Invalid option id ${id} for this question`);
    }
    if (!Number.isFinite(opt.weight) || opt.weight < 0 || opt.weight > 5) {
      throw new BadRequestException('Option weight must be between 0 and 5');
    }
    const score = Math.round((opt.weight / 5) * 100 * 100) / 100;
    return { normalizedValue: String(id), score, selectedOptionId: id };
  }
  const scored = computeResponseScore(responseType, trimmed);
  return { ...scored, selectedOptionId: null };
}
