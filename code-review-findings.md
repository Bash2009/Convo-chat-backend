# Code Review — NestJS Backend + Vite/React Frontend (Chat App)

Scope: `src.zip` (React/Vite frontend, real-time chat client) and `src-back.zip` (NestJS backend, Socket.IO + TypeORM/Postgres + Firebase + Cloudinary).

Findings are grouped by severity. "Blocking" = will break or be exploited in production. "Performance" = works but degrades under real load. "Hardening" = works, but not production-grade practice.

---

## 🔴 Blocking / Security-Critical

### 1. Chat authorization is missing on the hot paths (IDOR)
`ChatsGateway.joinChat`, `loadMoreMessages`, `sendMessage`, and `markRead` never check that the authenticated user is actually a member of `chatId` before acting. `ChatsService.getMessages`, `sendMessage`, and `markRead` take `chatId` and trust the caller completely — there's no membership lookup at all.

Practical impact: any logged-in user who knows (or guesses/enumerates) a chat's UUID can `joinChat` on it, read its full message history, send messages into it, and mark its messages read. `delete` and `addMembers` *do* check membership — this inconsistency suggests it was simply missed on the others, not an intentional design choice.

Fix: add a shared `assertMember(chatId, uid)` check (single indexed query) at the top of every gateway handler and service method that touches a specific chat.

### 2. REST `POST /chats` bypasses the authorization the socket path has
`ChatsController.create()` passes the raw `CreateChatDto` straight to the service without reading `req.user`. The DTO lets the client supply an arbitrary `members` array and an arbitrary `admin` field. That means a client can:
- Create a group chat and name **another user** as admin.
- Create a chat that doesn't even include themselves as a participant.

