import { Module } from "@nestjs/common";
import { DevAccountController } from "./dev-account.controller";
import { DevAccountService } from "./dev-account.service";

@Module({
  controllers: [DevAccountController],
  providers: [DevAccountService],
  exports: [DevAccountService],
})
export class DevAccountModule {}
