import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";
import { jsonResponse, send } from "./response";

/**
 * Keeps the Worker's error shape `{ error: "..." }` instead of Nest's `{ statusCode, message }`.
 * Unexpected errors become 500 `{ error: "Server error" }` and are logged.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Error");

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      let error = exception.message;
      if (payload && typeof payload === "object" && typeof (payload as { error?: unknown }).error === "string") {
        error = (payload as { error: string }).error;
      } else if (typeof payload === "string") {
        error = payload;
      }
      if (status >= 500) this.logger.error(exception.message);
      send(res, jsonResponse({ error }, status));
      return;
    }
    this.logger.error((exception as Error)?.stack || String(exception));
    send(res, jsonResponse({ error: "Server error" }, 500));
  }
}
