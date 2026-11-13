import { Global, Module } from "@nestjs/common";
import { WagerGrowthService } from "./wager-growth.service";

@Global()
@Module({
  providers: [WagerGrowthService],
  exports: [WagerGrowthService],
})
export class WagerGrowthModule {}
