import { PartialType } from '@nestjs/mapped-types';
import { ActionPlanStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { CreateActionPlanDto } from './create-action-plan.dto';

export class UpdateActionPlanDto extends PartialType(CreateActionPlanDto) {
  @IsOptional()
  @IsEnum(ActionPlanStatus)
  status?: ActionPlanStatus;

  @IsOptional()
  @IsDateString()
  completedAt?: string;
}
