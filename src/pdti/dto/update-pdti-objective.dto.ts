import { PartialType } from '@nestjs/mapped-types';
import { CreatePdtiObjectiveDto } from './create-pdti-objective.dto';

export class UpdatePdtiObjectiveDto extends PartialType(CreatePdtiObjectiveDto) {}
