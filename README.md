# 墨问 MoWen

[中文](README.md) · [English](README_en.md)

墨问是给人和 Agent 共用的表格与笔记。和 Agent 聊完的结果，用自然语言就能存进来；之后也能用自然语言继续查、改、整理。

在 WorkBuddy、Codex 等环境里装上墨问 Skill，Agent 就能把对话里的结论写入墨问的表或笔记。不想切工具时，直接在墨问网页右侧的 AI 助手里说同样的话，也可以管理表格和笔记。

线上：https://mowen.lemoai.cn  
仓库：https://github.com/laomoai/mowen

## 功能与特点

- **为 Agent 沟通而存**：表格记结构化结果，笔记记长文和过程；文件夹把它们放在一起。
- **外面的 Agent**：把官方 Skill 装进 WorkBuddy、Codex 等，即可用自然语言读写墨问。Skill：[`/agent/mowen/SKILL.md`](https://mowen.lemoai.cn/agent/mowen/SKILL.md)
- **里面的助手**：网页里用自然语言建表、加字段、写记录、改笔记、移动到文件夹。
- **手机可安装**：加到主屏幕后可查表格和笔记；要改，对助手说。电脑上仍可直接编辑。
- **表格**：多种字段类型；网格 / 画廊 / 看板；行详情；回收站。
- **笔记**：Markdown、插图、嵌入表格；笔记内部可以有子页面。
- **按文件夹授权**：API Key（`mw_` 前缀）只看到所选文件夹里的表和笔记；只读 Key 不能写。

## 运行环境

- Node.js 18+
- SQLite（WAL）
- 生产用 Nginx 反向代理，应用只监听 `127.0.0.1`

空库第一个注册用户是管理员。邀请成员走邮件设密（Resend）。

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

密钥不要进 Git。生产放服务器环境文件，不要写进仓库。

## 生产部署

清单在 `deploy/vps-deploy.json`（无密钥）。约定：

- 进程：systemd 服务，监听 `127.0.0.1:18085`
- 入口：Nginx HTTPS，不要把应用端口暴露到公网
- 数据：独立数据目录（SQLite + 图片）
- 备份：`sqlite3 … '.backup …'`，不要直接拷正在写的 WAL 主文件

健康检查：`/api/health`

## API 与 Skill

- 文档：`/api/docs`
- OpenAPI：`/api/openapi.json`
- 鉴权头：`X-API-Key`（不是 Bearer）
- Skill：https://mowen.lemoai.cn/agent/mowen/SKILL.md

```bash
export MOWEN_URL=https://mowen.lemoai.cn
export MOWEN_KEY=mw_你的密钥
python3 scripts/mowen.py workspace
python3 scripts/mowen.py move --id wn_t_xxxx --folder wn_f_目标文件夹
```

Key 可按文件夹限制可见的表和笔记。只读 Key 不能写。

## 图片

存在本机磁盘，库里只记存储 key。读图走 `/api/files/…`，要登录或短时签名。闲置图（超过 24 小时无人引用）可在 **设置 → 附件** 清理。

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
