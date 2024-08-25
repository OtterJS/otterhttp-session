import { describe, expect, test, vi } from "vitest";
import { createServer, IncomingMessage, request, ServerResponse, type Server } from "node:http";
import { inject } from "light-my-request";

import MemoryStore from "../src/memory-store";
import session from "../src/session";
import { isNew, isTouched } from "../src/symbol";
import {Session, SessionData} from "../src/types";

type Request = IncomingMessage & { session?: Session<Record<string, unknown>> | undefined }
type Response<Req extends Request = Request> = ServerResponse<Req>

const defaultCookie = {
  domain: undefined,
  httpOnly: true,
  path: "/",
  sameSite: undefined,
  secure: false,
};

describe("session()", () => {
  test("return a function", () => {
    expect(typeof session()).toBe("function");
  });
  test("returns the session after resolve", async () => {
    await inject(
      async (req: Request, res: Response) => {
        const sess = await session()(req, res);
        expect(sess).toEqual({
          cookie: defaultCookie,
          [isNew]: true,
        });
        expect(req.session).toBe(sess);
        res.end();
      },
      { path: "/" }
    );
  });
  test("return if req.session is defined", async () => {
    const store = {
      get: vi.fn(),
      set: vi.fn(),
      destroy: vi.fn(),
    };
    await inject(
      async (req: Request, res: Response) => {
        req.session = {} as Session;
        const sess = await session({ store })(req, res);
        expect(sess).toBe(req.session);
        res.end();
      },
      { path: "/", headers: { cookie: "sid=foo" } }
    );
    expect(store.get).not.toHaveBeenCalled();
  });
  test("return httpOnly false cookie", async () => {
    const cookie = {
      httpOnly: false,
    };
    const sess = await session({ cookie })({} as Request, {} as Response);

    expect(sess.cookie.httpOnly).toBeFalsy();
  });
  test("not set cookie header if session is not populated", async () => {
    const res = await inject(
      async (req: Request, res: Response) => {
        await session()(req, res);
        res.end();
      },
      { path: "/" }
    );
    expect(res.headers).not.toHaveProperty("set-cookie");
  });
  test("should set cookie header and save session", async () => {
    const store = {
      get: vi.fn(),
      set: vi.fn(() => Promise.resolve()),
      destroy: vi.fn(),
    };
    let id: string | undefined;
    const res = await inject(
      async (req: Request, res: Response) => {
        await session({ store })(req, res);
        if (req.session == null) return res.end()
        req.session.foo = "bar";
        id = req.session.id;
        res.end();
      },
      { path: "/" }
    );
    expect(id).toBeDefined()
    expect(res.headers).toHaveProperty("set-cookie");
    expect(res.headers["set-cookie"]).toBe(`sid=${id}; Path=/; HttpOnly`);
    expect(store.set).toHaveBeenCalledWith(id, {
      foo: "bar",
      cookie: defaultCookie,
      [isNew]: true,
    });
    await inject(
      async (req: Request, res: Response) => {
        await session({ store })(req, res);
        if (req.session == null) return res.end()
        req.session.foo = "bar";
        res.end();
      },
      { path: "/", headers: { cookie: `sid=${id}` } }
    );
    expect(store.get).toHaveBeenCalledWith(id);
  });
  test("should set cookie header and save session (autoCommit = false)", async () => {
    const store = {
      get: vi.fn(),
      set: vi.fn(() => Promise.resolve()),
      destroy: vi.fn(),
    };
    let id: string | undefined;
    const res = await inject(
      async (req: Request, res: Response) => {
        await session({ store, autoCommit: false })(req, res);
        if (req.session == null) return res.end()
        req.session.foo = "bar";
        id = req.session.id;
        await req.session.commit();
        res.end();
      },
      { path: "/" }
    );
    expect(id).toBeDefined()
    expect(res.headers).toHaveProperty("set-cookie");
    expect(res.headers["set-cookie"]).toBe(`sid=${id}; Path=/; HttpOnly`);
    expect(store.set).toHaveBeenCalledWith(id, {
      foo: "bar",
      cookie: defaultCookie,
      [isNew]: true,
    });
    await inject(
      async (req: Request, res: Response) => {
        await session({ store })(req, res);
        if (req.session == null) return res.end()
        req.session.foo = "bar";
        res.end();
      },
      { path: "/", headers: { cookie: `sid=${id}` } }
    );
    expect(store.get).toHaveBeenCalledWith(id);
  });
  test("set session expiry if maxAge is set", async () => {
    const store = {
      get: vi.fn(),
      set: vi.fn(() => Promise.resolve()),
      destroy: vi.fn(),
    };
    let id: string | undefined;
    let expires: Date | undefined;
    const res = await inject(
      async (req: Request, res: Response) => {
        await session({ store, cookie: { maxAge: 10 } })(req, res);
        if (req.session == null) return res.end()
        req.session.foo = "bar";
        id = req.session.id;
        expect(req.session.cookie.expires).toBeInstanceOf(Date);
        expires = req.session.cookie.expires;
        res.end();
      },
      { path: "/" }
    );
    expect(id).toBeDefined()
    expect(expires).toBeDefined()
    expect(res.headers).toHaveProperty("set-cookie");
    expect(res.headers["set-cookie"]).toBe(
      `sid=${id}; Path=/; Expires=${expires?.toUTCString()}; HttpOnly`
    );
    expect(store.set).toHaveBeenCalledWith(id, {
      foo: "bar",
      cookie: { ...defaultCookie, expires, maxAge: 10 },
      [isNew]: true,
    });
    await inject(
      async (req: Request, res: Response) => {
        await session({ store })(req, res);
        if (req.session == null) return res.end()
        req.session.foo = "bar";
        res.end();
      },
      { path: "/", headers: { cookie: `sid=${id}` } }
    );
    expect(store.get).toHaveBeenCalledWith(id);
  });
  test("should destroy session and unset cookie", async () => {
    const store = new MemoryStore();
    store.destroy = vi.fn();
    store.set = vi.fn();
    store.touch = vi.fn();
    const sid = "foo";
    await store.store.set(
      sid,
      JSON.stringify({ foo: "bar", cookie: defaultCookie })
    );
    const res = await inject(
      async (req: Request, res: Response) => {
        await session({ store })(req, res);
        if (req.session == null) return res.end()
        req.session.foo = "quz";
        await req.session.destroy();
        res.end();
      },
      { path: "/", headers: { cookie: `sid=${sid}` } }
    );
    expect(store.destroy).toHaveBeenCalledWith(sid);
    expect(store.set).not.toHaveBeenCalled();
    expect(store.touch).not.toHaveBeenCalled();
    expect(res.headers["set-cookie"]).toBe(
      `sid=${sid}; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly`
    );
  });
  test("should destroy session and unset cookie (autoCommit=false)", async () => {
    const store = new MemoryStore();
    store.destroy = vi.fn();
    store.set = vi.fn();
    store.touch = vi.fn();
    const sid = "foo";
    await store.store.set(
      sid,
      JSON.stringify({ foo: "bar", cookie: defaultCookie })
    );
    const res = await inject(
      async (req: Request, res: Response) => {
        await session({ store, autoCommit: false })(req, res);
        if (req.session == null) return res.end()
        req.session.foo = "quz";
        await req.session.destroy();
        expect(req).not.toHaveProperty("session");
        res.end();
      },
      { path: "/", headers: { cookie: `sid=${sid}` } }
    );
    expect(store.destroy).toHaveBeenCalledWith(sid);
    expect(store.set).not.toHaveBeenCalled();
    expect(store.touch).not.toHaveBeenCalled();
    expect(res.headers["set-cookie"]).toBe(
      `sid=${sid}; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly`
    );
  });
  test("not to modify res.writeHead and res.end if autoCommit = false", async () => {
    const req = { headers: {} } as Request;
    const noop = () => undefined;
    const res = { writeHead: noop, end: noop } as unknown as Response;
    await session({ autoCommit: false })(req, res);
    expect(res.end).toBe(noop);
    expect(res.writeHead).toBe(noop);
  });
  test("not make res.writeHead and res.end async", async () => {
    const req = { headers: {} } as Request;
    const res = {
      writeHead() {
        return this;
      },
      end: () => undefined,
    } as unknown as Response;
    await session({ autoCommit: true })(req, res);
    expect(typeof res.end()).not.toEqual("object");
    expect(res.writeHead(200)).toBe(res);
  });
  test("not touch (touchAfter = -1) by default", async () => {
    const store = new MemoryStore();
    store.touch = vi.fn();
    const expires = new Date(Date.now() + 1000);
    await store.set("foo", {
      cookie: { ...defaultCookie, expires, maxAge: 5 },
    });
    const res = await inject(
      async (req: Request, res: Response) => {
        await session({ store })(req, res);
        if (req.session == null) return res.end()
        expect(req.session[isTouched]).toBeFalsy();
        res.end(String(req.session.cookie.expires?.getTime()));
      },
      { path: "/", headers: { cookie: "sid=foo" } }
    );
    expect(store.touch).not.toHaveBeenCalled();
    expect(Number(res.payload)).toEqual(expires.getTime());
  });
  test("touch if session life time > touchAfter", async () => {
    const store = new MemoryStore();
    store.touch = vi.fn(() => Promise.resolve());
    const expires = new Date(Date.now() + 2000);
    await store.set("foo", {
      cookie: { ...defaultCookie, expires, maxAge: 5 },
    });
    let newExpires: Date | undefined;
    const res = await inject(
      async (req: Request, res: Response) => {
        await session({ store, touchAfter: 1 })(req, res);
        if (req.session == null) return res.end()
        expect(req.session[isTouched]).toBe(true);
        newExpires = req.session.cookie.expires;
        res.end();
      },
      { path: "/", headers: { cookie: "sid=foo" } }
    );
    expect(newExpires).toBeDefined()
    expect(newExpires?.getTime()).toBeGreaterThan(expires.getTime());
    expect(res.headers["set-cookie"]).toEqual(
      `sid=foo; Path=/; Expires=${newExpires?.toUTCString()}; HttpOnly`
    );
    expect(store.touch).toHaveBeenCalledWith("foo", {
      cookie: { ...defaultCookie, expires: newExpires, maxAge: 5 },
      [isTouched]: true,
    });
  });
  test("not touch session life time < touchAfter", async () => {
    const store = new MemoryStore();
    store.touch = vi.fn(() => Promise.resolve());
    const expires = new Date(Date.now() + 2000);
    await store.set("foo", {
      cookie: { ...defaultCookie, expires, maxAge: 5 },
    });
    let newExpires: Date | undefined;
    const res = await inject(
      async (req: Request, res: Response) => {
        await session({ store, touchAfter: 10 })(req, res);
        if (req.session == null) return res.end()
        expect(req.session[isTouched]).toBeFalsy();
        newExpires = req.session.cookie.expires;
        res.end();
      },
      { path: "/", headers: { cookie: "sid=foo" } }
    );
    expect(newExpires).toBeDefined()
    expect(newExpires?.getTime()).toEqual(expires.getTime());
    expect(res.headers).not.toHaveProperty("set-cookie");
    expect(store.touch).not.toHaveBeenCalled();
  });
  test("support calling res.end() multiple times", async () => {
    // This must be tested with a real server to verify headers sent error
    // https://github.com/hoangvvo/next-session/pull/31
    const server = createServer(async (req: Request, res: Response) => {
      await session()(req, res);
      if (req.session == null) return res.end()
      req.session.foo = "bar";
      res.end("Hello, world!");
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(
        async (req: Request, res: Response) => {
          await session()(req, res);
          if (req.session == null) return res.end()
          req.session.foo = "bar";
          res.end("Hello, world!");
          res.end();
        },
        () => resolve())
    })

    const address = server.address();
    if (address == null) throw new Error("Somehow, the server is not listening")
    if (typeof address === "string") throw new Error("Listening on a unix socket is unsupported")

    await new Promise<void>((resolve, reject) => {
      request(`http://127.0.0.1:${address.port}/`, (res) => {
        let data = "";
        res.on("data", (d) => {
          if (d) data += d;
        });
        res.on("end", () => {
          expect(data).toEqual("Hello, world!");
          server.close((err) => {
            if (err) return reject(err)
            resolve()
          });
        });
        res.on("error", reject);
      })
        .on("error", reject)
        .end();
    })
  });
  test("allow encode and decode sid", async () => {
    const decode = (key: string) => {
      if (key.startsWith("sig.")) return key.substring(4);
      return null;
    };
    const encode = (key: string) => {
      return `sig.${key}`;
    };
    const store = new MemoryStore();
    const sessionFn = session({ store, encode, decode });
    let sid: string | undefined;
    const res = await inject(
      async (req: Request, res: Response) => {
        await sessionFn(req, res);
        if (req.session == null) return res.end()
        req.session.foo = "bar";
        sid = req.session.id;
        res.end();
      },
      { path: "/" }
    );
    expect(sid).toBeDefined()
    expect(res.headers["set-cookie"]).toBe(
      `sid=${encode(sid as string)}; Path=/; HttpOnly`
    );
    expect(store.store.has(sid as string)).toBe(true);
    const handler = async (
      req: Request,
      res: Response,
    ) => {
      await sessionFn(req, res);
      if (req.session == null) return res.end()
      res.end(req.session.foo);
    };
    const res2 = await inject(handler, {
      path: "/",
      headers: { cookie: `sid=${encode(sid as string)}` },
    });
    expect(res2.payload).toEqual("bar");
    const res3 = await inject(handler, {
      path: "/",
      headers: { cookie: `sid=${sid}` },
    });
    expect(res3.payload).toEqual("");
  });
  test("set cookie correctly after res.writeHead in autoCommit", async () => {
    const res = await inject(
      async (req: Request, res: Response) => {
        await session()(req, res);
        if (req.session == null) return res.end()
        req.session.foo = "bar";
        res.writeHead(302, { Location: "/login" }).end();
      },
      { path: "/" }
    );
    expect(res.headers).toHaveProperty("set-cookie");
  });
  test("should convert to date if store returns session.cookies.expires as string", async () => {
    const store = {
      get: async (id: string) => {
        //  force sess.cookie.expires to be string
        return JSON.parse(
          JSON.stringify({
            cookie: { maxAge: 100000, expires: new Date(Date.now() + 4000) },
          })
        );
      },
      set: async (sid: string, sess: SessionData) => undefined,
      destroy: async (id: string) => undefined,
    };
    await inject(
      async (req: Request, res: Response) => {
        await session({ store })(req, res);
        if (req.session == null) return res.end()
        expect(req.session.cookie.expires).toBeInstanceOf(Date);
        res.end();
      },
      { path: "/", headers: { cookie: "sid=foo" } }
    );
  });
});
