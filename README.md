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

## 服务端环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 8787 | |
| `DATA_DIR` | `./data` | SQLite 存放位置 |
| `SYNC_INTERVAL_HOURS` | 6 | 上游数据刷新间隔 |
| `ADMIN_TOKEN` | 空 | 设置后可 `POST /api/admin/sync`（`Authorization: Bearer <token>`）强制刷新 |

## API

- `GET /api/health`
- `GET /api/catalog` — 合并后的曲库（支持 ETag / 304）

设计与路线见 `../deepdive/00-复刻设计.md`。
