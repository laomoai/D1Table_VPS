# D1Table Agent 接入

站点：https://mowen.lemoai.cn  
鉴权：设置页创建 API Key，请求头 `X-API-Key`。  
不要把密钥提交到 Git。

## Skill（Claude / Codex / Grok）

```bash
mkdir -p ~/.grok/skills/d1table/scripts
curl -fsSL https://mowen.lemoai.cn/agent/d1table/SKILL.md -o ~/.grok/skills/d1table/SKILL.md
curl -fsSL https://mowen.lemoai.cn/agent/d1table/scripts/d1table.py -o ~/.grok/skills/d1table/scripts/d1table.py
chmod +x ~/.grok/skills/d1table/scripts/d1table.py
export D1TABLE_URL=https://mowen.lemoai.cn
export D1TABLE_KEY='你的密钥'
```

Claude Code 可放到 `~/.claude/skills/d1table/`，结构相同。

## MCP（Cursor / Claude Desktop）

下载 `mcp/server.mjs` 后：

```json
{
  "mcpServers": {
    "d1table": {
      "command": "node",
      "args": ["/绝对路径/server.mjs"],
      "env": {
        "D1TABLE_URL": "https://mowen.lemoai.cn",
        "D1TABLE_KEY": "你的密钥"
      }
    }
  }
}
```

https://mowen.lemoai.cn/agent/d1table/mcp/server.mjs

## 完整 HTTP 文档

https://mowen.lemoai.cn/api/docs
