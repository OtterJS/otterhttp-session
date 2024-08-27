import { isDestroyed, isNew, isTouched } from "./symbol"

export type SessionRecord = Record<string, unknown>

export type SessionData<T = SessionRecord> = {
  cookie: Cookie
} & T

export type Session<T extends SessionRecord = SessionRecord> = {
  id: string
  touch(): Promise<void>
  commit(): Promise<void>
  destroy(): Promise<void>
  [isNew]?: boolean
  [isTouched]?: boolean
  [isDestroyed]?: boolean
} & SessionData<T>

type Cookie = {
  httpOnly: boolean
  path: string
  domain?: string | undefined
  secure: boolean
  sameSite?: boolean | "lax" | "strict" | "none"
} & (
  | { maxAge?: undefined; expires?: undefined }
  | {
      maxAge: number
      expires: Date
    }
)

export interface SessionStore {
  get(sid: string): Promise<SessionData | null | undefined>
  set(sid: string, sess: SessionData): Promise<void>
  destroy(sid: string): Promise<void>
  touch?(sid: string, sess: SessionData): Promise<void>
}

export interface Options {
  name?: string | undefined
  store?: SessionStore | undefined
  genid?: (() => string) | undefined
  touchAfter?: number | undefined
  cookie?:
    | (Partial<Exclude<Cookie, "expires">> & {
        /**
         * `otterhttp` cookie `sign` function, will be passed to `res.cookie`.
         * @default undefined
         */
        sign?: ((value: string) => string) | undefined

        /**
         * `otterhttp` cookie 'unsign' function, will be used to unsign session cookies.
         *
         * You must ensure that signed session cookies are not matched by your `otterhttp` `App`'s configured
         * `signedCookieMatcher`. Otherwise, `otterhttp` will attempt to unsign session cookies using the `App`'s configured
         * `cookieUnsigner` instead, and unsigning with this function will not be attempted.
         * @default undefined
         */
        unsign?: ((signedValue: string) => string) | undefined

        /**
         * `otterhttp` cookie 'encode' function, will be passed to `res.cookie`.
         * @default undefined
         */
        encode?: ((value: string) => string) | undefined
      })
    | undefined
}
