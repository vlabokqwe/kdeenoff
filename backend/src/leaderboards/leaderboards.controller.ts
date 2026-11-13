import { All, Controller, Param, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AccessService } from "../access/access.service";
import { methodNotAllowed, notFound, send } from "../common/http/response";
import { BOARD_SLUG_ROUTE_RE } from "../common/validation";
import { LeaderboardsService } from "./leaderboards.service";

@Controller("api/leaderboards")
export class LeaderboardsController {
  constructor(
    private readonly leaderboards: LeaderboardsService,
    private readonly access: AccessService,
  ) {}

  @All()
  list(@Req() req: Request, @Res() res: Response): void {
    const m = req.method.toUpperCase();
    if (m !== "GET" && m !== "HEAD") {
      send(res, methodNotAllowed(req.method));
      return;
    }
    const result = this.leaderboards.handleListBoards();
    send(res, m === "HEAD" ? { ...result, body: null } : result);
  }

  @All("history")
  history(@Req() req: Request, @Res() res: Response): void {
    const m = req.method.toUpperCase();
    if (m !== "GET" && m !== "HEAD") {
      send(res, methodNotAllowed(req.method));
      return;
    }
    const result = this.leaderboards.handleListHistory();
    send(res, m === "HEAD" ? { ...result, body: null } : result);
  }

  @All("avatar/:seed")
  avatar(
    @Param("seed") seed: string,
    @Query("preset") preset: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    const m = req.method.toUpperCase();
    if (m !== "GET" && m !== "HEAD") {
      send(res, methodNotAllowed(req.method));
      return;
    }
    const result = this.leaderboards.handleGetAvatar(seed, preset);
    send(res, m === "HEAD" ? { ...result, body: null } : result);
  }

  @All(":slug")
  async getOne(@Param("slug") slug: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    if (!BOARD_SLUG_ROUTE_RE.test(slug)) {
      send(res, notFound());
      return;
    }
    const m = req.method.toUpperCase();
    if (m !== "GET" && m !== "HEAD") {
      send(res, methodNotAllowed(req.method));
      return;
    }
    let result = this.leaderboards.handleGetBoard(slug);
    if (result.status === 404) {
      const gate = await this.access.requireAdmin(req);
      if (gate.ok) {
        result = this.leaderboards.handleGetBoard(slug, { includeHidden: true });
      }
    }
    send(res, m === "HEAD" ? { ...result, body: null } : result);
  }
}
