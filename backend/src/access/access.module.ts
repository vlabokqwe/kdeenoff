import { Global, Module } from "@nestjs/common";
import { SessionModule } from "../session/session.module";
import { AccessService } from "./access.service";

@Global()
@Module({
  imports: [SessionModule],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
