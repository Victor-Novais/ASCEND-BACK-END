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

  if (user.role === Role.COLLABORATOR) {
    return {
      id,
      company: userCompanyScope(user.id),
      assignments: { some: { userId: user.id } },
    };
  }

  return {
    id,
    company: userCompanyScope(user.id),
  };
}

/**
 * List filter for assessments (non-admin callers).
 * Collaborators only see assessments explicitly assigned to them.
 */
export function assessmentsScopeForUser(
  user: CurrentUser,
): Prisma.AssessmentWhereInput | undefined {
  if (isAdmin(user)) {
    return undefined;
  }
  if (user.role === Role.COLLABORATOR) {
    return {
      company: userCompanyScope(user.id),
      assignments: { some: { userId: user.id } },
    };
  }
  return { company: userCompanyScope(user.id) };
}

function assessmentTenantFilter(
  user: CurrentUser,
): Pick<Prisma.AssessmentResponseWhereInput, 'assessment'> {
  if (isAdmin(user)) {
    return {};
  }
  return {
    assessment: { company: userCompanyScope(user.id) },
  };
}

/** Legacy row: questionId + userId null. Cloned row: assessmentQuestionId + userId. */
export function assessmentResponseWhereForUser(
  assessmentId: number,
  user: CurrentUser,
  target:
    | { questionId: number; userId?: null }
    | { assessmentQuestionId: number; userId: string },
): Prisma.AssessmentResponseWhereInput {
  if ('assessmentQuestionId' in target) {
    return {
      assessmentId,
      assessmentQuestionId: target.assessmentQuestionId,
      userId: target.userId,
      ...assessmentTenantFilter(user),
    };
  }
  return {
    assessmentId,
    questionId: target.questionId,
    userId: target.userId ?? null,
    ...assessmentTenantFilter(user),
  };
}
