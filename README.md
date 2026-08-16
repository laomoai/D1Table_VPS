# 墨问 MoWen

文件夹里的表格与笔记，加上 API 和内置 AI 助手。适合私有部署。

线上：https://mowen.lemoai.cn  
仓库：https://github.com/laomoai/D1Table_VPS

与 Cloudflare 上的旧项目 [D1Table](https://github.com/laomoai/D1Table) 互不共享数据库和运行时。

## 能做什么

- 用文件夹整理表格和笔记（侧栏树）
- 表格：多字段类型、网格 / 画廊 / 看板、行详情、回收站
- 笔记：Markdown、插图、表格引用
- 按文件夹授权的 API Key（`mw_` 前缀）
- Skill：把同目录装进当前 Agent 的 skills，见 `/agent/mowen/SKILL.md`
- 右侧 AI 助手：读写记录、改笔记、建表/加字段（需确认）、移动到文件夹；对话存在云端

## 运行环境

- Node.js 18+
- SQLite（WAL）
- 反向代理（生产用 Nginx，应用只监听 `127.0.0.1`）

登录是邮箱 + 密码。邀请成员走邮件设密（Resend）。空库第一个注册用户是管理员。

## 本地运行

```bash
cp .env.example .env
# 填写 SESSION_SECRET
npm install
cd web && npm install && cd ..
npm run build:web
npm start
```

打开 http://127.0.0.1:18085 。

开发时可另开：

```bash
npm run dev          # 后端热重载
npm run dev:web      # 前端 Vite
```

迁移：`npm run db:migrate`（启动时也会自动跑）。

## 环境变量

见 `.env.example`。常用项：

| 变量 | 说明 |
|---|---|
| `SESSION_SECRET` | 必填，会话与文件签名 |
| `LISTEN_HOST` / `LISTEN_PORT` | 默认 `127.0.0.1:18085` |
| `DATA_DIR` / `SQLITE_PATH` | 库与上传文件目录 |
| `PUBLIC_ORIGIN` | 对外域名，邮件链接用 |
| `RESEND_API_KEY` / `MAIL_FROM` | 邀请、重置密码 |
| `DEEPSEEK_API_KEY` | 内置助手，模型 `deepseek-v4-flash` |
| `ALLOW_PUBLIC_REGISTER` | 是否开放注册 |

密钥不要进 Git。生产放服务器 `/etc/d1table.env`。

## 生产部署

清单在 `deploy/vps-deploy.json`（无密钥）。约定：

- 进程：systemd `d1table.service`，`DynamicUser`，监听 `127.0.0.1:18085`
- 入口：Nginx HTTPS，不要把应用端口暴露到公网
- 数据：`/var/lib/d1table`（SQLite + 图片）
- 备份：`sqlite3 … '.backup …'`，不要直接拷正在写的 WAL 主文件

健康检查：`/api/health`

## API 与 Skill

- 文档：`/api/docs`
- OpenAPI：`/api/openapi.json`
- 鉴权头：`X-API-Key`（不是 Bearer）
- Skill：https://mowen.lemoai.cn/agent/mowen/SKILL.md  
  把该目录（含 `scripts/mowen.py`）放进 Agent 自己的 skills，不要指定 `~/.grok` 之类路径。

```bash
export MOWEN_URL=https://mowen.lemoai.cn
export MOWEN_KEY=mw_你的密钥
python3 scripts/mowen.py workspace
python3 scripts/mowen.py move --id wn_t_xxxx --folder wn_f_目标文件夹
```

Key 可按文件夹限制可见的表和笔记。只读 Key 不能写。

## 图片

存在本机磁盘，库里只记存储 key。读图走 `/api/files/…`，要登录或短时签名；新图会按表/笔记做归属校验。闲置图（超过 24 小时无人引用）可在 **设置 → 附件** 清理。

## 目录

| 路径 | 内容 |
|---|---|
| `src/` | Node API（Hono） |
| `web/` | Vue 3 + Vite + Naive UI |
| `migrations/` | SQLite 迁移 |
| `agent/mowen/` | 官方 Skill |
| `public/` | 前端构建产物 |
| `deploy/` | VPS 部署约定（无密钥） |

## License

MIT
