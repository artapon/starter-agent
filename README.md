# Starter Agent

A local multi-agent AI system powered by LM Studio. A planner, researcher, worker, and reviewer collaborate in an automated LangGraph workflow, with a Vue 3 dashboard to monitor and interact with them in real time.

---

## Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js v22.5+ (requires `--experimental-sqlite`) |
| **Backend** | Express.js (ESM modules) |
| **Frontend** | Vue 3 + Vuetify 3 + Vite |
| **Agents / Workflow** | LangChain.js + LangGraph.js |
| **LLM Provider** | LM Studio (local, OpenAI-compatible API) |
| **Database** | `node:sqlite` (built-in — no native addons) |
| **Realtime** | Socket.IO |
| **Logging** | Winston (streams live to frontend) |
| **Web Browsing** | Puppeteer via MCP (`@modelcontextprotocol/server-puppeteer`) |
| **Vector Memory** | HNSWLib (local, no external service) |

---

## Architecture

```
starter-agent/
├── backend/
│   ├── core/                  # Shared infrastructure
│   │   ├── adapters/llm/      # LM Studio adapter (ChatOpenAI wrapper)
│   │   ├── database/          # SQLite db, table helpers, migrator
│   │   ├── tools/             # Tool definitions, implementations, registry
│   │   ├── socket/            # Socket.IO manager + events
│   │   ├── logger/            # Winston logger + socket transport
│   │   ├── memory/            # Memory store (STM / LTM / working)
│   │   ├── reports/           # HTML report generator
│   │   └── skills/            # Skill profile system
│   └── modules/               # HMVC feature modules
│       ├── workflow/          # LangGraph StateGraph + runner
│       ├── planner/           # Planner agent
│       ├── researcher/        # Researcher agent (+ MCP browser)
│       ├── worker/            # Worker / developer agent
│       ├── reviewer/          # Reviewer agent
│       ├── chat/              # Direct chat API
│       ├── memory/            # Memory API routes
│       ├── settings/          # Global + per-agent settings
│       └── dashboard/         # Stats aggregation
├── frontend/
│   └── src/
│       ├── views/             # Page components
│       │   ├── DashboardView  # Live stats + agent status
│       │   ├── WorkflowView   # Run + monitor pipelines
│       │   ├── ChatView       # Direct agent chat
│       │   ├── MemoryView     # STM / LTM / working memory
│       │   ├── DebugView      # Researcher debug + walkthrough
│       │   ├── LogsView       # Live log stream
│       │   └── SettingsView   # Global + per-agent config
│       ├── components/        # Shared UI components
│       └── plugins/           # Router, Vuetify, Socket.IO
├── workspace/                 # Agent file sandbox (read/write)
├── reports/                   # Generated workflow HTML reports
├── install.bat                # One-click dependency installer (Windows)
└── start.bat                  # One-click launcher (Windows)
```

### Workflow Pipeline

```
User Goal
   │
   ▼
[Planner]  → generates step-by-step plan
   │
   ▼
[Researcher] → web research per step (optional MCP browsing)
   │
   ▼
[Worker]   → executes each subtask (file tools, code, etc.)
   │
   ▼
[Reviewer] → quality checks output, requests revisions if needed
   │
   ▼
[Loop?]    → if enabled, iterates up to N times
   │
   ▼
Final Answer + HTML Report
```

---

## Prerequisites

- **Node.js v22.5 or later** — [https://nodejs.org](https://nodejs.org)
  - v22.5+ is required for the built-in `node:sqlite` module
  - Node v24 is fully supported
- **LM Studio** — [https://lmstudio.ai](https://lmstudio.ai)
  - Start the local server on `http://localhost:1234`
  - Load at least one model (e.g. `qwen2.5-7b-instruct`)
- **npm** — included with Node.js

> **Windows users:** `install.bat` and `start.bat` handle everything below automatically.

---

## Installation

### Windows (recommended)

```bat
install.bat
```

That's it. The script:
1. Checks Node.js is installed
2. Installs root, backend, and frontend dependencies
3. Creates `backend/.env` from `.env.example` if missing
4. Creates `backend/workspace/` directory

### Manual (cross-platform)

```bash
# 1. Install all dependencies (npm workspaces)
npm install

# 2. Copy environment config
cp .env.example backend/.env

# 3. Create workspace sandbox
mkdir backend/workspace
```

---

## Configuration

Edit `backend/.env`:

```env
# LM Studio server URL
LM_STUDIO_BASE_URL=http://localhost:1234/v1
LM_STUDIO_API_KEY=lm-studio

# Models loaded in LM Studio (match the model identifiers exactly)
PLANNER_MODEL=qwen2.5-7b-instruct
DEVELOPER_MODEL=qwen2.5-coder-7b-instruct
REVIEWER_MODEL=qwen2.5-7b-instruct

# Server
PORT=3000
NODE_ENV=development
```

Per-agent model overrides and tool configuration can also be changed at runtime from **Settings** in the UI.

---

## Running

### Windows

```bat
start.bat
```

Opens the backend and frontend in separate terminal windows, waits for the backend health check, then opens the browser automatically.

### Manual

```bash
# Dev mode (hot reload on both sides)
npm run dev

# Or run separately:
cd backend  && node --experimental-sqlite server.js
cd frontend && npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3000 |
| Health check | http://localhost:3000/api/health |

---

## Features

| Feature | Description |
|---|---|
| **Workflow** | Run multi-agent pipelines with a single goal prompt |
| **Chat** | Talk directly to any agent |
| **Memory** | View / manage Short-Term, Long-Term, and Working memory |
| **Settings** | Configure LLM models, tools, MCP, and workflow loop per agent |
| **Logs** | Live log stream from the backend |
| **Debug** | Interactive Researcher Agent walkthrough and connection tester |
| **Reports** | Auto-generated HTML walkthrough after each workflow run |
| **MCP Browser** | Puppeteer-based web browsing for the Researcher agent (toggle in Settings) |

---

## Key API Endpoints

```
POST   /api/workflow/start          Start a workflow run
POST   /api/workflow/stop/:runId    Stop a running workflow
GET    /api/workflow/runs           List workflow run history

POST   /api/chat                    Send a message to an agent

GET    /api/memory/stm/:agentId     Short-term memory
GET    /api/memory/ltm/:agentId/query  Query long-term memory
POST   /api/memory/ltm/:agentId/store  Store to long-term memory

GET    /api/settings/:agentId/tools     Get agent tool config
PUT    /api/settings/:agentId/tools     Update agent tools
GET    /api/settings/global             Get global settings
PUT    /api/settings/global             Update global settings

GET    /api/reports/sessions        List sessions with reports
GET    /api/agents/researcher/status  Researcher agent status
```

---

## Troubleshooting

**`Error: Cannot find module 'node:sqlite'`**
→ Upgrade Node.js to v22.5 or later.

**`better-sqlite3` build error**
→ This project does not use `better-sqlite3`. If it appears in an error, an old `node_modules` may be cached. Delete `node_modules` and reinstall.

**LLM returns empty or errors**
→ Make sure LM Studio is running with the server enabled on port 1234, and the model name in `.env` matches the identifier shown in LM Studio exactly.

**MCP browser not working**
→ Enable MCP in **Settings → Researcher**, then restart the backend. Puppeteer downloads Chromium on first use — ensure internet access during that step.
