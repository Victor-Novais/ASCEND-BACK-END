import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Assessment, Company, Prisma, Role } from '@prisma/client';
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

  async create(createCompanyDto: CreateCompanyDto): Promise<CompanyWithRelations> {
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
        createdById: createCompanyDto.createdById,
      },
    });

    if (evaluatorIds.length > 0) {
      await this.prisma.userCompanyAssignment.createMany({
        data: evaluatorIds.map((userId) => ({
          userId,
          companyId: company.id,
        })),
        skipDuplicates: true,
      });
    }

    return this.findOne(company.id);
  }

  async findAll(): Promise<CompanyWithRelations[]> {
    return this.prisma.company.findMany({
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number): Promise<CompanyWithRelations> {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: this.defaultInclude,
    });

    if (!company) {
      throw new NotFoundException(`Company with id '${id}' not found`);
    }

    return company;
  }

  async update(id: number, updateCompanyDto: UpdateCompanyDto): Promise<CompanyWithRelations> {
    await this.ensureCompanyExists(id);

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

    return this.findOne(id);
  }

  async remove(id: number): Promise<Company> {
    await this.ensureCompanyExists(id);
    return this.prisma.company.delete({ where: { id } });
  }

  private async ensureCompanyExists(id: number): Promise<void> {
    const exists = await this.prisma.company.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`Company with id '${id}' not found`);
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
