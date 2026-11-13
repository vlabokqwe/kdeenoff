import { Global, Injectable, Logger, Module } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface Actor {
  sub: number;
  email: string;
}

/**
 * Append-only audit log helper. Every admin write should call this.
 * Never throws (errors are logged), like the Worker version.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger("Audit");

  constructor(private readonly db: DatabaseService) {}

  audit(actor: Actor | null, action: string, target: string | null, meta?: unknown): void {
    try {
      this.db.run(
        `INSERT INTO audit_log (actor_user_id, actor_email, action, target, meta_json, at)
       VALUES (?, ?, ?, ?, ?, ?)`,
        actor ? actor.sub : null,
        actor ? actor.email : "admin",
        String(action).slice(0, 80),
        target ? String(target).slice(0, 200) : null,
        meta ? JSON.stringify(meta).slice(0, 4000) : null,
        Date.now(),
      );
    } catch (e) {
      this.logger.error(`audit: ${(e as Error)?.message || e}`);
    }
  }
}

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
