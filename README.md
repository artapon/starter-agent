# Starter Agent

A local multi-agent AI system powered by LM Studio. An analyzer, worker, and reviewer collaborate in an automated LangGraph workflow, with a Vue 3 dashboard to monitor and interact with them in real time.

---

## Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js v18+ (v22+ recommended) |
| **Backend** | Express.js (ESM modules) |
| **Frontend** | Vue 3 + Vuetify 3 + Vite |
| **Agents / Workflow** | LangChain.js + LangGraph.js |
| **LLM Provider** | LM Studio (local, OpenAI-compatible API) |
| **Database** | Custom JSON file store (no native addons required) |
| **Realtime** | Socket.IO |
| **Logging** | Winston (streams live to frontend) |
| **Web Search** | Native fetch — DuckDuckGo, GitHub API, URL fetcher |
| **Vector Memory** | HNSWLib (local, no external service) |

---

## Architecture

```
starter-agent/
├── backend/
│   ├── core/                  # Shared infrastructure
│   │   ├── adapters/llm/      # LM Studio adapter (ChatOpenAI wrapper)
│   │   ├── database/          # JSON file DB, table helpers, migrator
│   │   ├── tools/             # Tool definitions, implementations, registry
│   │   ├── socket/            # Socket.IO manager + events
│   │   ├── logger/            # Winston logger + socket transport
│   │   ├── memory/            # Memory store (STM / LTM / working)
│   │   ├── browser/           # Web search tools (DuckDuckGo, GitHub, fetch)
│   │   ├── reports/           # HTML report generator
│   │   └── skills/            # Skill profile system
│   └── modules/               # HMVC feature modules
│       ├── workflow/          # LangGraph StateGraph + runner
│       ├── planner/           # Planner agent
│       ├── researcher/        # Researcher agent (web search)
│       ├── worker/            # Worker agent
│       ├── reviewer/          # Reviewer agent
│       ├── chat/              # Direct chat API
│       ├── memory/            # Memory API routes
│       ├── settings/          # Global + per-agent settings
│       └── dashboard/         # Stats aggregation
├── frontend/
│   └── src/
│       ├── views/             # Page components
│       │   ├── DashboardView  # Live stats, graph, agent status
│       │   ├── WorkflowView   # Run + monitor pipelines
│       │   ├── ChatView       # Direct agent chat
│       │   ├── MemoryView     # STM / LTM / working memory
│       │   ├── WalkthroughView # Embedded workflow report viewer
│       │   ├── DebugView      # Researcher debug tool
│       │   ├── LogsView       # Live log stream
│       │   └── SettingsView   # Global + per-agent config
│       ├── components/        # Shared UI components
│       └── plugins/           # Router, Vuetify, Socket.IO
├── workspace/                 # Agent file sandbox (read/write)
├── reports/                   # Generated workflow HTML reports
├── skills/                    # Skill profiles (default, software_house)
├── install.bat                # One-click dependency installer (Windows)
└── start.bat                  # One-click launcher (Windows)
```

### Workflow Pipeline

3-node LangGraph pipeline — each node is a merged unit:

```
User Goal
   │
   ▼
[Analyze]   → research (web search) + generate step-by-step plan
   │
   ▼
[Worker]    → executes each plan step (file tools, code, scaffold, etc.)
   │
   ▼
[Reviewer]  → quality checks output; on fail: retry or improvement loop
             on pass: assembles final answer + HTML report
   │
   ▼ (loop up to N times if score < 10/10)
Final Answer + HTML Report
```

---

## Prerequisites

- **Node.js v18 or later** — [https://nodejs.org](https://nodejs.org)
  - v22+ recommended for best ESM and performance support
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

The script:
1. Checks Node.js is installed (v18+)
2. Installs root, backend, and frontend dependencies
3. Creates `backend/.env` from `.env.example` if missing
4. Creates `backend/workspace/` and `reports/` directories

### Manual (cross-platform)

```bash
# 1. Install all dependencies (npm workspaces)
npm install

# 2. Copy environment config
cp .env.example backend/.env

# 3. Create required directories
mkdir backend/workspace
mkdir reports
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
WORKER_MODEL=qwen2.5-coder-7b-instruct
REVIEWER_MODEL=qwen2.5-7b-instruct
RESEARCHER_MODEL=qwen2.5-7b-instruct

# Server
PORT=3000
NODE_ENV=development
```

Per-agent model overrides, tool configuration, and workflow loop settings can also be changed at runtime from **Settings** in the UI.

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
cd backend  && node server.js
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
| **Dashboard** | Live 2-column layout: workflow graph, token usage, agent status, recent runs, live logs |
| **Workflow** | Run multi-agent pipelines with a single goal prompt; stop anytime |
| **Chat** | Talk directly to any agent with streaming responses |
| **Memory** | View / manage Short-Term, Long-Term, and Working memory per agent; save STM → LTM |
| **Settings** | Sidebar-nav layout: configure LLM model, tools, and workflow loop per agent |
| **Logs** | Live log stream from the backend with level filtering |
| **Debug** | Interactive Researcher Agent walkthrough and backend connection tester |
| **Reports** | Auto-generated HTML walkthrough after each workflow run, viewable in-app |
| **Web Search** | Researcher uses native fetch tools: DuckDuckGo search, GitHub API, URL browse |
| **Skill Profiles** | Switchable system prompt bundles per agent (default, software_house) |

---

## Key API Endpoints

```
POST   /api/workflow/start              Start a workflow run
POST   /api/workflow/stop/:runId        Stop a running workflow
GET    /api/workflow/runs               List workflow run history

POST   /api/chat/message                Send a message to an agent
POST   /api/chat/stop/:sessionId        Stop a running chat session
GET    /api/chat/history/:sessionId     Get chat history

GET    /api/memory/stm/:agentId         Short-term memory snapshots
GET    /api/memory/ltm/:agentId/query   Query long-term memory
POST   /api/memory/ltm/:agentId/store   Store to long-term memory
GET    /api/memory/wm/:agentId          Working memory context

GET    /api/settings/:agentId/tools     Get agent tool config
PUT    /api/settings/:agentId/tools     Update agent tools
GET    /api/settings/global             Get global settings
PUT    /api/settings/global             Update global settings

GET    /api/reports/sessions            List sessions with reports
GET    /api/reports/:sessionId/content  Get parsed report HTML + styles
GET    /api/agents/researcher/status    Researcher agent status
```

---

## Troubleshooting

**LLM returns empty or errors**
→ Make sure LM Studio is running with the local server enabled on port 1234, and the model name in `.env` exactly matches the identifier shown in LM Studio.

**Agent always responds "idle" / no streaming**
→ Check the backend terminal for errors. Verify the LM Studio server URL is reachable at `http://localhost:1234/v1`.

**Web search returns no results**
→ The researcher uses DuckDuckGo HTML scraping and the GitHub public API — no API keys required. Check that the backend has outbound internet access.

**Reports not appearing in Workflow / Dashboard**
→ Reports are generated after a run completes. Ensure the `reports/` directory exists at the project root (created automatically by `install.bat` or `start.bat`).

**`node_modules` errors after updating**
→ Delete `node_modules` in the root, `backend/`, and `frontend/` directories, then run `install.bat` or `npm install` again.
