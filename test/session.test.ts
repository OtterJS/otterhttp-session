import { request } from "node:http"
import { App, type Request as OtterRequest, type Response as OtterResponse } from "@otterhttp/app"
import { describe, expect, test, vi } from "vitest"

import { makeFetch } from "./make-fetch"

import MemoryStore from "@/memory-store"
import session from "@/session"
import { isNew, isTouched } from "@/symbol"
import type { Session, SessionData } from "@/types"

type Request = OtterRequest & { session?: Session<Record<string, unknown>> | undefined }
type Response<Req extends Request = Request> = OtterResponse<Req>

const defaultCookie = {
  domain: null,
  httpOnly: true,
  path: "/",
  sameSite: null,
  secure: false,
}

describe("session()", () => {
  test("return a function", () => {
    expect(typeof session()).toBe("function")
  })
  test("returns the session after resolve", async () => {
    const app = new App<Request, Response>()
    app.use(async (req: Request, res: Response) => {
      const sess = await session()(req, res)
      expect(sess).toEqual({
        cookie: defaultCookie,
        [isNew]: true,
      })
      expect(req.session).toBe(sess)
      res.end()
    })
    const server = app.listen()
    const fetch = makeFetch(server)
    const response = await fetch("/")
    expect(response.status).toBe(200)
  })
  test("return if req.session is defined", async () => {
    const store = {
      get: vi.fn(),
      set: vi.fn(),
      destroy: vi.fn(),
    }
    const app = new App<Request, Response>()
    app.use(async (req: Request, res: Response) => {
      req.session = {} as Session
      const sess = await session({ store })(req, res)
      expect(sess).toBe(req.session)
      res.end()
    })
    const server = app.listen()
    const fetch = makeFetch(server)
    const response = await fetch("/", { headers: { cookie: "sid=foo" } })
    expect(response.status).toBe(200)
    expect(store.get).not.toHaveBeenCalled()
  })
  test("return httpOnly false cookie", async () => {
    const cookie = {
      httpOnly: false,
    }
    const sess = await session({ cookie })(
      { cookies: {} } as Request,
      { registerLateHeaderAction: vi.fn() } as unknown as Response,
    )

    expect(sess.cookie.httpOnly).toBeFalsy()
  })
  test("not set cookie header if session is not populated", async () => {
    const app = new App<Request, Response>()
    app.use(async (req: Request, res: Response) => {
      await session()(req, res)
      res.end()
    })
    const server = app.listen()
    const fetch = makeFetch(server)
    const response = await fetch("/", { headers: { cookie: "sid=foo" } })
    expect(response.status).toBe(200)
    expect(response.headers.getSetCookie()).toEqual([])
  })
  test("should set cookie header and save session", async () => {
    const store = {
      get: vi.fn(),
      set: vi.fn(() => Promise.resolve()),
      destroy: vi.fn(),
    }
    let id: string | undefined
    const app = new App<Request, Response>()
    app.use(async (req: Request, res: Response) => {
      await session({ store })(req, res)
      if (req.session == null) return res.end()
      req.session.foo = "bar"
      id ??= req.session.id
      await req.session.commit()
      res.end()
    })
    const server = app.listen()
    const fetch = makeFetch(server)
    const response = await fetch("/")

    expect(response.status).toBe(200)
    expect(id).toBeDefined()
    expect(response.headers.getSetCookie()).toContain(`sid=${id}; Path=/; HttpOnly`)
    expect(store.set).toHaveBeenCalledWith(id, {
      foo: "bar",
      cookie: defaultCookie,
      [isNew]: true,
    })
    await fetch("/", { headers: { cookie: `sid=${id}` } })
    expect(store.get).toHaveBeenCalledWith(id)
  })
  test("set session expiry if maxAge is set", async () => {
    const store = {
      get: vi.fn(),
      set: vi.fn(() => Promise.resolve()),
      destroy: vi.fn(),
    }
    let id: string | undefined
    let expires: Date | undefined
    const app = new App<Request, Response>()
    app.use(async (req: Request, res: Response) => {
      await session({ store, cookie: { maxAge: 10 } })(req, res)
      if (req.session == null) return res.end()
      req.session.foo = "bar"
      id ??= req.session.id
      expect(req.session.cookie.expires).toBeInstanceOf(Date)
      expires ??= req.session.cookie.expires
      await req.session.commit()
      res.end()
    })
    const server = app.listen()
    const fetch = makeFetch(server)
    const response = await fetch("/")

    expect(response.status).toBe(200)
    expect(id).toBeDefined()
    expect(expires).toBeDefined()
    expect(response.headers.getSetCookie()).toContain(`sid=${id}; Path=/; Expires=${expires?.toUTCString()}; HttpOnly`)
    expect(store.set).toHaveBeenCalledWith(id, {
      foo: "bar",
      cookie: { ...defaultCookie, expires, maxAge: 10 },
      [isNew]: true,
    })
    await fetch("/", { headers: { cookie: `sid=${id}` } })
    expect(store.get).toHaveBeenCalledWith(id)
  })
  test("should destroy session and unset cookie", async () => {
    const store = new MemoryStore()
    store.destroy = vi.fn()
    store.set = vi.fn()
    store.touch = vi.fn()
    const sid = "foo"
    await store.store.set(sid, JSON.stringify({ foo: "bar", cookie: defaultCookie }))
    const app = new App<Request, Response>()
    app.use(async (req: Request, res: Response) => {
      await session({ store })(req, res)
      if (req.session == null) return res.end()
      req.session.foo = "quz"
      await req.session.destroy()
      res.end()
    })
    const server = app.listen()
    const fetch = makeFetch(server)
    const response = await fetch("/", { headers: { cookie: `sid=${sid}` } })
    expect(store.destroy).toHaveBeenCalledWith(sid)
    expect(store.set).not.toHaveBeenCalled()
    expect(store.touch).not.toHaveBeenCalled()
    expect(response.headers.getSetCookie()).toContain(
      `sid=${sid}; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly`,
    )
  })
  test("not touch (touchAfter = -1) by default", async () => {
    const store = new MemoryStore()
    store.touch = vi.fn()
    const expires = new Date(Date.now() + 1000)
    await store.set("foo", {
      cookie: { ...defaultCookie, expires, maxAge: 5 },
    })
    const app = new App<Request, Response>()
    app.use(async (req: Request, res: Response) => {
      await session({ store })(req, res)
      if (req.session == null) return res.end()
      expect(req.session[isTouched]).toBeFalsy()
      res.end(String(req.session.cookie.expires?.getTime()))
    })
    const server = app.listen()
    const fetch = makeFetch(server)
    const response = await fetch("/", { headers: { cookie: "sid=foo" } })
    expect(store.touch).not.toHaveBeenCalled()
    await expect(response.text().then(Number)).resolves.toEqual(expires.getTime())
  })
  test("touch if session life time > touchAfter", async () => {
    const store = new MemoryStore()
    store.touch = vi.fn(() => Promise.resolve())
    const expires = new Date(Date.now() + 2000)
    await store.set("foo", {
      cookie: { ...defaultCookie, expires, maxAge: 5 },
    })
    let newExpires: Date | undefined
    const app = new App<Request, Response>()
    app.use(async (req: Request, res: Response) => {
      await session({ store, touchAfter: 1 })(req, res)
      if (req.session == null) return res.end()
      expect(req.session[isTouched]).toBe(true)
      newExpires = req.session.cookie.expires
      res.end()
    })
    const server = app.listen()
    const fetch = makeFetch(server)
    const response = await fetch("/", { headers: { cookie: "sid=foo" } })
    expect(newExpires).toBeDefined()
    expect(newExpires?.getTime()).toBeGreaterThan(expires.getTime())
    expect(response.headers.getSetCookie()).toContain(`sid=foo; Path=/; Expires=${newExpires?.toUTCString()}; HttpOnly`)
    expect(store.touch).toHaveBeenCalledWith("foo", {
      cookie: { ...defaultCookie, expires: newExpires, maxAge: 5 },
      [isTouched]: true,
    })
  })
  test("not touch session life time < touchAfter", async () => {
    const store = new MemoryStore()
    store.touch = vi.fn(() => Promise.resolve())
    const expires = new Date(Date.now() + 2000)
    await store.set("foo", {
      cookie: { ...defaultCookie, expires, maxAge: 5 },
    })
    let newExpires: Date | undefined
    const app = new App<Request, Response>()
    app.use(async (req: Request, res: Response) => {
      await session({ store, touchAfter: 10 })(req, res)
      if (req.session == null) return res.end()
      expect(req.session[isTouched]).toBeFalsy()
      newExpires = req.session.cookie.expires
      res.end()
    })
    const server = app.listen()
    const fetch = makeFetch(server)
    const response = await fetch("/", { headers: { cookie: "sid=foo" } })
    expect(newExpires).toBeDefined()
    expect(newExpires?.getTime()).toEqual(expires.getTime())
    expect(response.headers.getSetCookie()).toEqual([])
    expect(store.touch).not.toHaveBeenCalled()
  })
  test("support calling res.end() multiple times", async () => {
    // This must be tested with a real server to verify headers sent error
    // https://github.com/hoangvvo/next-session/pull/31
    const app = new App<Request, Response>()
    app.use(async (req: Request, res: Response) => {
      await session()(req, res)
      if (req.session == null) return res.end()
      req.session.foo = "bar"
      res.end("Hello, world!")
      res.end()
    })
    // @ts-expect-error
    let server: Server<typeof Request, typeof Response> | undefined

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve())
    })

    const address = server.address()
    if (address == null) throw new Error("Somehow, the server is not listening")
    if (typeof address === "string") throw new Error("Listening on a unix socket is unsupported")

    await new Promise<void>((resolve, reject) => {
      request(`http://127.0.0.1:${address.port}/`, (res) => {
        let data = ""
        res.on("data", (d) => {
          if (d) data += d
        })
        res.on("end", () => {
          expect(data).toEqual("Hello, world!")
          server.close((err: unknown) => {
            if (err) return reject(err)
            resolve()
          })
        })
        res.on("error", reject)
      })
        .on("error", reject)
        .end()
    })
  })
  test("allow sign and unsign sid", async () => {
    const unsign = (key: string) => {
      if (key.startsWith("sig.")) return key.substring(4)
      throw new Error()
    }
    const sign = (key: string) => {
      return `sig.${key}`
    }
    const store = new MemoryStore()
    const sessionFn = session({ store, cookie: { sign, unsign } })
    let sid: string | undefined
    const app = new App<Request, Response>()
    app.use("/", async (req: Request, res: Response, next) => {
      await sessionFn(req, res)
      next()
    })

    app.get("/first", async (req, res) => {
      if (req.session == null) return res.end()
      req.session.foo = "bar"
      sid = req.session.id
      await req.session.commit()
      res.end()
    })

    app.get("/second", async (req, res) => {
      if (req.session == null) return res.end()
      res.end(req.session.foo)
    })

    const server = app.listen()
    const fetch = makeFetch(server)

    const res1 = await fetch("/first")
    expect(sid).toBeDefined()
    expect(res1.headers.getSetCookie()).toContain(`sid=${sign(sid as string)}; Path=/; HttpOnly`)
    expect(store.store.has(sid as string)).toBe(true)

    const res2 = await fetch("/second", { headers: { cookie: `sid=${sign(sid as string)}` } })
    await expect(res2.text()).resolves.toEqual("bar")

    const res3 = await fetch("/second", { headers: { cookie: `sid=${sid}` } })
    await expect(res3.text()).resolves.toEqual("")
  })
  test("set cookie correctly after res.writeHead", async () => {
    const app = new App<Request, Response>()
    app.use(async (req: Request, res: Response) => {
      await session()(req, res)
      if (req.session == null) return res.end()
      req.session.foo = "bar"
      await req.session.commit()
      res.writeHead(200).end()
    })
    const server = app.listen()
    const fetch = makeFetch(server)
    const response = await fetch("/")
    expect(response.status).toBe(200)
    expect(response.headers.getSetCookie()).toMatchObject([expect.any(String)])
  })
  test("should convert to date if store returns session.cookies.expires as string", async () => {
    const store = {
      get: async (id: string) => {
        //  force sess.cookie.expires to be string
        return JSON.parse(
          JSON.stringify({
            cookie: { maxAge: 100000, expires: new Date(Date.now() + 4000) },
          }),
        )
      },
      set: async (sid: string, sess: SessionData) => undefined,
      destroy: async (id: string) => undefined,
    }
    const app = new App<Request, Response>()
    app.use(async (req: Request, res: Response) => {
      await session({ store })(req, res)
      if (req.session == null) return res.end()
      expect(req.session.cookie.expires).toBeInstanceOf(Date)
      res.end()
    })
    const server = app.listen()
    const fetch = makeFetch(server)
    const response = await fetch("/", { headers: { cookie: "sid=foo" } })
    expect(response.status).toBe(200)
  })
})
