import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AssessmentsService } from './assessments.service';
import { BulkAssessmentResponsesDto } from './dto/bulk-assessment-responses.dto';
import { CreateAssessmentDto } from './dto/create-assessment.dto';

@Controller('assessments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE, Role.COLLABORATOR)
  create(
    @Body() createAssessmentDto: CreateAssessmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.assessmentsService.create(createAssessmentDto, user);
  }

  @Put(':id/responses')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE, Role.COLLABORATOR)
  upsertResponses(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: BulkAssessmentResponsesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.assessmentsService.upsertResponses(id, dto, user);
  }

  @Post(':id/submit')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE, Role.COLLABORATOR)
  submit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.assessmentsService.submitAssessment(id, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE, Role.COLLABORATOR)
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.assessmentsService.findOne(id, user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE, Role.COLLABORATOR)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.assessmentsService.findAll(user);
  }
}
