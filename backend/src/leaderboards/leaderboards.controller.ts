import { All, Controller, Param, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AccessService } from "../access/access.service";
import { methodNotAllowed, notFound, send } from "../common/http/response";
import { BOARD_SLUG_ROUTE_RE } from "../common/validation";
import { SessionService } from "../session/session.service";
import { normalizeKickHandle } from "./lb-avatar";
import { LeaderboardsService } from "./leaderboards.service";

@Controller("api/leaderboards")
export class LeaderboardsController {
  constructor(
    private readonly leaderboards: LeaderboardsService,
    private readonly access: AccessService,
    private readonly sessions: SessionService,
  ) {}

  @All()
  async list(@Req() req: Request, @Res() res: Response): Promise<void> {
    const m = req.method.toUpperCase();
    if (m !== "GET" && m !== "HEAD") {
      send(res, methodNotAllowed(req.method));
      return;
    }
    const result = await this.leaderboards.handleListBoards();
    send(res, m === "HEAD" ? { ...result, body: null } : result);
  }

  @All("history")
  async history(@Req() req: Request, @Res() res: Response): Promise<void> {
    const m = req.method.toUpperCase();
    if (m !== "GET" && m !== "HEAD") {
      send(res, methodNotAllowed(req.method));
      return;
    }
    const result = await this.leaderboards.handleListHistory();
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
    const viewerHandles = new Set<string>();
    try {
      const loaded = await this.sessions.loadPerson(req);
      const person = loaded.person;
      if (person?.partnerUsername) {
        const h = normalizeKickHandle(person.partnerUsername);
        if (h) viewerHandles.add(h);
      } else if (person?.name) {
        const h = normalizeKickHandle(person.name);
        if (h) viewerHandles.add(h);
      }
    } catch {
      /* ignore session lookup errors on public read */
    }

    let result = await this.leaderboards.handleGetBoard(slug, { viewerHandles });
    if (result.status === 404) {
      const gate = await this.access.requireAdmin(req);
      if (gate.ok) {
        result = await this.leaderboards.handleGetBoard(slug, {
          includeHidden: true,
          viewerHandles,
        });
      }
    }
    send(res, m === "HEAD" ? { ...result, body: null } : result);
  }
}
