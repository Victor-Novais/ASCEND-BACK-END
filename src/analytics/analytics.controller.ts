import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('company/:id/evolution')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  getCompanyEvolution(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.getCompanyEvolution(id, user);
  }

  @Get('comparison')
  @Roles(Role.ADMIN, Role.AVALIADOR)
  getCompanyComparison(@Query('ids') ids: string) {
    const companyIds = (ids ?? '')
      .split(',')
      .map((id) => Number(id.trim()))
      .filter((id) => Number.isInteger(id) && id > 0);
    return this.analyticsService.getCompanyComparison(companyIds);
  }

  @Get('benchmark/:segment')
  @Roles(Role.ADMIN, Role.AVALIADOR)
  getBenchmarkBySegment(@Param('segment') segment: string) {
    return this.analyticsService.getBenchmarkBySegment(segment);
  }

  @Get('platform-stats')
  @Roles(Role.ADMIN)
  getPlatformStats() {
    return this.analyticsService.getPlatformStats();
  }

  @Get('company/:id/radar')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  getCompanyRadar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.getCompanyRadar(id, user);
  }

  @Get('company/:id/report-export')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  getCompanyReportExport(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.analyticsService.getCompanyReportExport(id, user);
  }
}
