/**
 * Append-only audit log helper. Every admin write should call this.
 */

/**
 * @param {any} env
 * @param {{ sub:number, email:string }|null} actor
 * @param {string} action
 * @param {string|null} target
 * @param {Record<string, any>} [meta]
 */
export async function audit(env, actor, action, target, meta) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (actor_user_id, actor_email, action, target, meta_json, at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        actor ? actor.sub : null,
        actor ? actor.email : "admin",
        String(action).slice(0, 80),
        target ? String(target).slice(0, 200) : null,
        meta ? JSON.stringify(meta).slice(0, 4000) : null,
        Date.now(),
      )
      .run();
  } catch (e) {
    console.error("audit:", e);
  }
}
