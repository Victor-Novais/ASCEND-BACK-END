import { ActionPlanPriority, ActionPlanStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID } from 'class-validator';

export class FilterActionPlanDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  companyId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assessmentId?: number;

  @IsOptional()
  @IsEnum(ActionPlanStatus)
  status?: ActionPlanStatus;

  @IsOptional()
  @IsEnum(ActionPlanPriority)
  priority?: ActionPlanPriority;

  @IsOptional()
  @IsUUID('4')
  responsibleId?: string;
}
