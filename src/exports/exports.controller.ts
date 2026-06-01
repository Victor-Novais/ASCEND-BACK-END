import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ExportsService } from './exports.service';

@Controller('exports')
@UseGuards(JwtAuthGuard)
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get('pdti/:pdtiId/docx')
  async exportPdtiDocx(
    @Param('pdtiId', ParseIntPipe) pdtiId: number,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: JwtPayload,
  ) {
    const buffer = await this.exportsService.generatePdtiDocx(pdtiId, user);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="PDTI_${pdtiId}.docx"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('pdti/:pdtiId/pdf')
  async exportPdtiPdf(
    @Param('pdtiId', ParseIntPipe) pdtiId: number,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: JwtPayload,
  ) {
    const buffer = await this.exportsService.generatePdtiPdf(pdtiId, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="PDTI_${pdtiId}.pdf"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('risks/xlsx')
  async exportRisksXlsx(
    @Query('companyId') companyId: string | undefined,
    @Query('assessmentId') assessmentId: string | undefined,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const companyIdNumber = companyId ? Number(companyId) : undefined;
    const assessmentIdNumber = assessmentId ? Number(assessmentId) : undefined;

    if (!companyIdNumber && !assessmentIdNumber) {
      throw new BadRequestException('companyId or assessmentId must be provided');
    }

    const buffer = await this.exportsService.generateRisksXlsx(
      companyIdNumber,
      assessmentIdNumber,
      user,
    );

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="risks_export.xlsx"`,
    });
    return new StreamableFile(buffer);
  }

  @Get('report/:assessmentId/pdf')
  async exportReportPdf(
    @Param('assessmentId', ParseIntPipe) assessmentId: number,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: JwtPayload,
  ) {
    const buffer = await this.exportsService.generateReportPdf(assessmentId, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="report_${assessmentId}.pdf"`,
    });
    return new StreamableFile(buffer);
  }
}
