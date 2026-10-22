# AI Agent (chat widget)

The robot chat is now an **agent**: it can read the ledger and *prepare* lifecycle
events, but it can never post by itself.

## Flow
1. User: "Retire asset 009, disposal 2025-06-30, cost disposed 30000, proceeds 26250"
2. Agent reads the asset (`get_asset`), fills what the system already knows, asks for anything missing.
3. Agent calls `propose_lifecycle_event` -> server runs the real calculator and returns a **preview card**.
4. User clicks **Confirm & Post** -> `POST /api/chat/confirm` -> same pipeline as `/api/lifecycle/post`
   (`postLifecycleEvent` in `routes/lifecycle.ts`). **Cancel** discards it.

## Safety
- The model has no "post" tool. Only the Confirm click posts.
- A proposal is single-use and expires after 15 minutes.
- Calculator "Needs Attention" results are refused, never offered for posting.
- View-only users do not get the propose tool, and `/confirm` rejects them.
- Ledger rows are tagged `posted_by = "<name> (via AI agent)"`.
- Known gap: the app has no server-side session, so `canEdit` / `postedBy` come from the client,
  as in the existing `/lifecycle/post`. When auth tokens are added, read them from the token in `chat.ts`.

## Setup
`server/.env`: `ANTHROPIC_API_KEY=...` (and optionally `CHAT_MODEL=claude-sonnet-5-5`).
Without a key the basic built-in answerer is used (read-only).

## Files changed / added
- `server/src/services/agent-actions.ts` (new): field help, propose / confirm / cancel
- `server/src/routes/chat.ts`: new tools, agent prompt, `/confirm`, `/cancel`
- `server/src/routes/lifecycle.ts`: shared exported `postLifecycleEvent` (used by `/post` and the agent)
- `client/src/components/chat/ChatWidget.jsx` + `chat.css`: preview card with Confirm / Cancel

---

# AI Agent (second icon, beside the robot)

The robot assistant above is unchanged. Next to it there is now a purple sparkle icon: the **AI Agent**.

- Route: `POST /api/agent` (`server/src/routes/agent.ts`). Always LLM (Claude); no offline fallback.
- Reads the whole site: assets, summary, recent activity, books, asset classes, forecast (plus the assistant's tools).
- Goes online: Anthropic's server-side `web_search` tool (max 5 searches per answer). Answers say it came from the web and the panel lists the source links.
- Can still only PREPARE lifecycle events; the Confirm click (`/api/chat/confirm`) is the only way to post.
- Needs `ANTHROPIC_API_KEY` in `server/.env` (and web search enabled for your Anthropic organization in the Console).
- Client: `ChatWidget.jsx` now takes `variant` ('assistant' | 'agent'); `ChatLaunchers` renders both and keeps only one panel open.
