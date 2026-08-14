# D1Table_VPS

独立于 Cloudflare 版 `laomoai/D1Table`。推送到 `laomoai/D1Table_VPS`。密钥不进 Git。

## 工作区树（B1）

- 侧栏只有一棵工作区树：folder / table / note。
- 文件夹不能打开内容页，只展开/收起。
- 文件夹的子节点只能是 folder、table、note。表和笔记是叶子，不能当父节点。
- `_notes.parent_id` 只表示笔记内部子页面，不要用来挂表或当侧栏父级。
- 工作区位置只写 `_workspace_nodes`。建文件夹/移动表必须同时维护对应 `_groups` / `_group_tables`（文件夹 1:1 对应 group）。
- 笔记进文件夹只改工作区节点，不写 `_group_tables`。
- 禁止删除非空文件夹；禁止删文件夹时级联 DROP 表。
- API Key：`scope=groups` 按文件夹授权，包含该文件夹及子文件夹里的表和笔记。`notes_scope` 只在 `scope=all` 时使用。
- 不要合并 TableView 与 NotesPage。

## 运行时

- 后端 Node + Hono + SQLite；不要加回 wrangler/D1/R2 作为运行时。
- 写库走现有 D1 兼容适配器；迁移放 `migrations/00*.sql`。
