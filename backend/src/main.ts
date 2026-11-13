import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/http/all-exceptions.filter";
import { AppConfig } from "./config/app-config";

async function bootstrap(): Promise<void> {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  const config = app.get(AppConfig);
  if (!config.isProduction) {
    logger.warn(
      `Running in non-production mode (NODE_ENV=${JSON.stringify(config.nodeEnv)}). Set NODE_ENV=production on a public server.`,
    );
  }
  app.set("trust proxy", config.trustProxy);
  app.set("etag", false);
  app.disable("x-powered-by");

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  if (config.host) {
    await app.listen(config.port, config.host);
    logger.log(`Listening on http://${config.host}:${config.port}`);
  } else {
    await app.listen(config.port);
    logger.log(`Listening on http://localhost:${config.port}`);
  }
}

void bootstrap();
