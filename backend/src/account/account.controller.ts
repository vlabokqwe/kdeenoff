import { All, Controller, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { send } from "../common/http/response";
import { AccountService } from "./account.service";

@Controller("api/account")
export class AccountController {
  constructor(private readonly account: AccountService) { }

  @All("email")
  async email(@Req() req: Request, @Res() res: Response): Promise<void> {
    send(res, await this.account.handleAccountEmail(req));
  }

  @All("email/confirm")
  async emailConfirm(@Req() req: Request, @Res() res: Response): Promise<void> {
    send(res, await this.account.handleAccountEmailConfirm(req));
  }

  @All("partner")
  async partner(@Req() req: Request, @Res() res: Response): Promise<void> {
    send(res, await this.account.handleAccountPartner(req));
  }

  @All("logout")
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    send(res, await this.account.handleAccountLogout(req));
  }
}
