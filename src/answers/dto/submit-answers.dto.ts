import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';

export class SubmitAnswerItemDto {
  @IsInt()
  @Min(1)
  assessmentQuestionId!: number;

  @IsInt()
  @Min(1)
  selectedOptionId!: number;
}

export class SubmitAnswersDto {
  @IsInt()
  @Min(1)
  assessmentId!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SubmitAnswerItemDto)
  answers!: SubmitAnswerItemDto[];
}
