---
name: mowen
description: >
  通过墨问（MoWen）HTTP API 管理表格、记录、笔记和工作区。
  在用户要查表、写记录、读写笔记、或提到 墨问 / MoWen / mowen.lemoai.cn 时使用。
  斜杠命令：/mowen
---

# 墨问 MoWen

用环境变量调用官方 API，不要手写 curl，也不要把密钥写进仓库。

```
MOWEN_URL   默认 https://mowen.lemoai.cn
MOWEN_KEY   设置里创建的 API Key（请求头 X-API-Key）
```

仍识别旧名 `D1TABLE_URL` / `D1TABLE_KEY`，优先用 `MOWEN_*`。

脚本与本 Skill 同目录：`scripts/mowen.py`（仅 Python 3 标准库）。

```bash
python3 scripts/mowen.py tables
python3 scripts/mowen.py schema --table tbl_xxx
python3 scripts/mowen.py query --table tbl_xxx --limit 20
python3 scripts/mowen.py get --table tbl_xxx --id 1
python3 scripts/mowen.py insert --table tbl_xxx --data '{"col_xxx":"值"}'
python3 scripts/mowen.py update --table tbl_xxx --id 1 --data '{"col_xxx":"新值"}'
python3 scripts/mowen.py delete --table tbl_xxx --id 1

python3 scripts/mowen.py notes
python3 scripts/mowen.py note --id n_xxx
python3 scripts/mowen.py create-note --title "标题" --content "正文"
python3 scripts/mowen.py update-note --id n_xxx --content "新正文"
python3 scripts/mowen.py archive-note --id n_xxx

python3 scripts/mowen.py workspace
python3 scripts/mowen.py groups
```

## 约定

- 表格对外用 `name`（如 `tbl_abc123`），界面显示名是 `title`。写记录用字段的 `column_name`。
- 文件夹和仪表盘「组」是同一套：`scope=groups` 的 Key 只能访问这些文件夹里的表和笔记。
- 笔记树用 `parent_id` 还原层级。
- 鉴权头是 `X-API-Key`。只读 Key 不能写。
- 完整接口：`$MOWEN_URL/api/docs` 与 `$MOWEN_URL/api/openapi.json`。

## 没有 Key 时

让用户到 https://mowen.lemoai.cn/settings 创建一把文件夹范围的 Key，再设置 `MOWEN_KEY`。不要编造密钥。
