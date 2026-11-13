import { All, Controller, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { send } from "../common/http/response";
import { KickService } from "./kick.service";

@Controller("api/kick")
export class KickController {
  constructor(private readonly kick: KickService) { }

  @All("me")
  async me(@Req() req: Request, @Res() res: Response): Promise<void> {
    send(res, await this.kick.handleKickMe(req));
  }

  @All("connect")
  connect(@Req() req: Request, @Res() res: Response): void {
    send(res, this.kick.handleKickConnect(req));
  }

  @All("callback")
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    send(res, await this.kick.handleKickCallback(req));
  }

  @All("logout")
  logout(@Req() req: Request, @Res() res: Response): void {
    send(res, this.kick.handleKickLogout(req));
  }

  @All("avatars")
  avatars(@Req() req: Request, @Res() res: Response): void {
    send(res, this.kick.handleChatAvatars(req));
  }
}
