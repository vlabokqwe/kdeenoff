import { Global, Module } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { SqliteDatabaseService } from "./sqlite-database.service";

@Global()
@Module({
  providers: [{ provide: DatabaseService, useClass: SqliteDatabaseService }],
  exports: [DatabaseService],
})
export class DatabaseModule {}
