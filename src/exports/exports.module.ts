import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { PdtiDocxService } from './pdti-docx.service';

@Module({
  imports: [PrismaModule],
  controllers: [ExportsController],
  providers: [ExportsService, PdtiDocxService],
  exports: [PdtiDocxService],
})
export class ExportsModule {}
