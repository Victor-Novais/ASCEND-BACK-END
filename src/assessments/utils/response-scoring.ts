import { BadRequestException } from '@nestjs/common';
import { ResponseType } from '@prisma/client';

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
