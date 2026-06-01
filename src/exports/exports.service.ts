import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableOfContents, TableRow, TextRun, WidthType } from 'docx';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { assessmentWhereForUser, userCompanyScope } from '../auth/user-scope.helper';

@Injectable()
export class ExportsService {
  constructor(private readonly prisma: PrismaService) {}

  private formatDate(value?: Date | null): string {
    if (!value) {
      return 'Não informado';
    }
    return value.toISOString().slice(0, 10);
  }

  private async ensurePdtiAccess(pdtiId: number, currentUser: JwtPayload) {
    const pdti = await this.prisma.pDTI.findFirst({
      where: {
        id: pdtiId,
        company: userCompanyScope(currentUser.sub),
      },
      include: {
        company: true,
        assessment: true,
        objectives: {
          include: {
            actions: {
              include: {
                actionPlan: true,
              },
            },
          },
        },
        indicators: true,
      },
    });

    if (!pdti) {
      throw new NotFoundException(`PDTI with id '${pdtiId}' not found or access denied`);
    }

    return pdti;
  }

  private async createPdfBuffer(build: (doc: PDFDocument) => void) {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    return new Promise<Buffer>((resolve) => {
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      build(doc);
      doc.end();
    });
  }

  async generatePdtiDocx(pdtiId: number, currentUser: JwtPayload): Promise<Buffer> {
    const pdti = await this.ensurePdtiAccess(pdtiId, currentUser);
    const risks = await this.prisma.risk.findMany({
      where: { assessmentId: pdti.assessmentId ?? undefined },
      orderBy: { riskScore: 'desc' },
      take: 5,
    });

    const content: Array<Paragraph | Table> = [];

    content.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'ASCEND', bold: true, size: 48 }),
        ],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ text: '', spacing: { after: 400 } }),
      new Paragraph({
        children: [new TextRun({ text: pdti.company.name, bold: true, size: 32 })],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ text: '', spacing: { after: 200 } }),
      new Paragraph({
        children: [new TextRun({ text: pdti.title, underline: {} })],
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ text: this.formatDate(new Date(`${pdti.year}-01-01`)), alignment: AlignmentType.CENTER }),
      new Paragraph({ text: '', spacing: { after: 400 } }),
      new Paragraph({ text: '', pageBreakBefore: true }),
      new Paragraph({ text: 'Sumário', heading: HeadingLevel.HEADING_1 }),
      new TableOfContents('Sumário', {
        hyperlink: true,
        headingStyleRange: '1-3',
      }),
      new Paragraph({ text: '', pageBreakBefore: true }),
      new Paragraph({ text: '1. Apresentação', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: `Missão: ${pdti.mission ?? 'Não informado'}` }),
      new Paragraph({ text: `Visão: ${pdti.vision ?? 'Não informado'}` }),
      new Paragraph({ text: `Sumário Executivo: ${pdti.summary ?? 'Não informado'}` }),
      new Paragraph({ text: `Objetivos Estratégicos: ${pdti.strategicGoals ?? 'Não informado'}` }),
      new Paragraph({ text: '', pageBreakBefore: true }),
      new Paragraph({ text: '2. Diagnóstico', heading: HeadingLevel.HEADING_1 }),
    );

    content.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'Pontos fortes', bold: true })],
                  }),
                ],
              }),
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: 'Pontos fracos', bold: true })],
                  }),
                ],
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(pdti.summary ?? 'N/A')] }),
              new TableCell({ children: [new Paragraph(pdti.strategicGoals ?? 'N/A')] }),
            ],
          }),
        ],
      }),
      new Paragraph({ text: '', pageBreakBefore: true }),
      new Paragraph({ text: '3. Objetivos Estratégicos', heading: HeadingLevel.HEADING_1 }),
    );

    if (pdti.objectives.length > 0) {
      content.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Objetivo', bold: true })],
                    }),
                  ],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Descrição', bold: true })],
                    }),
                  ],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Prioridade', bold: true })],
                    }),
                  ],
                }),
              ],
            }),
            ...pdti.objectives.map((objective) =>
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(objective.title)] }),
                  new TableCell({ children: [new Paragraph(objective.description ?? 'N/A')] }),
                  new TableCell({ children: [new Paragraph(objective.priority ?? 'N/A')] }),
                ],
              }),
            ),
          ],
        }),
      );
    } else {
      content.push(new Paragraph('Nenhum objetivo estratégico cadastrado.'));
    }

    content.push(
      new Paragraph({ text: '', pageBreakBefore: true }),
      new Paragraph({ text: '4. Plano de Ação', heading: HeadingLevel.HEADING_1 }),
    );

    const actions = pdti.objectives.flatMap((objective) =>
      objective.actions.map((action) => ({
        objectiveTitle: objective.title,
        actionTitle: action.title,
        action,
      })),
    );

    if (actions.length > 0) {
      content.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Objetivo', bold: true })],
                    }),
                  ],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Ação', bold: true })],
                    }),
                  ],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Como / O quê', bold: true })],
                    }),
                  ],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Prazo', bold: true })],
                    }),
                  ],
                }),
              ],
            }),
            ...actions.map(({ objectiveTitle, action }) =>
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(objectiveTitle)] }),
                  new TableCell({ children: [new Paragraph(action.title)] }),
                  new TableCell({
                    children: [
                      new Paragraph(`Descrição: ${action.description ?? 'N/A'}`),
                      new Paragraph(`Local: ${action.actionPlan?.whereLocation ?? 'N/A'}`),
                    ],
                  }),
                  new TableCell({ children: [new Paragraph(this.formatDate(action.dueDate))] }),
                ],
              }),
            ),
          ],
        }),
      );
    } else {
      content.push(new Paragraph('Nenhuma ação registrada.'));
    }

    content.push(
      new Paragraph({ text: '', pageBreakBefore: true }),
      new Paragraph({ text: '5. Cronograma', heading: HeadingLevel.HEADING_1 }),
    );

    if (actions.length > 0) {
      content.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Ação', bold: true })],
                    }),
                  ],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Status', bold: true })],
                    }),
                  ],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Prazo', bold: true })],
                    }),
                  ],
                }),
              ],
            }),
            ...actions.map(({ action }) =>
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(action.title)] }),
                  new TableCell({ children: [new Paragraph(action.status ?? 'N/A')] }),
                  new TableCell({ children: [new Paragraph(this.formatDate(action.dueDate))] }),
                ],
              }),
            ),
          ],
        }),
      );
    } else {
      content.push(new Paragraph('Sem cronograma definido.'));
    }

    content.push(
      new Paragraph({ text: '', pageBreakBefore: true }),
      new Paragraph({ text: '6. Indicadores KPI', heading: HeadingLevel.HEADING_1 }),
    );

    if (pdti.indicators.length > 0) {
      content.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Indicador', bold: true })],
                    }),
                  ],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Base', bold: true })],
                    }),
                  ],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Meta', bold: true })],
                    }),
                  ],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Atual', bold: true })],
                    }),
                  ],
                }),
              ],
            }),
            ...pdti.indicators.map((indicator) =>
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(indicator.name)] }),
                  new TableCell({ children: [new Paragraph(indicator.baseline ?? 'N/A')] }),
                  new TableCell({ children: [new Paragraph(indicator.target ?? 'N/A')] }),
                  new TableCell({ children: [new Paragraph(indicator.currentValue ?? 'N/A')] }),
                ],
              }),
            ),
          ],
        }),
      );
    } else {
      content.push(new Paragraph('Nenhum indicador cadastrado.'));
    }

    content.push(
      new Paragraph({ text: '', pageBreakBefore: true }),
      new Paragraph({ text: '7. Gestão de Riscos', heading: HeadingLevel.HEADING_1 }),
    );

    if (risks.length > 0) {
      content.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Risco', bold: true })],
                    }),
                  ],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Impacto', bold: true })],
                    }),
                  ],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Probabilidade', bold: true })],
                    }),
                  ],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: 'Score', bold: true })],
                    }),
                  ],
                }),
              ],
            }),
            ...risks.map((risk) =>
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(risk.title)] }),
                  new TableCell({ children: [new Paragraph(risk.impact)] }),
                  new TableCell({ children: [new Paragraph(risk.probability)] }),
                  new TableCell({ children: [new Paragraph(risk.riskScore.toString())] }),
                ],
              }),
            ),
          ],
        }),
      );
    } else {
      content.push(new Paragraph('Nenhum risco identificado no assessment associado.'));
    }

    const document = new Document({ sections: [{ properties: {}, children: content }] });
    return Packer.toBuffer(document);
  }

  async generatePdtiPdf(pdtiId: number, currentUser: JwtPayload): Promise<Buffer> {
    const pdti = await this.ensurePdtiAccess(pdtiId, currentUser);
    const risks = await this.prisma.risk.findMany({
      where: { assessmentId: pdti.assessmentId ?? undefined },
      orderBy: { riskScore: 'desc' },
      take: 5,
    });

    return this.createPdfBuffer((doc) => {
      doc.fontSize(26).text('ASCEND', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(18).text(pdti.company.name, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).text(pdti.title, { align: 'center' });
      doc.moveDown(1);
      doc.fontSize(10).text(`Período: ${pdti.year ?? 'N/A'}`, { align: 'center' });
      doc.addPage();

      doc.fontSize(16).text('1. Apresentação', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).text(`Missão: ${pdti.mission ?? 'Não informado'}`);
      doc.moveDown(0.2);
      doc.text(`Visão: ${pdti.vision ?? 'Não informado'}`);
      doc.moveDown(0.2);
      doc.text(`Sumário Executivo: ${pdti.summary ?? 'Não informado'}`);
      doc.moveDown(0.2);
      doc.text(`Objetivos Estratégicos: ${pdti.strategicGoals ?? 'Não informado'}`);

      doc.addPage();
      doc.fontSize(16).text('2. Diagnóstico', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).text('Pontos Fortes', { bold: true });
      doc.text(pdti.summary ?? 'Não informado');
      doc.moveDown(0.5);
      doc.fontSize(12).text('Pontos Fracos', { bold: true });
      doc.text(pdti.strategicGoals ?? 'Não informado');

      doc.addPage();
      doc.fontSize(16).text('3. Objetivos Estratégicos', { underline: true });
      doc.moveDown(0.5);
      if (pdti.objectives.length === 0) {
        doc.fontSize(12).text('Nenhum objetivo estratégico cadastrado.');
      } else {
        pdti.objectives.forEach((objective) => {
          doc.fontSize(12).text(`• ${objective.title}`);
          doc.fontSize(10).text(`Descrição: ${objective.description ?? 'N/A'}`);
          doc.fontSize(10).text(`Prioridade: ${objective.priority ?? 'N/A'}`);
          doc.moveDown(0.3);
        });
      }

      doc.addPage();
      doc.fontSize(16).text('4. Plano de Ação', { underline: true });
      doc.moveDown(0.5);
      const actions = pdti.objectives.flatMap((objective) =>
        objective.actions.map((action) => ({ objective, action })),
      );
      if (actions.length === 0) {
        doc.fontSize(12).text('Nenhuma ação registrada.');
      } else {
        actions.forEach(({ objective, action }) => {
          doc.fontSize(12).text(`Objetivo: ${objective.title}`);
          doc.fontSize(12).text(`Ação: ${action.title}`);
          doc.fontSize(10).text(`Descrição: ${action.description ?? 'N/A'}`);
          doc.fontSize(10).text(`Prazo: ${this.formatDate(action.dueDate)}`);
          doc.fontSize(10).text(`Status: ${action.status ?? 'N/A'}`);
          doc.moveDown(0.5);
        });
      }

      doc.addPage();
      doc.fontSize(16).text('5. Cronograma', { underline: true });
      doc.moveDown(0.5);
      if (actions.length === 0) {
        doc.fontSize(12).text('Sem cronograma definido.');
      } else {
        actions.forEach(({ action }) => {
          doc.fontSize(12).text(`${action.title} — ${this.formatDate(action.dueDate)} — ${action.status ?? 'N/A'}`);
        });
      }

      doc.addPage();
      doc.fontSize(16).text('6. Indicadores KPI', { underline: true });
      doc.moveDown(0.5);
      if (pdti.indicators.length === 0) {
        doc.fontSize(12).text('Nenhum indicador cadastrado.');
      } else {
        pdti.indicators.forEach((indicator) => {
          doc.fontSize(12).text(`• ${indicator.name}`);
          doc.fontSize(10).text(`Base: ${indicator.baseline ?? 'N/A'}`);
          doc.fontSize(10).text(`Meta: ${indicator.target ?? 'N/A'}`);
          doc.fontSize(10).text(`Atual: ${indicator.currentValue ?? 'N/A'}`);
          doc.moveDown(0.3);
        });
      }

      doc.addPage();
      doc.fontSize(16).text('7. Gestão de Riscos', { underline: true });
      doc.moveDown(0.5);
      if (risks.length === 0) {
        doc.fontSize(12).text('Nenhum risco identificado.');
      } else {
        risks.forEach((risk) => {
          doc.fontSize(12).text(`• ${risk.title}`);
          doc.fontSize(10).text(`Impacto: ${risk.impact}`);
          doc.fontSize(10).text(`Probabilidade: ${risk.probability}`);
          doc.fontSize(10).text(`Score: ${risk.riskScore}`);
          doc.moveDown(0.4);
        });
      }
    });
  }

  async generateRisksXlsx(
    companyId: number | undefined,
    assessmentId: number | undefined,
    currentUser: JwtPayload,
  ): Promise<Buffer> {
    if (!companyId && !assessmentId) {
      throw new BadRequestException('companyId or assessmentId must be provided');
    }

    if (companyId) {
      const company = await this.prisma.company.findFirst({
        where: {
          id: companyId,
          ...userCompanyScope(currentUser.sub),
        },
      });
      if (!company) {
        throw new NotFoundException('Company not found or access denied');
      }
    }

    if (assessmentId) {
      const assessment = await this.prisma.assessment.findFirst({
        where: assessmentWhereForUser(assessmentId, {
          id: currentUser.sub,
          role: currentUser.role,
        }),
      });
      if (!assessment) {
        throw new NotFoundException('Assessment not found or access denied');
      }
    }

    const filters: any = {};
    if (companyId) {
      filters.companyId = companyId;
    }
    if (assessmentId) {
      filters.assessmentId = assessmentId;
    }

    const risks = await this.prisma.risk.findMany({
      where: filters,
      orderBy: { riskScore: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Riscos');
    sheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Empresa', key: 'company', width: 32 },
      { header: 'Assessment', key: 'assessment', width: 16 },
      { header: 'Título', key: 'title', width: 40 },
      { header: 'Categoria', key: 'category', width: 20 },
      { header: 'Impacto', key: 'impact', width: 16 },
      { header: 'Probabilidade', key: 'probability', width: 20 },
      { header: 'Score', key: 'riskScore', width: 10 },
      { header: 'Status', key: 'status', width: 18 },
      { header: 'Responsável', key: 'responsible', width: 24 },
    ];

    await Promise.all(
      risks.map(async (risk) => {
        const company = await this.prisma.company.findUnique({ where: { id: risk.companyId } });
        sheet.addRow({
          id: risk.id,
          company: company?.name ?? 'N/A',
          assessment: risk.assessmentId,
          title: risk.title,
          category: risk.category,
          impact: risk.impact,
          probability: risk.probability,
          riskScore: risk.riskScore,
          status: risk.status,
          responsible: risk.responsibleId ?? 'N/A',
        });
      }),
    );

    const data = await workbook.xlsx.writeBuffer();
    if (data instanceof ArrayBuffer) {
      return Buffer.from(new Uint8Array(data));
    }
    return Buffer.from(data);
  }

  async generateReportPdf(assessmentId: number, currentUser: JwtPayload): Promise<Buffer> {
    const assessment = await this.prisma.assessment.findFirst({
      where: assessmentWhereForUser(assessmentId, {
        id: currentUser.sub,
        role: currentUser.role,
      }),
      include: {
        company: true,
        report: true,
      },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found or access denied');
    }

    const report = assessment.report;
    if (!report) {
      throw new NotFoundException('Report not found for this assessment');
    }

    const risks = await this.prisma.risk.findMany({
      where: { assessmentId },
      orderBy: { riskScore: 'desc' },
      take: 5,
    });

    const actionPlans = await this.prisma.actionPlan.findMany({
      where: { assessmentId },
      orderBy: { priority: 'asc' },
      take: 5,
    });

    const categoryScores = report.categoryScores as Record<string, number>;
    const strengths = Array.isArray(report.strengths) ? report.strengths : [];
    const weaknesses = Array.isArray(report.weaknesses) ? report.weaknesses : [];
    const recommendations = Array.isArray(report.recommendations) ? report.recommendations : [];

    return this.createPdfBuffer((doc) => {
      doc.fontSize(26).text('ASCEND', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(18).text(assessment.company.name, { align: 'center' });
      doc.moveDown(1);
      doc.fontSize(14).text(`Relatório de Maturidade — Assessment ${assessmentId}`, { align: 'center' });
      doc.moveDown(1);
      doc.fontSize(12).text(`Total Score: ${report.totalScore.toFixed(2)}`);
      doc.text(`Maturity Level: ${report.maturityLevel}`);
      doc.moveDown(1);

      doc.fontSize(16).text('Resultado por categoria', { underline: true });
      doc.moveDown(0.5);
      const chartWidth = 320;
      Object.entries(categoryScores).forEach(([category, value]) => {
        const barWidth = Math.min(chartWidth, Math.max(10, Number(value) / 100 * chartWidth));
        doc.fontSize(10).text(`${category}: ${Number(value).toFixed(2)}`, { continued: true });
        const x = doc.x + 10;
        const y = doc.y - 12;
        doc.rect(x, y, barWidth, 8).fill('#4a90e2');
        doc.fillColor('black');
        doc.moveDown(1.2);
      });

      doc.addPage();
      doc.fontSize(16).text('Pontos Fortes', { underline: true });
      doc.moveDown(0.5);
      if (strengths.length === 0) {
        doc.fontSize(12).text('Nenhum ponto forte disponível.');
      } else {
        strengths.forEach((item) => {
          doc.fontSize(12).text(`• ${item}`);
        });
      }

      doc.moveDown(1);
      doc.fontSize(16).text('Pontos Fracos', { underline: true });
      doc.moveDown(0.5);
      if (weaknesses.length === 0) {
        doc.fontSize(12).text('Nenhum ponto fraco disponível.');
      } else {
        weaknesses.forEach((item) => {
          doc.fontSize(12).text(`• ${item}`);
        });
      }

      doc.addPage();
      doc.fontSize(16).text('Top 5 Riscos', { underline: true });
      doc.moveDown(0.5);
      if (risks.length === 0) {
        doc.fontSize(12).text('Nenhum risco cadastrado.');
      } else {
        risks.forEach((risk, index) => {
          doc.fontSize(12).text(`${index + 1}. ${risk.title}`);
          doc.fontSize(10).text(`Impacto: ${risk.impact} • Probabilidade: ${risk.probability} • Score: ${risk.riskScore}`);
          doc.moveDown(0.4);
        });
      }

      doc.moveDown(1);
      doc.fontSize(16).text('Top 5 Planos de Ação', { underline: true });
      doc.moveDown(0.5);
      if (actionPlans.length === 0) {
        doc.fontSize(12).text('Nenhum plano de ação disponível.');
      } else {
        actionPlans.forEach((plan, index) => {
          doc.fontSize(12).text(`${index + 1}. ${plan.title}`);
          doc.fontSize(10).text(`Prioridade: ${plan.priority} • Status: ${plan.status} • Prazo: ${this.formatDate(plan.dueDate)}`);
          doc.fontSize(10).text(`Descrição: ${plan.description ?? 'N/A'}`);
          doc.moveDown(0.5);
        });
      }

      doc.addPage();
      doc.fontSize(16).text('Recomendações', { underline: true });
      doc.moveDown(0.5);
      if (recommendations.length === 0) {
        doc.fontSize(12).text('Nenhuma recomendação disponível.');
      } else {
        recommendations.forEach((item) => {
          doc.fontSize(12).text(`• ${item}`);
        });
      }
    });
  }
}
