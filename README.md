# @otterhttp/session

[![npm][npm-img]][npm-url]
[![GitHub Workflow Status][gh-actions-img]][github-actions]
[![Coverage][cov-img]][cov-url]

Lightweight _promise-based_ session utility for [otterhttp](https://github.com/OtterJS/otterhttp#readme)

## Installation

```sh
// npm
npm install @otterhttp/session

// yarn
yarn add @otterhttp/session

// pnpm
pnpm i @otterhttp/session
```

## Usage

**Warning** The default session store (if `options?.store` is `undefined`), `MemoryStore`,
**DOES NOT** work in production. You must use a [Session Store](#session-store).

```js
// ./lib/get-session.js
import session from "@otterhttp/session"
export const getSession = session(options)
```

### [otterhttp](https://github.com/otterjs/otterhttp#readme)

```js
import { App } from "@otterhttp/app"

import { getSession } from "./lib/get-session.js"

const app = new App()
app.get("/", async (req, res) => {
  const session = await getSession(req, res)
  session.views = session.views ? session.views + 1 : 1
  res.end(`In this session, you have visited this page ${session.views} time(s).`)
})
app.listen(8080)
```

### [`node:http`](https://nodejs.org/api/http.html)

```js
import * as http from "node:http"

import { getSession } from "./lib/get-session.js"

const server = http.createServer(async (req, res) => {
  const session = await getSession(req, res)
  session.views = session.views ? session.views + 1 : 1
  res.end(`In this session, you have visited this website ${session.views} time(s).`)
})
server.listen(8080);
```

## Options

`@otterhttp/session` accepts the properties below.

| options         | description                                                                                                                                  | default                                  |
|-----------------|----------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------|
| name            | The name of the cookie to be read from the request and set to the response.                                                                  | `sid`                                    |
| store           | The session store instance to be used. **Required** to work in production!                                                                   | `MemoryStore`                            |
| genid           | The function that generates a string for a new session ID.                                                                                   | [`nanoid`](https://github.com/ai/nanoid) |
| encode          | Transforms session ID before setting cookie. It takes the raw session ID and returns the decoded/decrypted session ID.                       | `encodeURIComponent`                     |
| decode          | Transforms session ID back while getting from cookie. It should return the encoded/encrypted session ID                                      | `decodeURIComponent`                     |
| touchAfter      | Only touch after an amount of time **(in seconds)** since last access. Disabled by default or if set to `-1`. See [touchAfter](#touchAfter). | `-1` (Disabled)                          |
| cookie.secure   | Specifies the boolean value for the **Secure** `Set-Cookie` attribute.                                                                       | `false`                                  |
| cookie.httpOnly | Specifies the boolean value for the **httpOnly** `Set-Cookie` attribute.                                                                     | `true`                                   |
| cookie.path     | Specifies the value for the **Path** `Set-Cookie` attribute.                                                                                 | `/`                                      |
| cookie.domain   | Specifies the value for the **Domain** `Set-Cookie` attribute.                                                                               | unset                                    |
| cookie.sameSite | Specifies the value for the **SameSite** `Set-Cookie` attribute.                                                                             | unset                                    |
| cookie.maxAge   | **(in seconds)** Specifies the value for the **Max-Age** `Set-Cookie` attribute.                                                             | unset (Browser session)                  |

### touchAfter

Touching refers to the extension of session lifetime, both in browser (by modifying `Expires` attribute in [Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie) header) and session store (using its respective method) upon access. This prevents the session from being expired after a while.

### encode/decode

You may supply a custom pair of function that _encode/decode_ or _encrypt/decrypt_ the cookie on every request.

```js
// `express-session` signing strategy
const signature = require("cookie-signature");
const secret = "keyboard cat";
session({
  decode: (raw) => signature.unsign(raw.slice(2), secret),
  encode: (sid) => (sid ? "s:" + signature.sign(sid, secret) : null),
});
```

## API

### session object

This allows you to **set** or **get** a specific value that associates to the current session.

```js
//  Set a value
if (loggedIn) session.user = "John Doe";
//  Get a value
const currentUser = session.user; // "John Doe"
```

### session.touch()

Manually extends the session expiry by `maxAge`.

```js
session.touch();
```

If `touchAfter` is set with a non-negative value, this will be automatically called accordingly.

### session.destroy()

Destroy the current session and remove it from session store.

```js
async function logOut() {
  await session.destroy();
}
```

### session.commit()

Save the session to the provided store.
Returns `Promise<void>`.

You **must** call this to persist session records. 
Otherwise, new session records will be created on every request, and no values will be persisted.

```js
session.hello = "world";
await session.commit();
```

### session.id

The unique id that associates to the current session.

## Session Store

The session store to use for session middleware (see `options` above).

> [!IMPORTANT]  
> In production, you will need to implement a scheduled task that clears expired records from your session store 
> implementation.
> 
> How you do this is entirely up to you; if you would like a JavaScript implementation and your application runs within 
> an asynchronous event loop, the `setInterval` method [(MDN)](https://developer.mozilla.org/en-US/docs/Web/API/setInterval) 
> may help you.

### Implementation

A compatible session store must implement the following members:
- `set(sessionId, sessionRecord)` should create or update the value of a session record associated with ID `sessionId`
- `get(sessionId)` should get the value of a session record associated with ID `sessionId`, or return `null`
- `destroy(sessionId)` should delete a session record associated with ID `sessionId`

Following members' implementation is optional but recommended:
- `touch(sessionId, sessionRecord)` should extend the lifetime of a session record associated with ID `sessionId`, without 
  affecting its value.

All functions must return `Promise`.

Refer to [MemoryStore](https://github.com/OtterJS/otterhttp-session/blob/main/src/memory-store.ts).

_TypeScript:_ the `SessionStore` type can be used to aid/validate implementation:

```ts
import type { SessionStore } from "@otterhttp/session";

class CustomStore implements SessionStore {}
```

### Using `abstract-level` stores

> [!WARNING]
> This feature hasn't been implemented yet!

## License

[LGPL-3.0-or-later](LICENSE)

[npm-url]: https://npmjs.com/package/@otterhttp/session
[npm-img]: https://img.shields.io/npm/dt/@otterhttp/session?style=for-the-badge&color=blueviolet
[github-actions]: https://github.com/OtterJS/otterhttp-session/actions
[gh-actions-img]: https://img.shields.io/github/actions/workflow/status/OtterJS/otterhttp-session/main.yml?branch=main&style=for-the-badge&color=blueviolet&label=&logo=github
[cov-url]: https://coveralls.io/github/OtterJS/otterhttp-session
[cov-img]: https://img.shields.io/coveralls/github/OtterJS/otterhttp-session?style=for-the-badge&color=blueviolet
