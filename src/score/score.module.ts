import { Global, Module } from '@nestjs/common';
import { ScoreService } from './score.service';

@Global()
@Module({
  providers: [ScoreService],
  exports: [ScoreService],
})
export class ScoreModule {}
