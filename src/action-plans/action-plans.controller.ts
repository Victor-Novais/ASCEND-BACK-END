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
  create(@Body() dto: CreateActionPlanDto, @CurrentUser() user: JwtPayload) {
    return this.actionPlansService.create(dto, user);
  }

  @Post('from-assessment/:id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  generateFromAssessment(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.actionPlansService.generateFromAssessment(id, user);
  }

  @Get('stats')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  getDashboardStats(
    @CurrentUser() user: JwtPayload,
    @Query('companyId') companyId?: string,
  ) {
    return this.actionPlansService.getDashboardStats(
      companyId != null ? Number(companyId) : undefined,
      user,
    );
  }

  @Get('export/5w2h')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  exportTo5W2H(@CurrentUser() user: JwtPayload, @Query() filters: FilterActionPlanDto) {
    return this.actionPlansService.exportTo5W2H(filters, user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  findAll(@CurrentUser() user: JwtPayload, @Query() filters: FilterActionPlanDto) {
    return this.actionPlansService.findAll(filters, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.actionPlansService.findOne(id, user);
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
