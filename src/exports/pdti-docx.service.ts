import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { isAdmin, userCompanyScope } from '../auth/user-scope.helper';
import { PrismaService } from '../prisma/prisma.service';

const CORP_BLUE_HEX = '1E3A5F';
const STRIPE_HEX = 'EEF3FB';

@Injectable()
export class PdtiDocxService {
  constructor(private readonly prisma: PrismaService) {}

  async generatePdtiDocx(pdtiId: number, currentUser: JwtPayload): Promise<Buffer> {
    const pdti = await this.fetchPdti(pdtiId, currentUser);
    const generatedAt = new Date().toLocaleDateString('pt-BR');
    const content: Array<Paragraph | Table> = [];

    content.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: 'ASCEND', bold: true, size: 72, color: CORP_BLUE_HEX }),
        ],
        spacing: { after: 200 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'Plano Diretor de Tecnologia da Informação',
            size: 24,
            color: '555555',
          }),
        ],
        spacing: { after: 400 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: pdti.title, bold: true, size: 40 })],
        spacing: { after: 240 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: pdti.company.name, bold: true, size: 32 })],
        spacing: { after: 200 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: `Ano: ${pdti.year ?? new Date().getFullYear()}`, size: 28 }),
        ],
        spacing: { after: 160 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `Status: ${pdti.status}`, size: 24 })],
        spacing: { after: 160 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `Responsável: ${pdti.responsible ?? 'Não informado'}`,
            size: 24,
          }),
        ],
        spacing: { after: 600 },
      }),
      new Paragraph({ pageBreakBefore: true }),
    );

    content.push(
      new Paragraph({ text: '1. Missão, Visão e Valores', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Missão: ', bold: true }),
          new TextRun(pdti.mission ?? 'Não informado'),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Visão: ', bold: true }),
          new TextRun(pdti.vision ?? 'Não informado'),
        ],
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Valores: ', bold: true }),
          new TextRun(pdti.values ?? 'Não informado'),
        ],
      }),
      new Paragraph({ pageBreakBefore: true }),
    );

    content.push(
      new Paragraph({ text: '2. Cenários AS-IS e TO-BE', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Cenário AS-IS (atual): ', bold: true }),
          new TextRun(pdti.currentScenario ?? 'Não informado'),
        ],
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Cenário TO-BE (desejado): ', bold: true }),
          new TextRun(pdti.desiredScenario ?? 'Não informado'),
        ],
      }),
      new Paragraph({ pageBreakBefore: true }),
    );

    content.push(
      new Paragraph({ text: '3. Análise SWOT', heading: HeadingLevel.HEADING_1 }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              this.headerCell('Forças'),
              this.headerCell('Fraquezas'),
            ],
          }),
          new TableRow({
            children: [
              this.dataCell(pdti.swotStrengths ?? 'Não informado', true),
              this.dataCell(pdti.swotWeaknesses ?? 'Não informado', true),
            ],
          }),
          new TableRow({
            children: [
              this.headerCell('Oportunidades'),
              this.headerCell('Ameaças'),
            ],
          }),
          new TableRow({
            children: [
              this.dataCell(pdti.swotOpportunities ?? 'Não informado', false),
              this.dataCell(pdti.swotThreats ?? 'Não informado', false),
            ],
          }),
        ],
      }),
      new Paragraph({ pageBreakBefore: true }),
    );

    content.push(
      new Paragraph({ text: '4. Objetivos Estratégicos', heading: HeadingLevel.HEADING_1 }),
    );
    if (pdti.objectives.length === 0) {
      content.push(new Paragraph('Nenhum objetivo estratégico cadastrado.'));
    } else {
      content.push(
        this.table(
          ['Título', 'Descrição', 'Prioridade', 'Prazo', 'Status'],
          pdti.objectives.map((objective) => [
            objective.title,
            objective.description ?? 'N/A',
            objective.priority ?? 'N/A',
            this.formatDate(objective.dueDate),
            objective.status,
          ]),
        ),
      );
    }
    content.push(new Paragraph({ pageBreakBefore: true }));

    content.push(
      new Paragraph({ text: '5. Plano de Ações por Objetivo', heading: HeadingLevel.HEADING_1 }),
    );
    const objectivesWithActions = pdti.objectives.filter((objective) => objective.actions.length > 0);
    if (objectivesWithActions.length === 0) {
      content.push(new Paragraph('Nenhuma ação registrada.'));
    } else {
      objectivesWithActions.forEach((objective) => {
        content.push(
          new Paragraph({ text: objective.title, heading: HeadingLevel.HEADING_2 }),
          this.table(
            ['Ação', 'Descrição', 'Responsável', 'Prazo', 'Status'],
            objective.actions.map((action) => [
              action.title,
              action.description ?? 'N/A',
              action.assignedTo ?? 'N/A',
              this.formatDate(action.dueDate),
              action.status,
            ]),
          ),
          new Paragraph({ text: '', spacing: { after: 200 } }),
        );
      });
    }
    content.push(new Paragraph({ pageBreakBefore: true }));

    content.push(new Paragraph({ text: '6. Indicadores', heading: HeadingLevel.HEADING_1 }));
    if (pdti.indicators.length === 0) {
      content.push(new Paragraph('Nenhum indicador cadastrado.'));
    } else {
      content.push(
        this.table(
          ['Indicador', 'Baseline', 'Meta', 'Valor Atual'],
          pdti.indicators.map((indicator) => [
            indicator.name,
            indicator.baseline ?? 'N/A',
            indicator.target ?? 'N/A',
            indicator.currentValue ?? 'N/A',
          ]),
        ),
      );
    }

    const document = new Document({
      sections: [
        {
          properties: {},
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: `${pdti.company.name} | ${generatedAt} | Página `,
                      size: 18,
                      color: '666666',
                    }),
                    new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '666666' }),
                  ],
                }),
              ],
            }),
          },
          children: content,
        },
      ],
    });

    return Packer.toBuffer(document);
  }

  private async fetchPdti(pdtiId: number, currentUser: JwtPayload) {
    const where = isAdmin({ id: currentUser.sub, role: currentUser.role })
      ? { id: pdtiId }
      : { id: pdtiId, company: userCompanyScope(currentUser.sub) };

    const pdti = await this.prisma.pDTI.findFirst({
      where,
      include: {
        company: true,
        objectives: {
          include: { actions: true },
          orderBy: { createdAt: 'asc' },
        },
        indicators: true,
      },
    });

    if (!pdti) {
      throw new NotFoundException(`PDTI with id '${pdtiId}' not found or access denied`);
    }

    return pdti;
  }

  private formatDate(value?: Date | null): string {
    if (!value) {
      return 'N/A';
    }
    return new Date(value).toLocaleDateString('pt-BR');
  }

  private headerCell(text: string): TableCell {
    return new TableCell({
      shading: { type: ShadingType.CLEAR, fill: CORP_BLUE_HEX, color: 'auto' },
      children: [
        new Paragraph({
          children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18 })],
        }),
      ],
    });
  }

  private dataCell(text: string, striped: boolean): TableCell {
    return new TableCell({
      shading: striped
        ? { type: ShadingType.CLEAR, fill: STRIPE_HEX, color: 'auto' }
        : undefined,
      children: [new Paragraph({ children: [new TextRun({ text, size: 16 })] })],
    });
  }

  private table(headers: string[], rows: string[][]): Table {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: headers.map((header) => this.headerCell(header)),
        }),
        ...rows.map((row, index) =>
          new TableRow({
            children: row.map((cell) => this.dataCell(cell, index % 2 === 0)),
          }),
        ),
      ],
    });
  }
}
