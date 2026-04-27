import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RolesGuard } from '../auth/roles.guard';
import { ActionPlansController } from './action-plans.controller';
import { ActionPlansService } from './action-plans.service';

@Module({
  imports: [PrismaModule],
  controllers: [ActionPlansController],
  providers: [ActionPlansService, RolesGuard],
  exports: [ActionPlansService],
})
export class ActionPlansModule {}
