import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SubmitAnswersDto } from './dto/submit-answers.dto';
import { AnswersService } from './answers.service';

@Controller('answers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnswersController {
  constructor(private readonly answersService: AnswersService) {}

  @Post()
  @Roles(Role.COLLABORATOR)
  submitAnswers(@Body() dto: SubmitAnswersDto, @CurrentUser() user: JwtPayload) {
    return this.answersService.submitAnswers(dto, user);
  }
}
