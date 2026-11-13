import { Module } from "@nestjs/common";
import { AccessModule } from "./access/access.module";
import { AccountModule } from "./account/account.module";
import { AdminModule } from "./admin/admin.module";
import { AuditModule } from "./audit/audit.module";
import { ConfigModule } from "./config/config.module";
import { CronModule } from "./cron/cron.module";
import { DatabaseModule } from "./database/database.module";
import { DevAccountModule } from "./dev-account/dev-account.module";
import { FrontendModule } from "./frontend/frontend.module";
import { KickModule } from "./kick/kick.module";
import { LeaderboardsModule } from "./leaderboards/leaderboards.module";
import { RafflesModule } from "./raffles/raffles.module";
import { SessionModule } from "./session/session.module";
import { WagerGrowthModule } from "./wager-growth/wager-growth.module";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuditModule,
    AccessModule,
    SessionModule,
    WagerGrowthModule,
    LeaderboardsModule,
    RafflesModule,
    KickModule,
    AccountModule,
    DevAccountModule,
    AdminModule,
    CronModule,
    FrontendModule,
  ],
})
export class AppModule { }
