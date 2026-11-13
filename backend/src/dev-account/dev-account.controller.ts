import { All, Controller, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { send } from "../common/http/response";
import { DevAccountService } from "./dev-account.service";

@Controller("api/dev/account")
export class DevAccountController {
  constructor(private readonly devAccount: DevAccountService) {}

  @All()
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    send(res, await this.devAccount.handleDevAccount(req));
  }
}
