import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { DocumentsService } from './documents.service';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('pdti/:id/pdf')
  async getPdtiPdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.documentsService.generatePdtiPdf(id, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="PDTI_${id}.pdf"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('pdti/:id/docx')
  async getPdtiDocx(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.documentsService.generatePdtiDocx(id, user);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="PDTI_${id}.docx"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('risks/pdf')
  async getRiskReport(
    @Query('companyId') companyId: string,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!companyId) throw new BadRequestException('companyId é obrigatório');
    const id = Number(companyId);
    if (isNaN(id)) throw new BadRequestException('companyId deve ser um número');

    const buffer = await this.documentsService.generateRiskReportPdf(id, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="risks-report-company-${id}.pdf"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('action-plans/pdf')
  async getActionPlanReport(
    @Query('companyId') companyId: string,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    if (!companyId) throw new BadRequestException('companyId é obrigatório');
    const id = Number(companyId);
    if (isNaN(id)) throw new BadRequestException('companyId deve ser um número');

    const buffer = await this.documentsService.generateActionPlanPdf(id, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="action-plans-company-${id}.pdf"`,
    });
    return new StreamableFile(buffer);
  }
}
