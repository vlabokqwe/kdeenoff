import { All, Controller, Param, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AccessService } from "../access/access.service";
import { jsonResponse, methodNotAllowed, send } from "../common/http/response";
import { RafflesService } from "./raffles.service";

@Controller("api/raffles")
export class RafflesController {
  constructor(
    private readonly access: AccessService,
    private readonly raffles: RafflesService,
  ) { }

  @All()
  async list(@Req() req: Request, @Res() res: Response): Promise<void> {
    const m = req.method.toUpperCase();
    if (m !== "GET" && m !== "HEAD") {
      send(res, methodNotAllowed(req.method));
      return;
    }
    const result = await this.raffles.handlePublicRaffles();
    send(res, m === "HEAD" ? { ...result, body: null } : result);
  }

  @All("mine")
  async mine(@Req() req: Request, @Res() res: Response): Promise<void> {
    const m = req.method.toUpperCase();
    const result = await this.raffles.handleMyRaffles(req);
    send(res, m === "HEAD" ? { ...result, body: null } : result);
  }

  @All("manage")
  async manageRoot(@Req() req: Request, @Res() res: Response): Promise<void> {
    const gate = await this.access.requireStreamer(req);
    if (!gate.ok) {
      send(res, jsonResponse({ error: gate.error }, gate.status));
      return;
    }
    send(res, await this.raffles.handleManageRaffles(req, gate.actor));
  }

  @All("manage/*path")
  async manageSub(@Req() req: Request, @Res() res: Response): Promise<void> {
    const gate = await this.access.requireStreamer(req);
    if (!gate.ok) {
      send(res, jsonResponse({ error: gate.error }, gate.status));
      return;
    }
    send(res, await this.raffles.handleManageRaffles(req, gate.actor));
  }

  @All(":id/join")
  async join(@Param("id") id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    send(res, await this.raffles.handleRaffleJoin(req, id));
  }

  @All(":id")
  async detail(@Param("id") id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const m = req.method.toUpperCase();
    const result = await this.raffles.handlePublicRaffleDetail(req, id);
    send(res, m === "HEAD" ? { ...result, body: null } : result);
  }
}
