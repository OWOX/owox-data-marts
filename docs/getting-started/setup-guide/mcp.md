# MCP Server

OWOX Data Marts exposes a Model Context Protocol (MCP) server that lets AI assistants and MCP-compatible clients connect to your project data using standard OAuth authorization.

Use the MCP server when you want an AI assistant — such as Claude or ChatGPT — to explore the [data marts](../core-concepts.md) in your OWOX project in plain language, without leaving the assistant. The assistant can tell you which project you are connected to and list the data marts available to you. See [Available tools](#available-tools) for exactly what it can and cannot do.

## Prerequisites

- An active OWOX Data Marts project with at least one data mart. New to Data Marts? See how to create a [connector-based](./connector-data-mart.md) or [SQL-based](./sql-data-mart.md) Data Mart.
- A deployment with the MCP server available. It works on OWOX Cloud, and on self-managed deployments once the MCP environment variables are set (see [Step 1](#step-1-get-the-mcp-server-url)). No special edition or license is required.
- One of the supported clients: Claude Desktop, Claude web (claude.ai), or ChatGPT. Any other client that supports the MCP Streamable HTTP transport with OAuth 2.0 will also work.
- A client plan that allows custom MCP connectors. Connecting your own server may require a paid plan in Claude or ChatGPT; check your client's current plan requirements.

## Step 1: Get the MCP server URL

**OWOX Cloud:**

```text
https://mcp.owox.com/mcp
```

**Self-managed deployments:** the MCP URL is the value of `MCP_PUBLIC_BASE_URL` with `/mcp` appended. If you set up the instance yourself, add `MCP_PUBLIC_BASE_URL` to your `.env` file if it is not already there — use the same base URL you use to open the app (for example, `http://localhost:3000` for a local deployment). The MCP URL is then `http://localhost:3000/mcp`.

> Self-managed deployments must also set `OWOX_AUTH_PUBLIC_BASE_URL` (the public URL of your OWOX authorization server). The browser sign-in step in [Step 3](#step-3-authorize-access) fails if this value is missing or wrong.

## Step 2: Connect your AI assistant

Set up whichever assistant you use — you only need one. Whichever you choose, the client discovers the OAuth endpoints and registers itself automatically: there is no client ID, secret, or token to copy.

### Claude Desktop

Newer versions of Claude Desktop add remote MCP servers through the in-app **Connectors** settings:

1. Open Claude Desktop and go to **Settings → Connectors**.
2. Click **Add custom connector**.
3. Enter the MCP server URL:

   ```text
   https://mcp.owox.com/mcp
   ```

4. Claude opens a browser window to complete authorization. Follow the steps in [Step 3](#step-3-authorize-access).

If your version does not show a **Connectors** screen, add the server to the configuration file instead, then restart Claude Desktop:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "owox": {
      "url": "https://mcp.owox.com/mcp"
    }
  }
}
```

Claude Desktop uses a loopback redirect URI during the OAuth flow, so self-managed deployments need no extra configuration for it.

### Claude web (claude.ai)

1. Open [claude.ai](https://claude.ai) and go to **Settings → Connectors**.
2. Click **Add custom integration**.
3. Enter the MCP server URL:

   ```text
   https://mcp.owox.com/mcp
   ```

4. Claude will open an authorization flow in the same browser. Follow the steps in [Step 3](#step-3-authorize-access).

![Claude web Connectors settings with the Add custom integration dialog and the OWOX MCP server URL entered](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/fbdcb18c-4d48-4142-8ee0-a913734a4100/public)

![The OWOX integration connected and listed in Claude web Connectors settings](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/4521c763-a151-453c-18a7-006ff6536200/public)

> **Self-managed deployments:** Claude web uses an HTTPS redirect URI. Add `https://claude.ai` to `MCP_DYNAMIC_CLIENT_ALLOWED_REDIRECT_ORIGINS` before users connect (see [Environment variables](../deployment-guide/environment-variables.md)).

### ChatGPT

1. Open ChatGPT and go to **Settings → Apps**.
2. Open **Advanced settings** and turn on **Developer mode**. A **Create app** button appears.
3. Click **Create app**.
4. Enter the MCP server URL:

   ```text
   https://mcp.owox.com/mcp
   ```

5. ChatGPT opens an authorization window. Follow the steps in [Step 3](#step-3-authorize-access).

![Enabling Developer mode in ChatGPT Apps advanced settings](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/08e99f82-13b4-4e3a-0d01-819105aba800/public)

![Creating an app with the OWOX MCP server URL in ChatGPT](https://imagedelivery.net/zKr-4bdC5CBGL2DuuEmvYw/323a0e41-8043-435c-b6c2-d84dde4d1b00/public)

> **Self-managed deployments:** ChatGPT uses an HTTPS callback URI during the OAuth flow. Add ChatGPT's callback origin to `MCP_DYNAMIC_CLIENT_ALLOWED_REDIRECT_ORIGINS` before users connect. If the origin is missing, registration fails with the error `redirect_uri origin is not allowlisted. Add to MCP_DYNAMIC_CLIENT_ALLOWED_REDIRECT_ORIGINS: <origin>` — use the origin printed there as the value.

## Step 3: Authorize access

When the MCP client connects for the first time, it registers itself with the OWOX authorization server and opens a browser window to complete the OAuth 2.0 authorization flow (with PKCE). You only complete two interactive steps:

1. **Sign in** to your OWOX account if you do not already have an active session.
2. **Select a project** — if you belong to more than one project, a selection screen appears. Choose the project you want this MCP connection to use and click **Next**. If you belong to a single project, this step is skipped automatically.

There is no separate permissions-consent screen. Once you sign in and select a project, the client receives an access token and uses it automatically for all subsequent requests. The token is bound to the project you selected and to the requested scope.

Access tokens are short-lived, and the client refreshes them automatically in the background — you stay connected without signing in again. You only need to reconnect manually if the refresh fails (for example, after your OWOX session is revoked) or when you want to switch projects.

## Step 4: Verify the connection

Confirm everything works before relying on it. In your assistant, send:

> Which OWOX project am I connected to?

The assistant calls the `get_project_context` tool and replies with your project title, your role, and the project status. If you see your project name, the connection is working. If instead you get an authorization or "no tools available" error, see [Troubleshooting](#troubleshooting).

## Switch projects or disconnect

Project selection is fixed when you authorize, so switching projects means reconnecting. Where you manage the connection depends on the client:

- **Claude Desktop / Claude web:** **Settings → Connectors**, then open the OWOX connector to disconnect or reconnect it.
- **ChatGPT:** **Settings → Apps**, then open the OWOX app to disconnect or reconnect it.

To switch projects, disconnect, then reconnect and sign in again, choosing the project you want during authorization.

## Available tools

Once connected, the MCP server exposes two read-only tools. Both require the `mcp:read` scope, which the client requests during authorization.

### `get_project_context`

Returns information about the OWOX project that this MCP connection is authorized for.

**Returns:**

| Field | Description |
| --- | --- |
| `current_project.id` | Project identifier |
| `current_project.title` | Project display name |
| `current_project.status` | Project status |
| `current_project.roles` | Your roles in this project |
| `current_project.created_at` | Project creation date |
| `project_switching` | Instructions for switching to a different project |

Use this tool when you need to confirm which project is active, or when the assistant asks which project is selected.

### `list_data_marts`

Lists all data marts visible to you in the current project.

**Returns** an array of data mart objects:

| Field | Description |
| --- | --- |
| `id` | Data mart identifier |
| `title` | Data mart name |
| `description` | Data mart description |
| `status` | Current status |
| `updated_at` | Last update timestamp |

Use this tool to discover available data marts before running queries or building reports.

The list reflects your access: it includes only the data marts your [project role](../../project/roles-and-permissions.md) permits you to see. If a data mart you expect is missing, check your role in that project.

## How to use it: example prompts

Once the OWOX server is connected, just ask your assistant in plain language. You do not need to name the tools — the assistant calls them for you. Try prompts like:

- "Which OWOX project am I connected to, and what is my role in it?"
- "List all the data marts in my project."
- "Which of my data marts were updated most recently?"
- "Do I have any data marts about Facebook Ads? Show their descriptions."
- "Give me a one-line summary of each data mart and what it is for."

> **What these tools can and cannot do:** They let the assistant discover your project and your data marts — titles, descriptions, status, roles, and when each was last updated. They do **not** run queries against the data inside a data mart or return its rows. Use them to find and understand what is available, then open the data mart in OWOX Data Marts to work with the data itself.

## Troubleshooting

### Registration is rejected

| Message | Cause | Fix |
| --- | --- | --- |
| `redirect_uri origin is not allowlisted. Add to MCP_DYNAMIC_CLIENT_ALLOWED_REDIRECT_ORIGINS: <origin>` | The client uses an `https` redirect URI whose origin is not allowlisted (self-managed). | Add the exact origin to `MCP_DYNAMIC_CLIENT_ALLOWED_REDIRECT_ORIGINS` and restart the server. |
| `redirect_uri must be loopback http or allowlisted https origin` | The client uses a non-loopback `http` redirect URI. | Use a loopback URI (`http://127.0.0.1`, `http://localhost`, `[::1]`) or a secure `https` origin that is allowlisted. |
| `Dynamic Client Registration is disabled` | `MCP_DYNAMIC_CLIENT_REGISTRATION_ENABLED` is set to `false`. | Enable Dynamic Client Registration on the deployment, or register the client through your platform administrator. |

### Requests return 401 Unauthorized

The MCP server rejects a request with `401` and a `WWW-Authenticate` challenge in these cases:

| Message | Cause | Fix |
| --- | --- | --- |
| `Missing MCP bearer token` | No `Authorization: Bearer` header was sent. | Re-run authorization so the client obtains a token. A `GET /mcp` without a token (a client probe) is expected and harmless. |
| `Invalid MCP bearer token` | The token is expired, revoked, or invalid. | Disconnect and reconnect the MCP server to obtain a fresh token. |
| `Invalid MCP resource` | The token was issued for a different resource than this server. | Confirm the client points to the correct `/mcp` URL, then reconnect. |
| `Missing MCP project context` / `Missing MCP project roles` | The token has no project selected or no active role in it. | Reconnect and make sure you select a project where you are an active member. |

### The wrong project is connected

Project selection is fixed at authorization time. See [Switch projects or disconnect](#switch-projects-or-disconnect) for how to reconnect and choose a different project.

## Related docs

- [Roles and permissions](../../project/roles-and-permissions.md)
- [API Keys](../../api/api-keys.md)
- [Environment variables](../deployment-guide/environment-variables.md)
