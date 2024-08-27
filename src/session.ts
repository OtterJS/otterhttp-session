import type { Request, Response } from "@otterhttp/app"
import { nanoid } from "nanoid"

import MemoryStore from "./memory-store"
import { isDestroyed, isNew, isTouched, lateHeaderAction } from "./symbol"
import type { Options, Session, SessionRecord } from "./types"
import { appendSessionCookieHeader } from "./utils"

export default function session<
  T extends SessionRecord = SessionRecord,
  Req extends Request & { session?: Session<T> } = Request & { session?: Session<T> },
  Res extends Response<Req> = Response<Req>,
>(options: Options = {}) {
  type TypedSession = Session<T>

  const name = options.name || "sid"
  const store = options.store || new MemoryStore()
  const genId = options.genid || nanoid
  const touchAfter = options.touchAfter ?? -1
  const { unsign, ...cookieOpts } = options.cookie ?? {}

  function decorateSession(req: Req, res: Res, session: TypedSession, id: string, _now: number) {
    Object.defineProperties(session, {
      commit: {
        value: async function commit(this: TypedSession) {
          await store.set(this.id, this)
        },
      },
      touch: {
        value: async function touch(this: TypedSession) {
          if (this.cookie.maxAge != null) {
            this.cookie.expires = new Date(_now + this.cookie.maxAge * 1000)
          }
          await store.touch?.(this.id, this)
          this[isTouched] = true
        },
      },
      destroy: {
        value: async function destroy(this: TypedSession) {
          this[isDestroyed] = true
          this.cookie.expires = new Date(1)
          await store.destroy(this.id)
          req.session = undefined
        },
      },
      id: { value: id },
    })
  }

  return async function sessionHandle(req: Req, res: Res): Promise<TypedSession> {
    if (req.session != null) return req.session

    const _now = Date.now()

    const sessionCookie = req.cookies[name]
    if (unsign != null && sessionCookie != null && !sessionCookie.signed) sessionCookie.unsign(unsign)

    let sessionId: string | null = null
    try {
      sessionId = sessionCookie?.value ?? null
    } catch (err) {}
    const _session = sessionId ? await store.get(sessionId) : null

    let session: TypedSession
    if (_session) {
      session = _session as TypedSession
      // Some store return cookie.expires as string, convert it to Date
      const expires = session.cookie.expires as string | Date | undefined
      if (typeof expires === "string") {
        session.cookie.expires = new Date(expires)
      }

      // Add session methods
      decorateSession(req, res, session, sessionId as string, _now)

      // Extends the expiry of the session if options.touchAfter is satisfied
      if (touchAfter >= 0 && session.cookie.expires) {
        const lastTouchedTime = session.cookie.expires.getTime() - session.cookie.maxAge * 1000
        if (_now - lastTouchedTime >= touchAfter * 1000) {
          await session.touch()
        }
      }
    } else {
      sessionId = genId()
      session = {
        [isNew]: true,
        cookie: {
          path: cookieOpts.path || "/",
          httpOnly: cookieOpts.httpOnly ?? true,
          domain: cookieOpts.domain || undefined,
          sameSite: cookieOpts.sameSite,
          secure: cookieOpts.secure || false,
        },
      } as TypedSession
      if (cookieOpts.maxAge) {
        session.cookie.maxAge = cookieOpts.maxAge
        session.cookie.expires = new Date(_now + cookieOpts.maxAge * 1000)
      }

      // Add session methods
      decorateSession(req, res, session, sessionId, _now)
    }

    req.session = session

    res.registerLateHeaderAction(lateHeaderAction, (res: Res) => {
      if (!(session[isNew] && Object.keys(session).length > 1) && !session[isTouched] && !session[isDestroyed]) return
      appendSessionCookieHeader(res, name, session, cookieOpts)
    })

    return session
  }
}

export type { Options, SessionStore } from "./types"
