import { Module } from '@nestjs/common';
import { RolesGuard } from '../auth/roles.guard';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, RolesGuard],
  exports: [CompaniesService],
})
export class CompaniesModule {}
