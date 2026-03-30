import { AssessmentStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID } from 'class-validator';

export class CreateAssessmentDto {
  @IsInt()
  companyId!: number;

  @IsOptional()
  @IsUUID('4')
  assessorId?: string;

  @IsOptional()
  @IsEnum(AssessmentStatus)
  status?: AssessmentStatus;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;
}
