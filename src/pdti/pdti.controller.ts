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
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreatePdtiDto } from './dto/create-pdti.dto';
import { CreatePdtiIndicatorDto } from './dto/create-pdti-indicator.dto';
import { CreatePdtiObjectiveDto } from './dto/create-pdti-objective.dto';
import { FilterPdtiDto } from './dto/filter-pdti.dto';
import { UpdatePdtiDto } from './dto/update-pdti.dto';
import { UpdatePdtiIndicatorDto } from './dto/update-pdti-indicator.dto';
import { UpdatePdtiObjectiveDto } from './dto/update-pdti-objective.dto';
import { PdtiDocxService } from '../exports/pdti-docx.service';
import { PdtiService } from './pdti.service';

@Controller('pdti')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PdtiController {
  constructor(
    private readonly pdtiService: PdtiService,
    private readonly pdtiDocxService: PdtiDocxService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  create(@Body() dto: CreatePdtiDto, @CurrentUser() user: JwtPayload) {
    return this.pdtiService.create(dto, user);
  }

  @Post('generate/:assessmentId')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  generateFromAssessmentRoute(
    @Param('assessmentId', ParseIntPipe) assessmentId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pdtiService.generateFromAssessment(assessmentId, user);
  }

  @Post('from-assessment/:id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  generateFromAssessmentAlias(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pdtiService.generateFromAssessment(id, user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  findAll(@Query() filters: FilterPdtiDto, @CurrentUser() user: JwtPayload) {
    return this.pdtiService.findAll(filters, user);
  }

  @Post(':pdtiId/objectives')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  createObjective(
    @Param('pdtiId', ParseIntPipe) pdtiId: number,
    @Body() dto: CreatePdtiObjectiveDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pdtiService.createObjective(pdtiId, dto, user);
  }

  @Patch(':pdtiId/objectives/:id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  updateObjective(
    @Param('pdtiId', ParseIntPipe) pdtiId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePdtiObjectiveDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pdtiService.updateObjective(pdtiId, id, dto, user);
  }

  @Delete(':pdtiId/objectives/:id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  removeObjective(
    @Param('pdtiId', ParseIntPipe) pdtiId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pdtiService.removeObjective(pdtiId, id, user);
  }

  @Post(':pdtiId/indicators')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  createIndicator(
    @Param('pdtiId', ParseIntPipe) pdtiId: number,
    @Body() dto: CreatePdtiIndicatorDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pdtiService.createIndicator(pdtiId, dto, user);
  }

  @Patch(':pdtiId/indicators/:id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  updateIndicator(
    @Param('pdtiId', ParseIntPipe) pdtiId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePdtiIndicatorDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pdtiService.updateIndicator(pdtiId, id, dto, user);
  }

  @Delete(':pdtiId/indicators/:id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  removeIndicator(
    @Param('pdtiId', ParseIntPipe) pdtiId: number,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pdtiService.removeIndicator(pdtiId, id, user);
  }

  @Get(':id/export/docx')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  async exportDocx(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const buffer = await this.pdtiDocxService.generatePdtiDocx(id, user);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="pdti-${id}.docx"`,
    });
    return new StreamableFile(buffer);
  }

  @Get(':id/export')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  export(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.pdtiService.export(id, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.pdtiService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePdtiDto) {
    return this.pdtiService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.pdtiService.remove(id);
  }
}
