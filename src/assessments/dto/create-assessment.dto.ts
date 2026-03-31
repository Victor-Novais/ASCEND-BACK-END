import { AssessmentStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID } from 'class-validator';

export class CreateAssessmentDto {
  @IsInt()
  companyId!: number;

  /** When set, creates a multi-collaborator assessment from this global template. */
  @IsOptional()
  @IsInt()
  questionnaireTemplateId?: number;

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
