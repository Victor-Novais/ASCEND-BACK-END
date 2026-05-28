import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesGuard } from '../auth/roles.guard';
import { PdtiController } from './pdti.controller';
import { PdtiService } from './pdti.service';

@Module({
  imports: [PrismaModule],
  controllers: [PdtiController],
  providers: [PdtiService, RolesGuard],
  exports: [PdtiService],
})
export class PdtiModule {}
