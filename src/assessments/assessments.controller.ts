import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AssessmentsService } from './assessments.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';

@Controller('assessments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.AVALIADOR)
  create(@Body() createAssessmentDto: CreateAssessmentDto) {
    return this.assessmentsService.create(createAssessmentDto);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.assessmentsService.findOne(id);
  }

  @Get()
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE)
  findAll() {
    return this.assessmentsService.findAll();
  }
}
