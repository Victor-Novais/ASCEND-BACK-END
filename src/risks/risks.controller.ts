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
import { JwtAuthGuard } from '../auth/auth.guard';
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
  @Roles(Role.ADMIN, Role.AVALIADOR)
  create(@Body() dto: CreateRiskDto) {
    return this.risksService.create(dto);
  }

  @Post('from-assessment/:id')
  @Roles(Role.ADMIN, Role.AVALIADOR)
  generateFromAssessment(@Param('id', ParseIntPipe) id: number) {
    return this.risksService.generateFromAssessment(id);
  }

  @Get('matrix')
  @Roles(Role.ADMIN, Role.AVALIADOR)
  getRiskMatrix(@Query('companyId') companyId?: string) {
    return this.risksService.getRiskMatrix(companyId != null ? Number(companyId) : undefined);
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.AVALIADOR)
  getStats(@Query('companyId') companyId?: string) {
    return this.risksService.getStats(companyId != null ? Number(companyId) : undefined);
  }

  @Get()
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  findAll(@Query() filters: FilterRiskDto) {
    return this.risksService.findAll(filters);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.risksService.findOne(id);
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
