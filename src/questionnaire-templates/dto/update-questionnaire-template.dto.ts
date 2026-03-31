import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateQuestionnaireTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
