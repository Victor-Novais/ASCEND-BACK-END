import { Prisma, Role } from '@prisma/client';

export type CurrentUser = {
  id: string;
  role: Role;
};

export function isAdmin(user: CurrentUser): boolean {
  return user.role === Role.ADMIN;
}

// Centralized tenant filter used to enforce company-level isolation.
export function userCompanyScope(userId: string): Prisma.CompanyWhereInput {
  return {
    OR: [
      { createdById: userId },
      {
        assignments: {
          some: {
            userId,
          },
        },
      },
    ],
  };
}

export function companyWhereForUser(
  id: number,
  user: CurrentUser,
): Prisma.CompanyWhereInput {
  if (isAdmin(user)) {
    return { id };
  }

  return {
    id,
    ...userCompanyScope(user.id),
  };
}

export function assessmentWhereForUser(
  id: number,
  user: CurrentUser,
): Prisma.AssessmentWhereInput {
  if (isAdmin(user)) {
    return { id };
  }

  return {
    id,
    company: userCompanyScope(user.id),
  };
}

export function assessmentResponseWhereForUser(
  assessmentId: number,
  questionId: number,
  user: CurrentUser,
): Prisma.AssessmentResponseWhereInput {
  if (isAdmin(user)) {
    return {
      assessmentId,
      questionId,
    };
  }

  return {
    assessmentId,
    questionId,
    assessment: {
      company: userCompanyScope(user.id),
    },
  };
}
