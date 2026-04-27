import {
  Controller,
  Get,
  ParseBoolPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(
    @Query('userId') userId?: string,
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('success', new ParseBoolPipe({ optional: true })) success?: boolean,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return this.auditService.findAll({
      userId,
      entity,
      action,
      success,
      dateFrom,
      dateTo,
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Get('stats')
  getStats() {
    return this.auditService.getStats();
  }

  @Get('export')
  async exportCsv(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('entity') entity: string | undefined,
    @Res() response: Response,
  ) {
    const csv = await this.auditService.exportCsv({ dateFrom, dateTo, entity });
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="audit-logs-${dateFrom}-${dateTo}.csv"`,
    );
    response.send(csv);
  }
}
