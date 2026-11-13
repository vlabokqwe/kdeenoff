import { Global, Module } from "@nestjs/common";
import { AppConfig } from "./app-config";
import { createNodeAppConfig } from "./node-config";

@Global()
@Module({
  providers: [{ provide: AppConfig, useFactory: createNodeAppConfig }],
  exports: [AppConfig],
})
export class ConfigModule {}
