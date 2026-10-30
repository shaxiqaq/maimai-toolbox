# 舞萌工具箱

好友间自用的舞萌 DX 查分与工具站（非商业）。数据来自[水鱼查分器](https://www.diving-fish.com/maimaidx/prober/)与[落雪查分器](https://maimai.lxns.net/)的公开接口；曲绘、音频与谱面版权归 SEGA。

## 结构

```
shared/   前后端共用的类型（曲库模型）
server/   Hono 后端：拉取并缓存上游数据（SQLite），合并成曲库，提供 /api/*
web/      Vue 3 + Vite 前端
```

## 开发

需要 Node 24（内置 `node:sqlite`）和 pnpm。

```bash
pnpm install
pnpm sync        # 首次拉取上游数据（之后服务端每 6 小时自动刷新）
pnpm dev         # 同时启动 server(:8787) 与 web(:5173)
```

打开 http://localhost:5173 。

## 邀请好友

查分和工具不需要登录；收藏夹和 B50 云端存档需要账号，注册只能用邀请码：

```bash
pnpm invite 3    # 生成 3 个一次性邀请码
```

把邀请码发给好友，或者直接发链接 `https://<你的域名>/login?invite=<邀请码>`（会自动填好）。

## 服务端环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 8787 | |
| `DATA_DIR` | `./data` | SQLite 存放位置 |
| `SYNC_INTERVAL_HOURS` | 6 | 上游数据刷新间隔 |
| `ADMIN_TOKEN` | 空 | 设置后可 `POST /api/admin/sync`（`Authorization: Bearer <token>`）强制刷新 |
| `COOKIE_SECURE` | 空 | 设为 `1` 时会话 Cookie 带 `Secure`。**用 HTTPS 部署时必须打开** |
| `ALLOWED_ORIGINS` | 空 | 前后端不同域时，允许发起写操作的前端来源（逗号分隔） |

账号安全：密码用 scrypt 加盐哈希；会话是随机令牌，数据库只存其 SHA-256，Cookie 为 HttpOnly + SameSite=Lax；
写操作校验 Origin 防 CSRF；登录和注册失败按 IP / 用户名限流（15 分钟 10 次）。

## API

- `GET /api/health`
- `GET /api/catalog` — 合并后的曲库（支持 ETag / 304）
- `GET /api/player/b50?username=|qq=` — 水鱼公开查询 B50
- `POST /api/lxns/scores`（请求头 `X-User-Token`）— 落雪个人密钥获取全部成绩；密钥只转发、不记录
- `GET /api/jacket/{id}.png` — 曲绘，首次从落雪获取后缓存在 `DATA_DIR/jackets/`
- `GET /api/shared/{shareId}` — 公开的 B50 分享（只读）
- 账号：`GET /api/auth/me`、`POST /api/auth/register`（用户名、密码、邀请码）、`POST /api/auth/login`、`POST /api/auth/logout`
- 收藏夹（需登录）：`GET|POST /api/favorites`、`PATCH|DELETE /api/favorites/{id}`、`PUT|DELETE /api/favorites/{id}/songs/{songId}`
- B50 存档（需登录）：`GET|POST /api/archives`、`GET|PATCH|DELETE /api/archives/{id}`、`POST|DELETE /api/archives/{id}/share`

设计与路线见 `../deepdive/00-复刻设计.md`。
