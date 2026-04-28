import { PartialType } from '@nestjs/mapped-types';
import { RiskStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateRiskDto } from './create-risk.dto';

export class UpdateRiskDto extends PartialType(CreateRiskDto) {
  @IsOptional()
  @IsEnum(RiskStatus)
  status?: RiskStatus;
}
