import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Assessment, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';

type AssessmentWithRelations = Assessment & {
  company: {
    id: number;
    name: string;
    segment: string;
  };
  assessor: {
    id: string;
    name: string | null;
    email: string;
    role: Role;
  };
  responses: Array<{
    id: number;
    questionId: number;
    questionVersion: number;
    responseValue: string;
    score: Prisma.Decimal;
    evidence: string | null;
    evidenceFileUrl: string | null;
    observation: string | null;
    answeredAt: Date | null;
    createdAt: Date;
    question: {
      id: number;
      text: string;
      category: string;
      responseType: string;
    };
    evidenceFiles: Array<{
      id: number;
      fileName: string;
      fileUrl: string;
      fileSize: number;
      mimeType: string;
      uploadedAt: Date;
    }>;
  }>;
};

@Injectable()
export class AssessmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createAssessmentDto: CreateAssessmentDto): Promise<AssessmentWithRelations> {
    await this.ensureCompanyExists(createAssessmentDto.companyId);
    await this.ensureAssessorIsEvaluator(createAssessmentDto.assessorId);

    const assessment = await this.prisma.assessment.create({
      data: {
        companyId: createAssessmentDto.companyId,
        assessorId: createAssessmentDto.assessorId,
        status: createAssessmentDto.status,
        startedAt: createAssessmentDto.startedAt ? new Date(createAssessmentDto.startedAt) : undefined,
        completedAt: createAssessmentDto.completedAt ? new Date(createAssessmentDto.completedAt) : undefined,
      },
    });

    return this.findOne(assessment.id);
  }

  async findAll(): Promise<AssessmentWithRelations[]> {
    return this.prisma.assessment.findMany({
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number): Promise<AssessmentWithRelations> {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id },
      include: this.defaultInclude,
    });

    if (!assessment) {
      throw new NotFoundException(`Assessment with id '${id}' not found`);
    }

    return assessment;
  }

  private async ensureCompanyExists(companyId: number): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException(`Company with id '${companyId}' not found`);
    }
  }

  private async ensureAssessorIsEvaluator(assessorId: string): Promise<void> {
    const assessor = await this.prisma.user.findUnique({
      where: { id: assessorId },
      select: { id: true, role: true },
    });

    if (!assessor) {
      throw new NotFoundException(`User with id '${assessorId}' not found`);
    }

    if (assessor.role !== Role.AVALIADOR) {
      throw new BadRequestException('assessorId must reference a user with role AVALIADOR');
    }
  }

  private readonly defaultInclude: Prisma.AssessmentInclude = {
    company: {
      select: {
        id: true,
        name: true,
        segment: true,
      },
    },
    assessor: {
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    },
    responses: {
      include: {
        question: {
          select: {
            id: true,
            text: true,
            category: true,
            responseType: true,
          },
        },
        evidenceFiles: true,
      },
      orderBy: { createdAt: 'asc' },
    },
  };
}
