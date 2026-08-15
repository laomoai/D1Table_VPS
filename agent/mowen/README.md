# 墨问 Agent 接入

站点：https://mowen.lemoai.cn  
鉴权：设置页创建 API Key，请求头 `X-API-Key`。不要把密钥提交到 Git。

## Skill（Grok / Claude / Codex）

把说明和脚本装到本机 skills 目录。环境变量是 `MOWEN_URL` / `MOWEN_KEY`。

## MCP（Cursor / Claude Desktop）

MCP 在本地跑一个 Node 进程，通过 stdio 和编辑器说话，再由进程去调墨问 API。  
所以需要下载 `mcp/server.mjs` 到本机，在客户端配置里写它的**本地绝对路径**。浏览器里打开这个 `.mjs` 没有用。

配置示例见设置页。
