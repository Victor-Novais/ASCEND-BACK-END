import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionnaireTemplateDto } from './dto/create-questionnaire-template.dto';
import { CreateQuestionTemplateDto } from './dto/create-question-template.dto';
import { CreateQuestionTemplateOptionDto } from './dto/create-question-template-option.dto';
import { UpdateQuestionnaireTemplateDto } from './dto/update-questionnaire-template.dto';

const questionInclude = {
  options: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.QuestionTemplateInclude;

@Injectable()
export class QuestionnaireTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateQuestionnaireTemplateDto) {
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.questionnaireTemplate.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          isActive: dto.isActive ?? true,
        },
      });

      if (dto.firstQuestion) {
        await this.createQuestionTx(tx, template.id, dto.firstQuestion);
      }

      return tx.questionnaireTemplate.findUniqueOrThrow({
        where: { id: template.id },
        include: {
          questions: {
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            include: questionInclude,
          },
        },
      });
    });
  }

  async update(id: number, dto: UpdateQuestionnaireTemplateDto) {
    await this.ensureTemplate(id);
    return this.prisma.questionnaireTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: {
        questions: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          include: questionInclude,
        },
      },
    });
  }

  async findAllForCatalog(includeInactiveForAdmin: boolean) {
    return this.prisma.questionnaireTemplate.findMany({
      where: includeInactiveForAdmin ? undefined : { isActive: true },
      include: {
        questions: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          include: questionInclude,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: number) {
    const template = await this.prisma.questionnaireTemplate.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          include: questionInclude,
        },
      },
    });
    if (!template) {
      throw new NotFoundException(`Questionnaire template ${id} not found`);
    }
    return template;
  }

  async addQuestion(templateId: number, dto: CreateQuestionTemplateDto) {
    await this.ensureTemplate(templateId);
    return this.prisma.$transaction(async (tx) => {
      await this.createQuestionTx(tx, templateId, dto);
      return tx.questionnaireTemplate.findUniqueOrThrow({
        where: { id: templateId },
        include: {
          questions: {
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            include: questionInclude,
          },
        },
      });
    });
  }

  async addOption(questionTemplateId: number, dto: CreateQuestionTemplateOptionDto) {
    await this.ensureQuestion(questionTemplateId);
    await this.prisma.questionTemplateOption.create({
      data: {
        questionTemplateId,
        label: dto.label.trim(),
        scoreValue: new Prisma.Decimal(dto.scoreValue),
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    const q = await this.prisma.questionTemplate.findUniqueOrThrow({
      where: { id: questionTemplateId },
      select: { questionnaireTemplateId: true },
    });
    return this.findOne(q.questionnaireTemplateId);
  }

  private async createQuestionTx(
    tx: Prisma.TransactionClient,
    questionnaireTemplateId: number,
    dto: CreateQuestionTemplateDto,
  ) {
    const q = await tx.questionTemplate.create({
      data: {
        questionnaireTemplateId,
        text: dto.text.trim(),
        category: dto.category,
        weight: new Prisma.Decimal(dto.weight),
        responseType: dto.responseType,
        evidenceRequired: dto.evidenceRequired ?? false,
        hint: dto.hint?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    if (dto.options?.length) {
      await tx.questionTemplateOption.createMany({
        data: dto.options.map((o, idx) => ({
          questionTemplateId: q.id,
          label: o.label.trim(),
          scoreValue: new Prisma.Decimal(o.scoreValue),
          sortOrder: o.sortOrder ?? idx,
        })),
      });
    }
  }

  private async ensureTemplate(id: number): Promise<void> {
    const found = await this.prisma.questionnaireTemplate.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException(`Questionnaire template ${id} not found`);
    }
  }

  private async ensureQuestion(id: number): Promise<void> {
    const found = await this.prisma.questionTemplate.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException(`Question template ${id} not found`);
    }
  }
}
