# 纱汐查分器

好友间自用的舞萌 DX 查分与工具站（非商业）。数据来自[水鱼查分器](https://www.diving-fish.com/maimaidx/prober/)、[落雪查分器](https://maimai.lxns.net/)与 [nearcade](https://nearcade.cn) 的公开接口；曲绘与谱面版权归 SEGA。

## 架构（Cloudflare 免费额度可运行）

```
shared/   前后端共用：曲库合并、Rating/计算器、水鱼/落雪/nearcade 客户端
web/      Vue 3 + Vite 前端；作为静态资源由 Worker 托管
worker/   Cloudflare Worker（Hono）+ D1：只负责账号、收藏夹、B50 存档与分享
```

- **公开数据在浏览器里直接获取**：水鱼、落雪、nearcade、落雪曲绘都允许跨域请求。曲库在浏览器中合并后存进 Cache Storage（6 小时内直接用，过期先用旧的再后台刷新）。
- **落雪个人密钥只在浏览器和落雪之间传递**，不经过本站服务器。
- **机厅定位**在浏览器里精确到约 100 米后直接发给 nearcade。
- Worker 每次请求只做少量数据库操作，适配免费版 10ms CPU 限制。密码用 PBKDF2-SHA256（20,000 次迭代，约 5ms）；迭代次数写在每条哈希里，以后可以调高而不影响旧账号。

## 本地开发

需要 Node 24 和 pnpm。

```bash
pnpm install
cp worker/.dev.vars.example worker/.dev.vars   # 本地允许 Vite 开发服务器发起写操作
pnpm db:migrate:local      # 初始化本地 D1
pnpm dev                   # worker(:8787) + web(:5173)，打开 http://localhost:5173
```

也可以先 `pnpm build`，再单独 `pnpm dev:worker`，直接访问 http://localhost:8787 ，这和线上的形态一致。

## 部署到 Cloudflare

```bash
pnpm cf:login                               # 登录 Cloudflare（授权页在 Microsoft Edge 中打开；用默认浏览器则运行 npx wrangler login）
npx wrangler d1 create maimai-toolbox       # 把输出的 database_id 填进 worker/wrangler.jsonc
pnpm db:migrate:remote                      # 在线上 D1 建表
pnpm deploy                                 # 构建前端并发布 Worker
```

发布后的地址是 `https://maimai-toolbox.<你的子域>.workers.dev`；也可以在 Cloudflare 后台给 Worker 绑定自己的域名。

`worker/wrangler.jsonc` 中的变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `COOKIE_SECURE` | `1` | 会话 Cookie 带 `Secure`（线上是 HTTPS，保持 `1`） |
| `ALLOWED_ORIGINS` | 空 | 允许发起写操作的额外来源；本地开发在 `worker/.dev.vars` 里设为 `http://localhost:5173` |
| `OPEN_REGISTRATION` | `1` | `1` 表示任何人都能注册；改成其他值则注册需要邀请码 |

## 注册与邀请码

查分和工具不需要登录；收藏夹和 B50 云端存档需要账号。目前注册是开放的，同一 IP 每 15 分钟最多注册 10 次。

如果想改回只对好友开放，把 `OPEN_REGISTRATION` 改成 `0` 后重新 `pnpm deploy`，然后用 `pnpm invite 3`（本地加 `--local`）生成一次性邀请码，或者直接发 `https://<你的地址>/login?invite=<邀请码>`（会自动填好）。

## Worker API

- `GET /api/health`
- `GET /api/shared/{shareId}` — 公开的 B50 分享（只读）
- 账号：`GET /api/auth/me`、`POST /api/auth/register`（用户名、密码，需要时加邀请码）、`POST /api/auth/login`、`POST /api/auth/logout`
- 收藏夹（需登录）：`GET|POST /api/favorites`、`PATCH|DELETE /api/favorites/{id}`、`PUT|DELETE /api/favorites/{id}/songs/{songId}`
- B50 存档（需登录）：`GET|POST /api/archives`、`GET|PATCH|DELETE /api/archives/{id}`、`POST|DELETE /api/archives/{id}/share`

账号安全：会话是随机令牌，数据库只存其 SHA-256，Cookie 为 HttpOnly + SameSite=Lax + Secure；写操作校验 Origin 防 CSRF；登录和注册失败按 IP / 用户名限流（15 分钟 10 次，记录在 D1 里）。

## 许可证

本仓库的代码以 [MIT](LICENSE) 许可证开源。许可证只涵盖代码本身：maimai 的曲目、曲绘、谱面等内容版权归 SEGA，
曲库与成绩数据来自水鱼查分器、落雪查分器，机厅数据来自 nearcade，使用时请遵守各自的条款。
