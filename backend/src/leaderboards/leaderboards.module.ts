import { Module } from "@nestjs/common";
import { LeaderboardsController } from "./leaderboards.controller";
import { LeaderboardsService } from "./leaderboards.service";
import { SiteController } from "./site.controller";

@Module({
  controllers: [LeaderboardsController, SiteController],
  providers: [LeaderboardsService],
  exports: [LeaderboardsService],
})
export class LeaderboardsModule {}
