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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreatePdtiDto } from './dto/create-pdti.dto';
import { FilterPdtiDto } from './dto/filter-pdti.dto';
import { UpdatePdtiDto } from './dto/update-pdti.dto';
import { PdtiService } from './pdti.service';

@Controller('pdti')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PdtiController {
  constructor(private readonly pdtiService: PdtiService) {}

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
  findAll(@Query() filters: FilterPdtiDto) {
    return this.pdtiService.findAll(filters);
  }

  @Get(':id/export')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  export(@Param('id', ParseIntPipe) id: number) {
    return this.pdtiService.export(id);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.pdtiService.findOne(id);
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
