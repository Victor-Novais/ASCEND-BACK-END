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
import { ActionPlansService } from './action-plans.service';
import { CreateActionPlanDto } from './dto/create-action-plan.dto';
import { FilterActionPlanDto } from './dto/filter-action-plan.dto';
import { UpdateActionPlanDto } from './dto/update-action-plan.dto';

@Controller('action-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActionPlansController {
  constructor(private readonly actionPlansService: ActionPlansService) {}

  @Post()
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  create(@Body() dto: CreateActionPlanDto) {
    return this.actionPlansService.create(dto);
  }

  @Post('from-assessment/:id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  generateFromAssessment(@Param('id', ParseIntPipe) id: number) {
    return this.actionPlansService.generateFromAssessment(id);
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  getDashboardStats(@Query('companyId') companyId?: string) {
    return this.actionPlansService.getDashboardStats(
      companyId != null ? Number(companyId) : undefined,
    );
  }

  @Get('export/5w2h')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  exportTo5W2H(@Query() filters: FilterActionPlanDto) {
    return this.actionPlansService.exportTo5W2H(filters);
  }

  @Get()
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  findAll(@Query() filters: FilterActionPlanDto) {
    return this.actionPlansService.findAll(filters);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.actionPlansService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateActionPlanDto) {
    return this.actionPlansService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.actionPlansService.remove(id);
  }
}
