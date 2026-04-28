import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FrameworkType, Prisma, Question, QuestionVersion, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

type QuestionWithHistory = Question & {
  createdBy: {
    id: string;
    name: string | null;
    email: string;
    role: Role;
  };
  versions: QuestionVersion[];
};

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) { }

  async create(createQuestionDto: CreateQuestionDto): Promise<QuestionWithHistory> {
    if (
      createQuestionDto.frameworkType &&
      createQuestionDto.frameworkType !== FrameworkType.PROPRIO &&
      !createQuestionDto.frameworkRef
    ) {
      throw new BadRequestException('frameworkRef é obrigatório quando frameworkType não é PROPRIO');
    }

    const frameworkData = this.resolveFrameworkData(createQuestionDto);

    const question = await this.prisma.question.create({
      data: {
        version: 1,
        text: createQuestionDto.text,
        category: createQuestionDto.category,
        weight: createQuestionDto.weight,
        responseType: createQuestionDto.responseType,
        frameworkType: frameworkData.frameworkType,
        frameworkRef: frameworkData.frameworkRef,
        frameworkNote: frameworkData.frameworkNote,
        evidenceRequired: createQuestionDto.evidenceRequired,
        hint: createQuestionDto.hint,
        isActive: true,
        createdById: createQuestionDto.createdById,
      },
    });

    await this.prisma.questionVersion.create({
      data: {
        questionId: question.id,
        version: question.version,
        text: question.text,
        weight: question.weight,
        changedById: createQuestionDto.createdById,
      },
    });

    return this.findOne(question.id);
  }

  async findAll(): Promise<QuestionWithHistory[]> {
    return this.prisma.question.findMany({
      where: { isActive: true },
      include: this.defaultInclude,
      orderBy: [{ category: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  async findOne(id: number): Promise<QuestionWithHistory> {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: this.defaultInclude,
    });

    if (!question) {
      throw new NotFoundException(`Question with id '${id}' not found`);
    }

    return question;
  }

  async findByFramework(frameworkType: FrameworkType): Promise<QuestionWithHistory[]> {
    return this.prisma.question.findMany({
      where: {
        isActive: true,
        frameworkType,
      },
      include: this.defaultInclude,
      orderBy: { id: 'asc' },
    });
  }

  async getFrameworkCoverage(): Promise<Record<FrameworkType, number> & { total: number }> {
    const groups = await this.prisma.question.groupBy({
      by: ['frameworkType'],
      where: { isActive: true },
      _count: { id: true },
    });

    const coverage: Record<FrameworkType, number> & { total: number } = {
      COBIT: 0,
      ITIL: 0,
      ISO_27000: 0,
      PROPRIO: 0,
      total: 0,
    };

    for (const group of groups) {
      coverage[group.frameworkType] += group._count.id;
      coverage.total += group._count.id;
    }

    return coverage;
  }

  async createNewVersion(id: number, updateQuestionDto: UpdateQuestionDto): Promise<QuestionWithHistory> {
    const existing = await this.prisma.question.findUnique({
      where: { id },
    });

    if (!existing || !existing.isActive) {
      throw new NotFoundException(`Active question with id '${id}' not found`);
    }

    const nextVersion = existing.version + 1;

    if (
      updateQuestionDto.frameworkType &&
      updateQuestionDto.frameworkType !== FrameworkType.PROPRIO &&
      !updateQuestionDto.frameworkRef
    ) {
      throw new BadRequestException('frameworkRef é obrigatório quando frameworkType não é PROPRIO');
    }

    const frameworkData = this.resolveFrameworkData(updateQuestionDto, existing);

    await this.prisma.$transaction(async (tx) => {

      await tx.questionVersion.create({
        data: {
          questionId: existing.id,
          version: existing.version,
          text: existing.text,
          weight: existing.weight,
          changedById: updateQuestionDto.changedById,
        },
      });

      await tx.question.update({
        where: { id },
        data: {
          version: nextVersion,
          text: updateQuestionDto.text ?? existing.text,
          category: updateQuestionDto.category ?? existing.category,
          weight: updateQuestionDto.weight ?? existing.weight,
          responseType: updateQuestionDto.responseType ?? existing.responseType,
          frameworkType: frameworkData.frameworkType,
          frameworkRef: frameworkData.frameworkRef,
          frameworkNote: frameworkData.frameworkNote,
          evidenceRequired: updateQuestionDto.evidenceRequired ?? existing.evidenceRequired,
          hint: updateQuestionDto.hint ?? existing.hint,
          isActive: true,
        },
      });
    });

    return this.findOne(id);
  }

  async softDelete(id: number): Promise<QuestionWithHistory> {
    await this.ensureQuestionExists(id);

    await this.prisma.question.update({
      where: { id },
      data: { isActive: false },
    });

    return this.findOne(id);
  }

  private async ensureQuestionExists(id: number): Promise<void> {
    const exists = await this.prisma.question.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`Question with id '${id}' not found`);
    }
  }

  private resolveFrameworkData(
    dto: Pick<CreateQuestionDto, 'frameworkType' | 'frameworkRef' | 'frameworkNote'>
      | Pick<UpdateQuestionDto, 'frameworkType' | 'frameworkRef' | 'frameworkNote'>,
    existing?: Pick<Question, 'frameworkType' | 'frameworkRef' | 'frameworkNote'>,
  ): {
    frameworkType: FrameworkType;
    frameworkRef: string | null;
    frameworkNote: string | null;
  } {
    const frameworkRefWasProvided = dto.frameworkRef !== undefined;
    const frameworkNoteWasProvided = dto.frameworkNote !== undefined;

    const frameworkType = dto.frameworkType ?? existing?.frameworkType ?? FrameworkType.PROPRIO;
    const frameworkRef = frameworkRefWasProvided ? dto.frameworkRef ?? null : existing?.frameworkRef ?? null;
    const frameworkNote = frameworkNoteWasProvided ? dto.frameworkNote ?? null : existing?.frameworkNote ?? null;

    return {
      frameworkType,
      frameworkRef,
      frameworkNote,
    };
  }

  private readonly defaultInclude: Prisma.QuestionInclude = {
    createdBy: {
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    },
    versions: {
      orderBy: { version: 'desc' },
    },
  };
}
