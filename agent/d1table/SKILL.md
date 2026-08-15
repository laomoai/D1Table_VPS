---
name: d1table
description: >
  通过 D1Table HTTP API 管理表格、记录、笔记和工作区。
  在用户要查表、写记录、读写笔记、归档知识库、或提到 D1Table / table.lemoai.cn 时使用。
  斜杠命令：/d1table
---

# D1Table

用环境变量调用官方 API，不要手写 curl，也不要把密钥写进仓库。

```
D1TABLE_URL   默认 https://table.lemoai.cn
D1TABLE_KEY   设置里创建的 API Key（X-API-Key）
```

脚本与本 Skill 同目录：`scripts/d1table.py`（仅 Python 3 标准库）。

```bash
python3 scripts/d1table.py tables
python3 scripts/d1table.py schema --table tbl_xxx
python3 scripts/d1table.py query --table tbl_xxx --limit 20
python3 scripts/d1table.py get --table tbl_xxx --id 1
python3 scripts/d1table.py insert --table tbl_xxx --data '{"col_xxx":"值"}'
python3 scripts/d1table.py update --table tbl_xxx --id 1 --data '{"col_xxx":"新值"}'
python3 scripts/d1table.py delete --table tbl_xxx --id 1

python3 scripts/d1table.py notes
python3 scripts/d1table.py note --id n_xxx
python3 scripts/d1table.py create-note --title "标题" --content "正文"
python3 scripts/d1table.py update-note --id n_xxx --content "新正文"
python3 scripts/d1table.py archive-note --id n_xxx

python3 scripts/d1table.py workspace
python3 scripts/d1table.py groups
```

## 约定

- 表格对外用 `name`（如 `tbl_abc123`），界面显示名是 `title`。写记录用字段的 `column_name`，不要用中文标题。
- 文件夹和仪表盘「组」是同一套：`scope=groups` 的 Key 只能访问这些文件夹里的表和笔记。
- 笔记树用 `parent_id` 还原层级。根笔记不要直接归档。
- 鉴权头是 `X-API-Key`。只读 Key 不能写。
- 完整接口：`$D1TABLE_URL/api/docs` 与 `$D1TABLE_URL/api/openapi.json`。

## 没有 Key 时

让用户到 https://table.lemoai.cn/settings 创建一把文件夹范围的 Key，再设置 `D1TABLE_KEY`。不要编造密钥。
