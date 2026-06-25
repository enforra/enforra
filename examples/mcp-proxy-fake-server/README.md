# MCP Proxy Fake Server

Fake stdio MCP upstream server used by the Enforra MCP proxy demo.

It exposes:

- `files.read`
- `terminal.run`
- `secrets.read`

The terminal tool returns fake output only and never runs a command. The secret tool returns fake text only if it is actually called, which helps demonstrate that blocked proxy calls do not reach upstream handlers.
