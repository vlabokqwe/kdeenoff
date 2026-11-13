import { All, Controller, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { methodNotAllowed, send } from "../common/http/response";
import { LeaderboardsService } from "./leaderboards.service";

@Controller("api/site")
export class SiteController {
  constructor(private readonly leaderboards: LeaderboardsService) {}

  @All()
  getSite(@Req() req: Request, @Res() res: Response): void {
    const m = req.method.toUpperCase();
    if (m !== "GET" && m !== "HEAD") {
      send(res, methodNotAllowed(req.method));
      return;
    }
    const result = this.leaderboards.handleGetSiteSettings();
    send(res, m === "HEAD" ? { ...result, body: null } : result);
  }
}
