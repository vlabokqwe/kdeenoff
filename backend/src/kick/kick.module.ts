import { Module } from "@nestjs/common";
import { KickController } from "./kick.controller";
import { KickService } from "./kick.service";

@Module({
  controllers: [KickController],
  providers: [KickService],
  exports: [KickService],
})
export class KickModule {}
