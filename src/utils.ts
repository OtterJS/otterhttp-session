import type { ServerResponse } from "node:http"
import * as c from "@otterhttp/cookie"

import type { Options, Session } from "./types"

export function appendSessionCookieHeader(
  res: ServerResponse,
  name: string,
  { cookie, id }: Pick<Session, "cookie" | "id">,
  encodeFn?: Options["encode"],
) {
  if (res.headersSent) return
  const cookieStr = c.serialize(name, id, {
    path: cookie.path,
    httpOnly: cookie.httpOnly,
    expires: cookie.expires,
    domain: cookie.domain,
    sameSite: cookie.sameSite,
    secure: cookie.secure,
    encode: encodeFn,
  })
  res.appendHeader("set-cookie", cookieStr)
}
