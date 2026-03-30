import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Assessment, Company, Prisma, Role } from '@prisma/client';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { companyWhereForUser, isAdmin, userCompanyScope } from '../auth/user-scope.helper';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

type CompanyWithRelations = Company & {
  createdBy: {
    id: string;
    name: string | null;
    email: string;
    role: Role;
  } | null;
  assignments: Array<{
    id: number;
    userId: string;
    companyId: number;
    createdAt: Date;
    user: {
      id: string;
      name: string | null;
      email: string;
      role: Role;
    };
  }>;
  assessments: Assessment[];
  _count: {
    assessments: number;
  };
};

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    createCompanyDto: CreateCompanyDto,
    currentUser: JwtPayload,
  ): Promise<CompanyWithRelations> {
    const evaluatorIds = createCompanyDto.evaluatorIds ?? [];
    await this.validateEvaluatorIds(evaluatorIds);

    const company = await this.prisma.company.create({
      data: {
        name: createCompanyDto.name,
        segment: createCompanyDto.segment,
        size: createCompanyDto.size,
        responsible: createCompanyDto.responsible,
        responsibleEmail: createCompanyDto.responsibleEmail,
        responsiblePhone: createCompanyDto.responsiblePhone,
        cnpj: createCompanyDto.cnpj,
        address: createCompanyDto.address,
        // Security: source creator identity from authenticated principal only.
        createdById: currentUser.sub,
      },
    });

    const assignedEvaluatorIds = new Set<string>(evaluatorIds);
    assignedEvaluatorIds.add(currentUser.sub);

    if (assignedEvaluatorIds.size > 0) {
      await this.prisma.userCompanyAssignment.createMany({
        // Security: creator is always assigned to guarantee tenant ownership.
        data: [...assignedEvaluatorIds].map((userId) => ({
          userId,
          companyId: company.id,
        })),
        skipDuplicates: true,
      });
    }

    return this.findOne(company.id, currentUser);
  }

  async findAll(currentUser: JwtPayload): Promise<CompanyWithRelations[]> {
    return this.prisma.company.findMany({
      where: isAdmin({ id: currentUser.sub, role: currentUser.role })
        ? undefined
        : userCompanyScope(currentUser.sub),
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, currentUser: JwtPayload): Promise<CompanyWithRelations> {
    const company = await this.prisma.company.findFirst({
      // Security: never use unscoped lookup for tenant-bound resources.
      where: companyWhereForUser(id, { id: currentUser.sub, role: currentUser.role }),
      include: this.defaultInclude,
    });

    if (!company) {
      throw new ForbiddenException('You do not have access to this company');
    }

    return company;
  }

  async update(
    id: number,
    updateCompanyDto: UpdateCompanyDto,
    currentUser: JwtPayload,
  ): Promise<CompanyWithRelations> {
    await this.ensureCompanyAccess(id, currentUser);

    const evaluatorIds = updateCompanyDto.evaluatorIds;
    if (evaluatorIds) {
      await this.validateEvaluatorIds(evaluatorIds);
    }

    const { evaluatorIds: _, ...companyData } = updateCompanyDto;

    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id },
        data: companyData,
      });

      if (evaluatorIds) {
        await tx.userCompanyAssignment.deleteMany({ where: { companyId: id } });

        if (evaluatorIds.length > 0) {
          await tx.userCompanyAssignment.createMany({
            data: evaluatorIds.map((userId) => ({
              userId,
              companyId: id,
            })),
            skipDuplicates: true,
          });
        }
      }
    });

    return this.findOne(id, currentUser);
  }

  async remove(id: number, currentUser: JwtPayload): Promise<Company> {
    await this.ensureCompanyAccess(id, currentUser);
    return this.prisma.company.delete({ where: { id } });
  }

  private async ensureCompanyAccess(id: number, currentUser: JwtPayload): Promise<void> {
    const exists = await this.prisma.company.findFirst({
      where: companyWhereForUser(id, { id: currentUser.sub, role: currentUser.role }),
      select: { id: true },
    });

    if (!exists) {
      throw new ForbiddenException('You do not have access to this company');
    }
  }

  private async validateEvaluatorIds(evaluatorIds: string[]): Promise<void> {
    if (evaluatorIds.length === 0) {
      return;
    }

    const evaluators = await this.prisma.user.findMany({
      where: {
        id: { in: evaluatorIds },
        role: Role.AVALIADOR,
      },
      select: { id: true },
    });

    if (evaluators.length !== evaluatorIds.length) {
      throw new BadRequestException(
        'All evaluatorIds must reference existing users with role AVALIADOR',
      );
    }
  }

  private readonly defaultInclude = {
    createdBy: {
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    },
    assignments: {
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    },
    assessments: true,
    _count: {
      select: { assessments: true },
    },
  } satisfies Prisma.CompanyInclude;
}
