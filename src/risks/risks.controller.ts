import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateRiskDto } from './dto/create-risk.dto';
import { FilterRiskDto } from './dto/filter-risk.dto';
import { UpdateRiskDto } from './dto/update-risk.dto';
import { RisksService } from './risks.service';

@Controller('risks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RisksController {
  constructor(private readonly risksService: RisksService) {}

  @Post()
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  create(@Body() dto: CreateRiskDto, @CurrentUser() user: JwtPayload) {
    return this.risksService.create(dto, user);
  }

  @Post('from-assessment/:id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  generateFromAssessment(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.risksService.generateFromAssessment(id, user);
  }

  @Get('matrix')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  getRiskMatrix(
    @CurrentUser() user: JwtPayload,
    @Query('companyId') companyId?: string,
  ) {
    return this.risksService.getRiskMatrix(
      companyId != null ? Number(companyId) : undefined,
      user,
    );
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  getStats(
    @CurrentUser() user: JwtPayload,
    @Query('companyId') companyId?: string,
  ) {
    return this.risksService.getStats(
      companyId != null ? Number(companyId) : undefined,
      user,
    );
  }

  @Get('export')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  exportRisks(@CurrentUser() user: JwtPayload, @Query() filters: FilterRiskDto) {
    return this.risksService.exportRisks(filters, user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  findAll(@CurrentUser() user: JwtPayload, @Query() filters: FilterRiskDto) {
    return this.risksService.findAll(filters, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.risksService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.AVALIADOR)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRiskDto) {
    return this.risksService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.risksService.remove(id);
  }
}
