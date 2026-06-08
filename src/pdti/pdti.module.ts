import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesGuard } from '../auth/roles.guard';
import { ExportsModule } from '../exports/exports.module';
import { PdtiController } from './pdti.controller';
import { PdtiService } from './pdti.service';

@Module({
  imports: [PrismaModule, ExportsModule],
  controllers: [PdtiController],
  providers: [PdtiService, RolesGuard],
  exports: [PdtiService],
})
export class PdtiModule {}
