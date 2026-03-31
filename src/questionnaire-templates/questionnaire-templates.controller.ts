import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateQuestionnaireTemplateDto } from './dto/create-questionnaire-template.dto';
import { CreateQuestionTemplateDto } from './dto/create-question-template.dto';
import { CreateQuestionTemplateOptionDto } from './dto/create-question-template-option.dto';
import { UpdateQuestionnaireTemplateDto } from './dto/update-questionnaire-template.dto';
import { QuestionnaireTemplatesService } from './questionnaire-templates.service';

@Controller('questionnaire-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuestionnaireTemplatesController {
  constructor(private readonly service: QuestionnaireTemplatesService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateQuestionnaireTemplateDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuestionnaireTemplateDto,
  ) {
    return this.service.update(id, dto);
  }

  @Post(':id/questions')
  @Roles(Role.ADMIN)
  addQuestion(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateQuestionTemplateDto,
  ) {
    return this.service.addQuestion(id, dto);
  }

  @Post('questions/:questionId/options')
  @Roles(Role.ADMIN)
  addOption(
    @Param('questionId', ParseIntPipe) questionId: number,
    @Body() dto: CreateQuestionTemplateOptionDto,
  ) {
    return this.service.addOption(questionId, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE, Role.COLLABORATOR)
  findAll(@CurrentUser() user: JwtPayload) {
    const includeInactive = user.role === Role.ADMIN || user.role === Role.AVALIADOR;
    return this.service.findAllForCatalog(includeInactive);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.AVALIADOR, Role.CLIENTE, Role.COLLABORATOR)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
}
