import { PartialType } from '@nestjs/mapped-types';
import { CreatePdtiDto } from './create-pdti.dto';

export class UpdatePdtiDto extends PartialType(CreatePdtiDto) {}
