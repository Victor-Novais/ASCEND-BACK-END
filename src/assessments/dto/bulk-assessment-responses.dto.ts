import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { AssessmentResponseItemDto } from './assessment-response-item.dto';

export class BulkAssessmentResponsesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AssessmentResponseItemDto)
  responses!: AssessmentResponseItemDto[];
}