The Socket.IO `createChat` handler does this correctly (it forces the caller's own uid into `members`), so you effectively have two code paths for the same operation with different (and inconsistent) security guarantees. Recommend deleting the REST endpoint or making it call the same authorized code path as the gateway.

### 3. Refresh-token blacklist is an in-memory `Set`
```ts
private tokenBlacklist = new Set<string>();
```
This lives on a single Node process. Consequences:
- Restart/redeploy (which happens on every deploy) wipes it — every revoked refresh token becomes valid again.
- It scales to exactly one instance. The moment you run 2+ backend instances behind a load balancer (which you'll need for real traffic), a token blacklisted by instance A is still accepted by instance B.
- It never evicts entries — this is an unbounded memory leak that grows for the lifetime of the process (every refresh call adds a jti, nothing ever removes one).

This needs to move to Redis (or Postgres) with a TTL matching the refresh token's expiry (7d), which also solves the horizontal-scaling problem below.

### 4. No Socket.IO horizontal scaling support
`uidToSocketId` (the map used to route `chatCreated`, `chatDeleted`, `memberAdded` events to the right sockets) is also a plain in-memory `Map`, and there's no Redis adapter (`@socket.io/redis-adapter`) wired into the gateway. The moment you run more than one backend instance, users connected to different instances will stop receiving each other's real-time events (e.g., User A creates a chat, User B — connected to a different instance — never gets `chatCreated`). This is fine for a single instance but is a hard scaling wall.

### 5. Access + refresh JWTs stored in `localStorage`
```ts
localStorage.setItem("access_token", data.access_token);
localStorage.setItem("refresh_token", data.refresh_token);
```
Any XSS anywhere in the app (a dependency, a future feature, a markdown-rendering bug, etc.) gets full read access to both tokens, and the refresh token is long-lived (7 days). This is a standard but real production risk — the conventional fix is an httpOnly, secure, `SameSite` cookie for the refresh token (issued by the server, never touched by JS), keeping only the short-lived access token in memory.

### 6. `logout()` on the frontend sends the wrong token to the wrong guard
```ts
await fetch(`${BASE_URL}/auth/logout`, {
  method: "POST",
  headers: { Authorization: `Bearer ${refreshToken}` },
});
```
The `/auth/logout` route is protected by `JwtAuthGuard`, which validates against `JWT_SECRET` (the **access**-token secret). The frontend is sending the **refresh** token (signed with `JWT_REFRESH_SECRET`). This request will always fail JWT verification and return 401 — logout on the server silently never succeeds. It's swallowed by the `try/catch` so nobody notices, but it also means `authService.logout()` (which does nothing useful today anyway — see #7) never even runs.

### 7. `logout()` doesn't actually revoke anything server-side
```ts
logout() {
  return { message: 'Logged out successfully' };
}
```
It takes no token and blacklists nothing. Combined with #6, a stolen refresh token remains valid for its full 7-day lifetime even after the user clicks "log out."

### 8. No mutex around token refresh on the client
`request()` refreshes the token reactively, once per failed call, with no single-flight guard. If several requests 401 around the same time (very normal — e.g., a page that fires 3–4 API calls on mount), each one independently calls `/auth/refresh`. Since the backend blacklists the *old* refresh-token jti on every refresh call, the second concurrent refresh request will find its jti already blacklisted and throw `UnauthorizedException`, which forces that request into `logout()` — logging the user out from what should have been a successful session. This is a real, reproducible bug under normal usage patterns (not just an edge case), and it gets worse under poor network conditions where retries pile up.

---

## 🟠 Performance

### 9. No pagination wired up in the chat UI despite the backend supporting it
The backend has a working `loadMoreMessages` socket event and `MESSAGES_PAGE_SIZE = 50`, but `ChatRoom.tsx` never emits it — there's no scroll-triggered "load more" handler at all. Every chat room only ever shows its most recent 50 messages; older history is simply unreachable from the UI. Aside from being a missing feature, this also means the pagination work already done on the backend isn't earning its keep.

### 10. No message list virtualization
`ChatRoom` renders `messages.map(...)` directly into the DOM with no windowing (e.g., `react-window`/`react-virtual`). At 50 messages this is invisible; once #9 is fixed and users scroll back through months of history, you'll be mounting thousands of DOM nodes (each with SVG status ticks) in a single scroll container, which will visibly jank on scroll and blow up memory on mobile.

### 11. Re-verifying the JWT on every single socket event
`verifyClient()` (a full `jwtService.verify()` call, i.e., signature verification) runs on **every** `getChats`, `getUser`, `createChat`, `joinChat`, `loadMoreMessages`, `deleteChat`, `addMember`, `sendMessage`, and `markRead` — even though the uid was already verified once in `handleConnection` and stashed on `client.data.uid`. For a chat app, `sendMessage` in particular can be called at high frequency; doing cryptographic signature verification per keystroke-adjacent event is unnecessary CPU work. Trust `client.data.uid` (set at connection time) and only re-verify on reconnect/expiry.

### 12. `sendMessage` does a redundant `fetchSockets()` room scan on every message
```ts
const socketsInRoom = (await this.server.in(data.chatId).fetchSockets()).length;
```
This asks Socket.IO to enumerate every socket in the room (a round trip through the adapter, more expensive still once a Redis adapter is introduced per #4) on every single message send, just to decide whether to emit a "delivered" status. This is avoidable — e.g., track member online/joined-room counts incrementally, or drop the delivered-status precision in favor of a periodic/eager approach.

### 13. `findExistingPrivateChat` loads full chat graphs to check for an existing 1:1 chat
```ts
const members = await this.chatMemberRepository.find({
  where: { user: { uid: In(uids) } },
  relations: { chat: { members: { user: true } } },
});
```
This pulls every chat-membership row (with nested chat + all its members + all their user records) for both users, then does the "is there a matching private chat" comparison in application code. This runs on every `createChat` call. It'll work fine at small scale but is doing much more I/O than necessary — a targeted query (e.g., `chat_member` self-join filtered to `isGroup = false` grouped by `chatId` having exactly these two members) would be a single indexed query instead of loading full object graphs.

### 14. `AppService`/global 60 req/min throttle applies uniformly to the (heavier) profile endpoints
Avatar upload endpoints (`profile/create`, `profile/update`) share the same default throttle tier as everything else, while auth endpoints got explicit, tighter `@Throttle` overrides. Not wrong, but worth deliberately tuning — file upload endpoints are usually the ones you want a *stricter*, separate limit on (they're expensive per-request: multer buffering + Cloudinary upload).

---

## 🟡 Hardening / Correctness

### 15. Two independent chat-creation code paths (REST + WebSocket) will drift
Beyond the security gap in #2, maintaining `create()` logic in both `ChatsController` (unauthenticated-with-respect-to-user) and `ChatsGateway.create()` (correctly scoped) means every future change to chat-creation rules (validation, limits, business logic) has to be made twice or it silently diverges. Pick one source of truth.

### 16. `data-source.ts` and `app.module.ts` build the Postgres connection two different ways
`app.module.ts` uses `DATABASE_URL` (falling back to a hand-built connection string from `DB_PASSWORD`/`DB_PORT`/`DB_NAME`, defaulting host to `localhost`), while `data-source.ts` (used by the TypeORM CLI for migrations) uses discrete `DB_HOST`/`DB_PORT`/`DB_USERNAME`/`DB_PASSWORD`/`DB_NAME` vars with no `DATABASE_URL` fallback at all. If your production env only sets `DATABASE_URL` (common on Render/Railway/Heroku-style hosts), running migrations via the CLI against prod will silently try to hit `undefined`/defaults instead of the real database. Worth unifying into one config resolution used by both.

### 17. `ThrottlerGuard` is IP-based only, no per-user limiting on WebSocket events
The `ThrottlerModule` only guards HTTP routes (`APP_GUARD` + `@Throttle` decorators). The entire Socket.IO surface (`sendMessage`, `createChat`, `addMember`, etc.) has **no rate limiting at all**. A single authenticated client can flood `sendMessage` as fast as the event loop allows — no debounce, no per-socket throttle. This is both an abuse vector and a self-inflicted performance problem (every message is a DB write + a room-wide `fetchSockets()` per #12).

### 18. Silent error swallowing in several socket handlers
`getUser`, `joinChat`, and `loadMoreMessages` catch all errors and emit a generic message without logging (`getUser`/`joinChat` don't even call `this.logger.error`, unlike `createChat`/`deleteChat`/`addMember`/`sendMessage`, which do). Any real bug in those three handlers (bad query, DB timeout, etc.) will be invisible in your logs — you'll only ever see the generic client-side toast, with no server-side trace to debug from.

### 19. `Object.assign(profile, dto)` in `ProfileService.update` applies the whole DTO blindly
Any field present on `UpdateProfileDto` gets merged directly onto the entity before saving. This is validated by `class-validator`'s `whitelist: true` globally, which helps, but it's worth double-checking `UpdateProfileDto` doesn't expose any fields you don't want directly user-settable (e.g., verification status, role-type fields) — a partial-update DTO built from `PartialType` can accidentally inherit more than intended if the base DTO ever grows.

### 20. No request/response compression or caching headers configured in `main.ts`
No `compression()` middleware, no cache-control on read-heavy GETs (`GET /profile/name/:name`, `GET /profile/id/:uid`). Minor at low traffic, but easy, cheap wins before going to production.

---

## Summary Table

| # | Issue | Area | Severity |
|---|---|---|---|
| 1 | No chat membership check on join/send/read/load-more | Backend (gateway+service) | 🔴 Security |
| 2 | REST `POST /chats` lets caller spoof members/admin | Backend | 🔴 Security |
| 3 | In-memory refresh-token blacklist (leaks + doesn't survive restart/scale) | Backend | 🔴 Security/Scaling |
| 4 | No Redis adapter for Socket.IO — breaks on >1 instance | Backend | 🔴 Scaling |
| 5 | JWTs in `localStorage` | Frontend | 🔴 Security |
| 6 | `logout()` sends refresh token to access-token guard | Frontend | 🔴 Bug |
| 7 | Server `logout()` doesn't revoke anything | Backend | 🔴 Security |
| 8 | No single-flight lock on token refresh → spurious logouts | Frontend | 🔴 Bug |
| 9 | `loadMoreMessages` never called — pagination unreachable | Frontend | 🟠 Perf/Feature gap |
| 10 | No message list virtualization | Frontend | 🟠 Perf |
| 11 | JWT re-verified on every socket event | Backend | 🟠 Perf |
| 12 | `fetchSockets()` room scan on every `sendMessage` | Backend | 🟠 Perf |
| 13 | Heavy query to find existing 1:1 chat | Backend | 🟠 Perf |
| 14 | Upload endpoints share generic throttle tier | Backend | 🟡 Hardening |
| 15 | Duplicate chat-creation logic (REST vs. gateway) | Backend | 🟡 Maintainability |
| 16 | Inconsistent DB config resolution (app vs. migrations) | Backend | 🟡 Correctness |
| 17 | No rate limiting on WebSocket events | Backend | 🟡 Hardening |
| 18 | Inconsistent error logging in gateway handlers | Backend | 🟡 Observability |
| 19 | Blind `Object.assign` on profile update | Backend | 🟡 Hardening |
| 20 | No compression / cache headers | Backend | 🟡 Hardening |

## Suggested priority order
1. Fix #1 and #2 first — these are exploitable authorization gaps, not theoretical.
2. Fix #6/#7 together (logout is currently non-functional end-to-end).
3. Move the token blacklist to Redis (#3) — this also gives you the infrastructure needed for #4, and #4 becomes necessary the moment you scale past one instance.
4. Fix #8 (refresh mutex) — this is likely already causing intermittent "randomly logged out" reports if the app has real users.
5. Everything else can be tackled incrementally; none of it will *break* production, but #9/#10 will visibly degrade UX as chat histories grow, and #17 is worth adding before opening the app to the public.

Notably absent from the codebase and worth calling out: no automated test coverage was reviewed here (there are `.spec.ts` files present on the backend — worth checking their actual coverage of the auth/chats modules specifically, since that's where the bugs above live), and no CI/CD or environment-variable validation (e.g., `Joi`/`zod` schema on `ConfigModule`) was found, so a missing env var in production would fail at first use rather than at boot.
