# MoWen

Tables and notes in folders, plus an HTTP API and a built-in assistant. Meant for self-hosting.

Site: https://mowen.lemoai.cn  
Repo: https://github.com/laomoai/mowen

This tree is **Node + SQLite + local files**, not the Cloudflare Workers/D1 project [D1Table](https://github.com/laomoai/D1Table). They do not share a database.

## Features

- Workspace tree: folders, tables, notes
- Tables: many field types, grid / gallery / kanban, row detail, trash
- Notes: Markdown, images, table embeds
- Folder-scoped API keys (`mw_`)
- Skill at `/agent/mowen/SKILL.md` — drop the folder into your agent’s own skills directory
- In-app assistant (DeepSeek V4 Flash): records, notes, propose table/fields, move nodes; one cloud-backed thread per user

## Run locally

```bash
cp .env.example .env   # set SESSION_SECRET
npm install
cd web && npm install && cd ..
npm run build:web
npm start
```

Open http://127.0.0.1:18085. The first registered user on an empty database is admin. Login is email + password (Resend for invite / reset).

See `.env.example` for `SESSION_SECRET`, `PUBLIC_ORIGIN`, `RESEND_API_KEY`, `DEEPSEEK_API_KEY`, etc. Never commit secrets.

## Production

`deploy/vps-deploy.json` describes the VPS layout (no secrets). The app listens on `127.0.0.1:18085`; Nginx terminates TLS. Data lives under `/var/lib/d1table`. Back up SQLite with `sqlite3 … '.backup …'`.

Health: `/api/health`

## API

- `/api/docs` · `/api/openapi.json`
- Header: `X-API-Key` (not Bearer)

```bash
export MOWEN_URL=https://mowen.lemoai.cn
export MOWEN_KEY=mw_your_key
python3 scripts/mowen.py workspace
```

Images are stored on disk and served at `/api/files/…` (session or short-lived signature). Unused files can be swept in **Settings → 附件**.

## License

MIT
