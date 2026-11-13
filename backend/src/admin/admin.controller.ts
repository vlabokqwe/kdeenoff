import { All, Controller, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AccessService } from "../access/access.service";
import { jsonResponse, send } from "../common/http/response";
import { AdminService } from "./admin.service";

@Controller("api/admin")
export class AdminController {
  constructor(
    private readonly access: AccessService,
    private readonly admin: AdminService,
  ) {}

  @All()
  async root(@Req() req: Request, @Res() res: Response): Promise<void> {
    const gate = await this.access.requireAdmin(req);
    if (!gate.ok) {
      send(res, jsonResponse({ error: gate.error }, gate.status));
      return;
    }
    send(res, await this.admin.handleAdmin(req, gate.actor));
  }

  @All("*path")
  async sub(@Req() req: Request, @Res() res: Response): Promise<void> {
    const gate = await this.access.requireAdmin(req);
    if (!gate.ok) {
      send(res, jsonResponse({ error: gate.error }, gate.status));
      return;
    }
    send(res, await this.admin.handleAdmin(req, gate.actor));
  }
}
