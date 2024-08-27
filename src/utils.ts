import type { Request, Response } from "@otterhttp/app"

import type { Options, Session } from "./types"

export function appendSessionCookieHeader<Req extends Request = Request, Res extends Response<Req> = Response<Req>>(
  res: Res,
  name: string,
  { cookie, id }: Pick<Session, "cookie" | "id">,
  { encode, sign }: Pick<Exclude<Options["cookie"], undefined>, "encode" | "sign">,
) {
  if (res.headersSent) return
  res.cookie(name, id, {
    path: cookie.path,
    httpOnly: cookie.httpOnly,
    expires: cookie.expires,
    domain: cookie.domain,
    sameSite: cookie.sameSite,
    secure: cookie.secure,
    encode,
    sign,
  })
}
