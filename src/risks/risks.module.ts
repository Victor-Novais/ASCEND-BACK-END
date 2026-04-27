import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesGuard } from '../auth/roles.guard';
import { RisksController } from './risks.controller';
import { RisksService } from './risks.service';

@Module({
  imports: [PrismaModule],
  controllers: [RisksController],
  providers: [RisksService, RolesGuard],
  exports: [RisksService],
})
export class RisksModule {}
