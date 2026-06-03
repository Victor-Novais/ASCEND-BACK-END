import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { isAdmin, userCompanyScope } from '../auth/user-scope.helper';

const CORP_BLUE = '#1e3a5f';
const CORP_BLUE_HEX = '1E3A5F';
const WHITE = '#ffffff';
const STRIPE_BG = '#f0f5fb';
const STRIPE_HEX = 'EEF3FB';
const BORDER_COLOR = '#c8d0dc';
const TEXT_COLOR = '#1a1a1a';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  private fmtDate(v?: Date | null): string {
    if (!v) return 'N/A';
    return new Date(v).toLocaleDateString('pt-BR');
  }

  private createPdfBuffer(build: (doc: PDFDocument) => void): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    return new Promise<Buffer>((resolve) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      build(doc);
      doc.end();
    });
  }

  private drawSectionTitle(doc: PDFDocument, title: string): void {
    doc.font('Helvetica-Bold').fontSize(14).fillColor(CORP_BLUE).text(title);
    const lineY = doc.y + 2;
    doc
      .strokeColor(CORP_BLUE)
      .lineWidth(0.8)
      .moveTo(50, lineY)
      .lineTo(doc.page.width - 50, lineY)
      .stroke();
    doc.moveDown(0.6);
    doc.fillColor(TEXT_COLOR).font('Helvetica').fontSize(11);
  }

  private drawPdfTable(
    doc: PDFDocument,
    headers: string[],
    rows: string[][],
    colRatios: number[],
  ): void {
    const ML = 50;
    const PAGE_W = doc.page.width - 100;
    const HEADER_H = 22;
    const ROW_H = 18;
    const PAD = 4;

    const total = colRatios.reduce((s, r) => s + r, 0);
    const widths = colRatios.map((r) => (r / total) * PAGE_W);

    let curY = doc.y;

    const drawCells = (
      cells: string[],
      rowY: number,
      rowH: number,
      bg: string,
      fg: string,
      bold: boolean,
    ) => {
      let x = ML;
      widths.forEach((w, i) => {
        doc.rect(x, rowY, w, rowH).fill(bg);
        doc.strokeColor(BORDER_COLOR).lineWidth(0.3).rect(x, rowY, w, rowH).stroke();
        doc
          .fillColor(fg)
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(bold ? 8 : 7.5)
          .text(cells[i] ?? '', x + PAD, rowY + PAD + 1, {
            width: w - PAD * 2,
            lineBreak: false,
            ellipsis: true,
          });
        x += w;
      });
    };

    const needsBreak = (h: number) =>
      curY + h > doc.page.height - doc.page.margins.bottom - 10;

    if (needsBreak(HEADER_H)) {
      doc.addPage();
      curY = 50;
    }
    drawCells(headers, curY, HEADER_H, CORP_BLUE, WHITE, true);
    curY += HEADER_H;

    rows.forEach((row, idx) => {
      if (needsBreak(ROW_H)) {
        doc.addPage();
        curY = 50;
        drawCells(headers, curY, HEADER_H, CORP_BLUE, WHITE, true);
        curY += HEADER_H;
      }
      const bg = idx % 2 === 0 ? WHITE : STRIPE_BG;
      drawCells(row, curY, ROW_H, bg, TEXT_COLOR, false);
      curY += ROW_H;
    });

    doc.y = curY + 10;
    doc.x = ML;
  }

  private makeDocxHeaderCell(text: string): TableCell {
    return new TableCell({
      shading: { type: ShadingType.CLEAR, fill: CORP_BLUE_HEX, color: 'auto' },
      children: [
        new Paragraph({
          children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18 })],
        }),
      ],
    });
  }

  private makeDocxDataCell(text: string, even: boolean): TableCell {
    return new TableCell({
      shading: even
        ? undefined
        : { type: ShadingType.CLEAR, fill: STRIPE_HEX, color: 'auto' },
      children: [
        new Paragraph({ children: [new TextRun({ text, size: 16 })] }),
      ],
    });
  }

  private makeDocxTable(headers: string[], rows: string[][]): Table {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: headers.map((h) => this.makeDocxHeaderCell(h)),
        }),
        ...rows.map(
          (row, idx) =>
            new TableRow({
              children: row.map((cell) =>
                this.makeDocxDataCell(cell, idx % 2 === 0),
              ),
            }),
        ),
      ],
    });
  }

  private levelOrder(level: string): number {
    const n = level.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return ({ CRITICO: 0, ALTO: 1, MEDIO: 2, BAIXO: 3 } as Record<string, number>)[n] ?? 99;
  }

  private levelArgb(level: string): string {
    const n = level.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return (
      ({ CRITICO: 'FFFF4C4C', ALTO: 'FFFFA040', MEDIO: 'FFFFF0A0', BAIXO: 'FFB2DFDB' } as Record<string, string>)[n] ??
      'FFEEEEEE'
    );
  }

  private async fetchPdtiForUser(pdtiId: number, user: JwtPayload) {
    const where = isAdmin({ id: user.sub, role: user.role })
      ? { id: pdtiId }
      : { id: pdtiId, company: userCompanyScope(user.sub) };

    const pdti = await this.prisma.pDTI.findFirst({
      where,
      include: {
        company: true,
        objectives: {
          include: { actions: true, indicators: true },
          orderBy: { createdAt: 'asc' as const },
        },
        indicators: true,
      },
    });

    if (!pdti) {
      throw new NotFoundException(
        `PDTI ${pdtiId} não encontrado ou acesso negado`,
      );
    }

    const risks = pdti.assessmentId
      ? await this.prisma.risk.findMany({
          where: { assessmentId: pdti.assessmentId },
          include: { responsible: { select: { name: true } } },
          orderBy: { riskScore: 'desc' as const },
        })
      : [];

    return { pdti, risks };
  }

  private async fetchCompanyForUser(companyId: number, user: JwtPayload) {
    const where = isAdmin({ id: user.sub, role: user.role })
      ? { id: companyId }
      : { id: companyId, ...userCompanyScope(user.sub) };

    const company = await this.prisma.company.findFirst({ where });
    if (!company) {
      throw new NotFoundException(
        `Empresa ${companyId} não encontrada ou acesso negado`,
      );
    }
    return company;
  }

  async generatePdtiPdf(pdtiId: number, user: JwtPayload): Promise<Buffer> {
    const { pdti, risks } = await this.fetchPdtiForUser(pdtiId, user);

    return this.createPdfBuffer((doc) => {
      // ── Capa ──────────────────────────────────────────────────────────────
      doc.y = 200;
      doc
        .font('Helvetica-Bold')
        .fontSize(38)
        .fillColor(CORP_BLUE)
        .text('ASCEND', { align: 'center' });
      doc.moveDown(0.3);
      doc
        .font('Helvetica')
        .fontSize(12)
        .fillColor('#555555')
        .text('Plano Diretor de Tecnologia da Informação', { align: 'center' });
      doc.moveDown(2);
      doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor(TEXT_COLOR)
        .text(pdti.company.name, { align: 'center' });
      doc.moveDown(0.5);
      doc
        .font('Helvetica')
        .fontSize(16)
        .fillColor(CORP_BLUE)
        .text(pdti.title, { align: 'center' });
      doc.moveDown(0.5);
      doc
        .font('Helvetica')
        .fontSize(13)
        .fillColor(TEXT_COLOR)
        .text(`Ano: ${pdti.year ?? new Date().getFullYear()}`, { align: 'center' });
      doc.moveDown(2.5);
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#888888')
        .text(
          `Gerado em: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`,
          { align: 'center' },
        );

      // ── Seção 1: Missão e Visão ──────────────────────────────────────────
      doc.addPage();
      this.drawSectionTitle(doc, '1. Missão e Visão');
      doc.font('Helvetica-Bold').fontSize(11).text('Missão:');
      doc.font('Helvetica').text(pdti.mission ?? 'Não informado');
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text('Visão:');
      doc.font('Helvetica').text(pdti.vision ?? 'Não informado');
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text('Objetivos Estratégicos:');
      doc.font('Helvetica').text(pdti.strategicGoals ?? 'Não informado');
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').text('Sumário Executivo:');
      doc.font('Helvetica').text(pdti.summary ?? 'Não informado');

      // ── Seção 2: Objetivos Estratégicos ──────────────────────────────────
      doc.addPage();
      this.drawSectionTitle(doc, '2. Objetivos Estratégicos');
      if (pdti.objectives.length === 0) {
        doc.text('Nenhum objetivo estratégico cadastrado.');
      } else {
        this.drawPdfTable(
          doc,
          ['Título', 'Prioridade', 'Prazo', 'Status'],
          pdti.objectives.map((o) => [
            o.title,
            o.priority ?? 'N/A',
            this.fmtDate(o.dueDate),
            o.status,
          ]),
          [4, 2, 2, 2],
        );
      }

      // ── Seção 3: Ações por Objetivo ──────────────────────────────────────
      doc.addPage();
      this.drawSectionTitle(doc, '3. Ações por Objetivo');
      const hasActions = pdti.objectives.some((o) => o.actions.length > 0);
      if (!hasActions) {
        doc.text('Nenhuma ação cadastrada.');
      } else {
        pdti.objectives.forEach((obj) => {
          if (obj.actions.length === 0) return;
          if (doc.y + 60 > doc.page.height - 70) doc.addPage();
          doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .fillColor(CORP_BLUE)
            .text(`▸ ${obj.title}`);
          doc.moveDown(0.3);
          this.drawPdfTable(
            doc,
            ['Título', 'Responsável', 'Prazo', 'Status'],
            obj.actions.map((a) => [
              a.title,
              a.assignedTo ?? 'N/A',
              this.fmtDate(a.dueDate),
              a.status,
            ]),
            [4, 3, 2, 2],
          );
          doc.font('Helvetica').fontSize(11).fillColor(TEXT_COLOR);
        });
      }

      // ── Seção 4: Indicadores ─────────────────────────────────────────────
      doc.addPage();
      this.drawSectionTitle(doc, '4. Indicadores');
      if (pdti.indicators.length === 0) {
        doc.text('Nenhum indicador cadastrado.');
      } else {
        this.drawPdfTable(
          doc,
          ['Nome', 'Meta', 'Valor Atual', 'Frequência'],
          pdti.indicators.map((i) => [
            i.name,
            i.target ?? 'N/A',
            i.currentValue ?? 'N/A',
            i.frequency ?? 'N/A',
          ]),
          [4, 2, 2, 2],
        );
      }

      // ── Seção 5: Riscos Associados ───────────────────────────────────────
      doc.addPage();
      this.drawSectionTitle(doc, '5. Riscos Associados');
      if (risks.length === 0) {
        doc.text('Nenhum risco identificado no assessment associado.');
      } else {
        this.drawPdfTable(
          doc,
          ['Título', 'Categoria', 'Probabilidade', 'Impacto', 'Nível'],
          risks.map((r) => [
            r.title,
            r.category,
            r.probability,
            r.impact,
            r.riskLevel,
          ]),
          [4, 2, 2, 2, 2],
        );
      }
    });
  }

  async generatePdtiDocx(pdtiId: number, user: JwtPayload): Promise<Buffer> {
    const { pdti, risks } = await this.fetchPdtiForUser(pdtiId, user);

    const content: Array<Paragraph | Table> = [];

    // ── Capa ────────────────────────────────────────────────────────────────
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
        spacing: { after: 600 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: pdti.company.name, bold: true, size: 44 })],
        spacing: { after: 240 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: pdti.title, size: 32, color: CORP_BLUE_HEX })],
        spacing: { after: 160 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `Ano: ${pdti.year ?? new Date().getFullYear()}`,
            size: 28,
          }),
        ],
        spacing: { after: 800 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `Gerado em: ${new Date().toLocaleDateString('pt-BR')}`,
            size: 20,
            color: '888888',
          }),
        ],
      }),
      new Paragraph({ pageBreakBefore: true }),
    );

    // ── Seção 1: Missão e Visão ──────────────────────────────────────────────
    content.push(
      new Paragraph({ text: '1. Missão e Visão', heading: HeadingLevel.HEADING_1 }),
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
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Objetivos Estratégicos: ', bold: true }),
          new TextRun(pdti.strategicGoals ?? 'Não informado'),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Sumário Executivo: ', bold: true }),
          new TextRun(pdti.summary ?? 'Não informado'),
        ],
      }),
      new Paragraph({ pageBreakBefore: true }),
    );

    // ── Seção 2: Objetivos Estratégicos ─────────────────────────────────────
    content.push(
      new Paragraph({
        text: '2. Objetivos Estratégicos',
        heading: HeadingLevel.HEADING_1,
      }),
    );
    if (pdti.objectives.length === 0) {
      content.push(new Paragraph('Nenhum objetivo estratégico cadastrado.'));
    } else {
      content.push(
        this.makeDocxTable(
          ['Título', 'Prioridade', 'Prazo', 'Status'],
          pdti.objectives.map((o) => [
            o.title,
            o.priority ?? 'N/A',
            this.fmtDate(o.dueDate),
            o.status,
          ]),
        ),
      );
    }
    content.push(new Paragraph({ pageBreakBefore: true }));

    // ── Seção 3: Ações por Objetivo ─────────────────────────────────────────
    content.push(
      new Paragraph({ text: '3. Ações por Objetivo', heading: HeadingLevel.HEADING_1 }),
    );
    pdti.objectives.forEach((obj) => {
      if (obj.actions.length === 0) return;
      content.push(
        new Paragraph({ text: `▸ ${obj.title}`, heading: HeadingLevel.HEADING_2 }),
        this.makeDocxTable(
          ['Título', 'Responsável', 'Prazo', 'Status'],
          obj.actions.map((a) => [
            a.title,
            a.assignedTo ?? 'N/A',
            this.fmtDate(a.dueDate),
            a.status,
          ]),
        ),
        new Paragraph({ text: '', spacing: { after: 200 } }),
      );
    });
    content.push(new Paragraph({ pageBreakBefore: true }));

    // ── Seção 4: Indicadores ────────────────────────────────────────────────
    content.push(
      new Paragraph({ text: '4. Indicadores', heading: HeadingLevel.HEADING_1 }),
    );
    if (pdti.indicators.length === 0) {
      content.push(new Paragraph('Nenhum indicador cadastrado.'));
    } else {
      content.push(
        this.makeDocxTable(
          ['Nome', 'Meta', 'Valor Atual', 'Frequência'],
          pdti.indicators.map((i) => [
            i.name,
            i.target ?? 'N/A',
            i.currentValue ?? 'N/A',
            i.frequency ?? 'N/A',
          ]),
        ),
      );
    }
    content.push(new Paragraph({ pageBreakBefore: true }));

    // ── Seção 5: Riscos Associados ──────────────────────────────────────────
    content.push(
      new Paragraph({ text: '5. Riscos Associados', heading: HeadingLevel.HEADING_1 }),
    );
    if (risks.length === 0) {
      content.push(new Paragraph('Nenhum risco identificado no assessment associado.'));
    } else {
      content.push(
        this.makeDocxTable(
          ['Título', 'Categoria', 'Probabilidade', 'Impacto', 'Nível'],
          risks.map((r) => [
            r.title,
            r.category,
            r.probability,
            r.impact,
            r.riskLevel,
          ]),
        ),
      );
    }

    const document = new Document({ sections: [{ properties: {}, children: content }] });
    return Packer.toBuffer(document);
  }

  async generateRiskReportPdf(companyId: number, user: JwtPayload): Promise<Buffer> {
    const company = await this.fetchCompanyForUser(companyId, user);

    const risks: any[] = await this.prisma.risk.findMany({
      where: { companyId },
      include: {
        responsible: true,
        assessment: { include: { company: true } },
      },
      orderBy: { riskScore: 'desc' as const },
    });

    const sorted: any[] = [...risks].sort(
      (a, b) => this.levelOrder(String(a.riskLevel)) - this.levelOrder(String(b.riskLevel)),
    );

    const levelCounts = risks.reduce<Record<string, number>>((acc, r) => {
      const lvl = String(r.riskLevel);
      acc[lvl] = (acc[lvl] ?? 0) + 1;
      return acc;
    }, {});

    const uniqueLevels: string[] = [...new Set<string>(risks.map((r) => String(r.riskLevel)))].sort(
      (a, b) => this.levelOrder(a) - this.levelOrder(b),
    );

    const risksWithControls = risks.filter(
      (r) => r.existingControls || r.proposedControls,
    );
    const residualRisks = sorted.filter((r) => r.residualScore != null);

    const genDate = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    return this.createPdfBuffer((doc) => {
      // ── Capa ─────────────────────────────────────────────────────────────
      doc.y = 180;
      doc.font('Helvetica-Bold').fontSize(34).fillColor(CORP_BLUE)
         .text('Plano de Tratamento de Riscos', { align: 'center' });
      doc.moveDown(1.5);
      doc.font('Helvetica-Bold').fontSize(20).fillColor(TEXT_COLOR)
         .text(company.name, { align: 'center' });
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(11).fillColor('#888888')
         .text(`Gerado em: ${genDate}`, { align: 'center' });

      // ── Sumário executivo ────────────────────────────────────────────────
      doc.addPage();
      this.drawSectionTitle(doc, 'Sumário Executivo');
      this.drawPdfTable(
        doc,
        ['Nível de Risco', 'Quantidade'],
        [
          ...uniqueLevels.map((lvl) => [lvl, String(levelCounts[lvl] ?? 0)]),
          ['TOTAL', String(risks.length)],
        ],
        [5, 2],
      );

      // ── Tabela detalhada por nível ───────────────────────────────────────
      doc.addPage();
      this.drawSectionTitle(doc, 'Registro Detalhado de Riscos');
      if (sorted.length === 0) {
        doc.text('Nenhum risco cadastrado para esta empresa.');
      } else {
        this.drawPdfTable(
          doc,
          ['#', 'Título', 'Categoria', 'Probabilidade', 'Impacto', 'Nível', 'Tratamento', 'Responsável', 'Prazo'],
          sorted.map((r, i) => [
            String(i + 1),
            r.title,
            r.category,
            r.probability,
            r.impact,
            r.riskLevel,
            r.treatment ?? 'N/A',
            r.responsible?.name ?? 'N/A',
            this.fmtDate(r.reviewDate),
          ]),
          [0.5, 2.5, 1.5, 1.5, 1.5, 1.2, 2, 1.8, 1.2],
        );
      }

      // ── Seção de controles ───────────────────────────────────────────────
      doc.addPage();
      this.drawSectionTitle(doc, 'Controles por Risco');
      if (risksWithControls.length === 0) {
        doc.text('Nenhum controle cadastrado para os riscos desta empresa.');
      } else {
        risksWithControls.forEach((risk) => {
          if (doc.y + 80 > doc.page.height - 70) doc.addPage();
          doc.font('Helvetica-Bold').fontSize(11).fillColor(CORP_BLUE)
             .text(`▸ ${risk.title}  [${risk.riskLevel}]`);
          doc.moveDown(0.2);
          if (risk.existingControls) {
            doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_COLOR)
               .text('Controles Existentes:');
            doc.font('Helvetica').fontSize(10).text(risk.existingControls);
            doc.moveDown(0.2);
          }
          if (risk.proposedControls) {
            doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT_COLOR)
               .text('Controles Propostos:');
            doc.font('Helvetica').fontSize(10).text(risk.proposedControls);
            doc.moveDown(0.2);
          }
          doc.moveDown(0.4);
        });
      }

      // ── Indicadores residuais ────────────────────────────────────────────
      if (residualRisks.length > 0) {
        doc.addPage();
        this.drawSectionTitle(doc, 'Indicadores de Risco Residual');
        this.drawPdfTable(
          doc,
          ['Título', 'Score Inerente', 'Score Residual', 'Nível Residual', 'Prob. Residual', 'Impacto Residual'],
          residualRisks.map((r) => [
            r.title,
            r.inherentScore != null ? String(r.inherentScore) : String(r.riskScore),
            String(r.residualScore),
            r.residualLevel ?? 'N/A',
            r.residualProbability ?? 'N/A',
            r.residualImpact ?? 'N/A',
          ]),
          [3, 1.5, 1.5, 1.5, 1.5, 1.5],
        );
      }
    });
  }

  async generateRiskReportExcel(companyId: number, user: JwtPayload): Promise<Buffer> {
    await this.fetchCompanyForUser(companyId, user);

    const risks: any[] = await this.prisma.risk.findMany({
      where: { companyId },
      include: {
        responsible: true,
        assessment: { include: { company: true } },
      },
      orderBy: { riskScore: 'desc' as const },
    });

    const sorted: any[] = [...risks].sort(
      (a, b) => this.levelOrder(String(a.riskLevel)) - this.levelOrder(String(b.riskLevel)),
    );

    const allStatuses = ['IDENTIFICADO', 'EM_TRATAMENTO', 'MITIGADO', 'ACEITO', 'TRANSFERIDO'];
    const uniqueLevels: string[] = [...new Set<string>(risks.map((r) => String(r.riskLevel)))].sort(
      (a, b) => this.levelOrder(a) - this.levelOrder(b),
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ASCEND';
    workbook.created = new Date();

    const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1E3A5F' } };
    const HEADER_FONT = { color: { argb: 'FFFFFFFF' }, bold: true };
    const STRIPE_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEEF3FB' } };

    const styleHeader = (sheet: ExcelJS.Worksheet) => {
      const row = sheet.getRow(1);
      row.height = 22;
      row.eachCell((cell) => {
        cell.fill = HEADER_FILL;
        cell.font = HEADER_FONT;
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
    };

    const styleDataRow = (row: ExcelJS.Row, idx: number) => {
      if (idx % 2 !== 0) row.eachCell((cell) => { cell.fill = STRIPE_FILL; });
      row.eachCell((cell) => { cell.alignment = { vertical: 'middle', wrapText: true }; });
    };

    const colorLevel = (row: ExcelJS.Row, colKey: string, level: string) => {
      row.getCell(colKey).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: this.levelArgb(level) },
      };
    };

    // ── Aba 1: Resumo ────────────────────────────────────────────────────
    const summarySheet = workbook.addWorksheet('Resumo');
    summarySheet.columns = [
      { header: 'Nível', key: 'level', width: 16 },
      ...allStatuses.map((s) => ({ header: s.replace('_', ' '), key: s, width: 18 })),
      { header: 'TOTAL', key: 'TOTAL', width: 10 },
    ];
    styleHeader(summarySheet);

    uniqueLevels.forEach((level, idx) => {
      const rowData: Record<string, string | number> = { level };
      let total = 0;
      allStatuses.forEach((status) => {
        const count = risks.filter((r) => r.riskLevel === level && r.status === status).length;
        rowData[status] = count;
        total += count;
      });
      rowData.TOTAL = total;
      const row = summarySheet.addRow(rowData);
      styleDataRow(row, idx);
      colorLevel(row, 'level', level);
    });

    const totalRowData: Record<string, string | number> = { level: 'TOTAL' };
    allStatuses.forEach((s) => { totalRowData[s] = risks.filter((r) => r.status === s).length; });
    totalRowData.TOTAL = risks.length;
    const totalRow = summarySheet.addRow(totalRowData);
    totalRow.eachCell((cell) => { cell.font = { bold: true }; });

    // ── Aba 2: Registro de Riscos ────────────────────────────────────────
    const registrySheet = workbook.addWorksheet('Registro de Riscos');
    registrySheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Título', key: 'title', width: 30 },
      { header: 'Descrição', key: 'description', width: 38 },
      { header: 'Categoria', key: 'category', width: 18 },
      { header: 'Framework', key: 'frameworkRef', width: 14 },
      { header: 'Probabilidade', key: 'probability', width: 16 },
      { header: 'Impacto', key: 'impact', width: 14 },
      { header: 'Score', key: 'riskScore', width: 9 },
      { header: 'Nível', key: 'riskLevel', width: 12 },
      { header: 'Status', key: 'status', width: 18 },
      { header: 'Tratamento', key: 'treatment', width: 30 },
      { header: 'Ativo', key: 'assetName', width: 20 },
      { header: 'Ameaça', key: 'threat', width: 24 },
      { header: 'Vulnerabilidade', key: 'vulnerability', width: 24 },
      { header: 'Prob. Inerente', key: 'inherentProbability', width: 16 },
      { header: 'Impacto Inerente', key: 'inherentImpact', width: 16 },
      { header: 'Score Inerente', key: 'inherentScore', width: 14 },
      { header: 'Controles Existentes', key: 'existingControls', width: 34 },
      { header: 'Controles Propostos', key: 'proposedControls', width: 34 },
      { header: 'Prob. Residual', key: 'residualProbability', width: 16 },
      { header: 'Impacto Residual', key: 'residualImpact', width: 16 },
      { header: 'Score Residual', key: 'residualScore', width: 14 },
      { header: 'Nível Residual', key: 'residualLevel', width: 14 },
      { header: 'Responsável', key: 'responsible', width: 22 },
      { header: 'Data Revisão', key: 'reviewDate', width: 14 },
      { header: 'Fechado Em', key: 'closedAt', width: 14 },
      { header: 'Criado Em', key: 'createdAt', width: 14 },
    ];
    styleHeader(registrySheet);

    sorted.forEach((r, idx) => {
      const row = registrySheet.addRow({
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category,
        frameworkRef: r.frameworkRef ?? '',
        probability: r.probability,
        impact: r.impact,
        riskScore: r.riskScore,
        riskLevel: r.riskLevel,
        status: r.status,
        treatment: r.treatment ?? '',
        assetName: r.assetName ?? '',
        threat: r.threat ?? '',
        vulnerability: r.vulnerability ?? '',
        inherentProbability: r.inherentProbability ?? '',
        inherentImpact: r.inherentImpact ?? '',
        inherentScore: r.inherentScore ?? '',
        existingControls: r.existingControls ?? '',
        proposedControls: r.proposedControls ?? '',
        residualProbability: r.residualProbability ?? '',
        residualImpact: r.residualImpact ?? '',
        residualScore: r.residualScore ?? '',
        residualLevel: r.residualLevel ?? '',
        responsible: r.responsible?.name ?? '',
        reviewDate: r.reviewDate ? this.fmtDate(r.reviewDate) : '',
        closedAt: r.closedAt ? this.fmtDate(r.closedAt) : '',
        createdAt: this.fmtDate(r.createdAt),
      });
      styleDataRow(row, idx);
      colorLevel(row, 'riskLevel', r.riskLevel);
    });

    // ── Aba 3: Plano de Tratamento ───────────────────────────────────────
    const treatmentSheet = workbook.addWorksheet('Plano de Tratamento');
    treatmentSheet.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Título', key: 'title', width: 30 },
      { header: 'Nível', key: 'riskLevel', width: 12 },
      { header: 'Tratamento', key: 'treatment', width: 34 },
      { header: 'Controles Existentes', key: 'existingControls', width: 38 },
      { header: 'Controles Propostos', key: 'proposedControls', width: 38 },
      { header: 'Prob. Residual', key: 'residualProbability', width: 16 },
      { header: 'Impacto Residual', key: 'residualImpact', width: 16 },
      { header: 'Score Residual', key: 'residualScore', width: 14 },
      { header: 'Nível Residual', key: 'residualLevel', width: 14 },
      { header: 'Responsável', key: 'responsible', width: 22 },
      { header: 'Data Revisão', key: 'reviewDate', width: 14 },
    ];
    styleHeader(treatmentSheet);

    const treatmentRisks = sorted.filter((r) => r.status === 'EM_TRATAMENTO');
    if (treatmentRisks.length === 0) {
      treatmentSheet.addRow(['Nenhum risco em tratamento cadastrado.']);
    } else {
      treatmentRisks.forEach((r, idx) => {
        const row = treatmentSheet.addRow({
          id: r.id,
          title: r.title,
          riskLevel: r.riskLevel,
          treatment: r.treatment ?? '',
          existingControls: r.existingControls ?? '',
          proposedControls: r.proposedControls ?? '',
          residualProbability: r.residualProbability ?? '',
          residualImpact: r.residualImpact ?? '',
          residualScore: r.residualScore ?? '',
          residualLevel: r.residualLevel ?? '',
          responsible: r.responsible?.name ?? '',
          reviewDate: r.reviewDate ? this.fmtDate(r.reviewDate) : '',
        });
        styleDataRow(row, idx);
        colorLevel(row, 'riskLevel', r.riskLevel);
      });
    }

    const data = await workbook.xlsx.writeBuffer();
    return Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
  }

  async generateActionPlanPdf(companyId: number, user: JwtPayload): Promise<Buffer> {
    const company = await this.fetchCompanyForUser(companyId, user);

    const plans = await this.prisma.actionPlan.findMany({
      where: { companyId },
      include: { responsible: { select: { name: true } } },
      orderBy: [{ priority: 'asc' as const }, { createdAt: 'asc' as const }],
    });

    return this.createPdfBuffer((doc) => {
      // ── Capa ────────────────────────────────────────────────────────────
      doc.y = 200;
      doc
        .font('Helvetica-Bold')
        .fontSize(34)
        .fillColor(CORP_BLUE)
        .text('Plano de Ação — 5W2H', { align: 'center' });
      doc.moveDown(1.5);
      doc
        .font('Helvetica-Bold')
        .fontSize(20)
        .fillColor(TEXT_COLOR)
        .text(company.name, { align: 'center' });
      doc.moveDown(0.5);
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#888888')
        .text(
          `Gerado em: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`,
          { align: 'center' },
        );

      // ── Tabela 5W2H ──────────────────────────────────────────────────────
      doc.addPage();
      this.drawSectionTitle(doc, 'Plano de Ação 5W2H');
      if (plans.length === 0) {
        doc.text('Nenhum plano de ação cadastrado para esta empresa.');
      } else {
        this.drawPdfTable(
          doc,
          ['O QUÊ', 'POR QUÊ', 'QUEM', 'ONDE', 'QUANDO', 'COMO', 'QUANTO'],
          plans.map((p) => [
            p.whatObjective ?? p.title,
            p.whyJustification ?? p.description ?? 'N/A',
            p.responsible?.name ?? 'N/A',
            p.whereLocation ?? 'N/A',
            this.fmtDate(p.dueDate),
            p.howMethod ?? 'N/A',
            p.howMuchCost
              ? `${Number(p.howMuchCost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ${p.howMuchCurrency ?? 'BRL'}`
              : 'N/A',
          ]),
          [2.5, 2.5, 2, 2, 1.5, 2.5, 2],
        );
      }
    });
  }
}
