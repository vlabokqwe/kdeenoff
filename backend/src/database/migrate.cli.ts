/**
 * Apply pending migrations to DATABASE_PATH and exit.
 *   npm run migrate            (repo root)
 *   npm run migrate -w backend
 */
import { AppConfig } from "../config/app-config";
import { applyMigrations } from "./migrator";
import { openDatabase } from "./open";

function main(): void {
  const config = new AppConfig();
  const db = openDatabase(config.databasePath);
  try {
    console.log(`database: ${config.databasePath}`);
    const applied = applyMigrations(db, config.migrationsDir, (msg) => console.log(msg));
    console.log(applied.length ? `${applied.length} migration(s) applied` : "migrations up to date");
  } finally {
    db.close();
  }
}

try {
  main();
} catch (err) {
  console.error((err as Error).message || err);
  process.exit(1);
}
