import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { RafflesService } from "../raffles/raffles.service";
import { WagerGrowthService } from "../wager-growth/wager-growth.service";

@Injectable()
export class CronService {
  private readonly logger = new Logger("Cron");

  constructor(
    private readonly wagerGrowth: WagerGrowthService,
    private readonly raffles: RafflesService,
  ) {}

  @Cron("*/15 * * * *")
  handleScheduled(): void {
    try {
      this.raffles.finalizeExpiredTimerRaffles();
    } catch (err) {
      this.logger.error(`scheduled raffle finalization failed: ${(err as Error)?.message || err}`);
    }
    try {
      this.wagerGrowth.runScheduledWagerGrowth();
    } catch (err) {
      this.logger.error(`scheduled wager growth failed: ${(err as Error)?.message || err}`);
    }
  }
}
