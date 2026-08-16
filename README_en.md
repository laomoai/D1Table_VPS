# MoWen

[English](README_en.md) · [中文](README.md)

MoWen is tables and notes shared by you and your agents. After a conversation, save the outcome in natural language. Later, query and edit the same data the same way.

Install the MoWen Skill in WorkBuddy, Codex, or similar tools, and the agent can write conclusions into MoWen tables and notes. Or stay in the web app: the built-in assistant manages the same workspace in natural language.

Site: https://mowen.lemoai.cn  
Repo: https://github.com/laomoai/mowen

## Features

- **Built for agent work**: tables hold structured results; notes hold long-form and process; folders keep them together.
- **External agents**: install the official Skill in WorkBuddy, Codex, etc. Skill: [`/agent/mowen/SKILL.md`](https://mowen.lemoai.cn/agent/mowen/SKILL.md)
- **In-app assistant**: create tables, add fields, write records, edit notes, and move items — in natural language.
- **Tables**: many field types; grid / gallery / kanban; row detail; trash.
- **Notes**: Markdown, images, table embeds; nested sub-pages.
- **Folder-scoped keys**: an API key (`mw_`) only sees tables and notes in the folders you grant; read-only keys cannot write.

## Requirements

- Node.js 18+
- SQLite (WAL)
- Reverse proxy in production (Nginx). The app listens on `127.0.0.1` only.

The first registered user on an empty database is admin. Invites set a password by email (Resend).

## Run locally

```bash
cp .env.example .env   # set SESSION_SECRET
npm install
cd web && npm install && cd ..
npm run build:web
npm start
```

Open http://127.0.0.1:18085.

For development:

```bash
npm run dev          # backend hot reload
npm run dev:web      # frontend Vite
```

Migrations: `npm run db:migrate` (also run on startup).

See `.env.example` for `SESSION_SECRET`, `PUBLIC_ORIGIN`, `RESEND_API_KEY`, `DEEPSEEK_API_KEY`, etc. Never commit secrets.

## Production

`deploy/vps-deploy.json` describes the VPS layout (no secrets). The app listens on `127.0.0.1:18085`; Nginx terminates TLS. Back up SQLite with `sqlite3 … '.backup …'`.

Health: `/api/health`

## API

- `/api/docs` · `/api/openapi.json`
- Header: `X-API-Key` (not Bearer)

```bash
export MOWEN_URL=https://mowen.lemoai.cn
export MOWEN_KEY=mw_your_key
python3 scripts/mowen.py workspace
```

Images are stored on disk and served at `/api/files/…` (session or short-lived signature). Unused files can be swept in **Settings → Attachments**.

## License

MIT
