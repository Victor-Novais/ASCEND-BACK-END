import { PartialType } from '@nestjs/mapped-types';
import { CreatePdtiIndicatorDto } from './create-pdti-indicator.dto';

export class UpdatePdtiIndicatorDto extends PartialType(CreatePdtiIndicatorDto) {}
