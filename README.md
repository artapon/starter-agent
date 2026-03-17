# Starter Agent

A local multi-agent AI system powered by LM Studio. An analyzer, worker, and reviewer collaborate in an automated LangGraph workflow, with a Vue 3 dashboard to monitor and interact with them in real time.

---

## Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js v22.5+ (v24 recommended) |
| **Backend** | Express.js (ESM modules) |
| **Frontend** | Vue 3 + Vuetify 3 + Vite |
| **Agents / Workflow** | LangChain.js + LangGraph.js |
| **LLM Provider** | LM Studio (local, OpenAI-compatible API) |
| **Database** | Custom JSON file store (`node:sqlite`-compatible, no native addons) |
| **Realtime** | Socket.IO |
| **Logging** | Winston (streams live to frontend) |
| **Web Search** | Google (AI Overview), DuckDuckGo, GitHub API, URL browse — configurable via Settings |
| **Vector Memory** | HNSWLib (local, no external service) |
| **Reinforcement Learning** | Experience replay — outcomes stored per run, injected into Worker + Reviewer prompts |

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
│   │   ├── browser/           # Web search tools (Google, DuckDuckGo, GitHub, fetch)
│   │   ├── rl/                # Reinforcement learning store (outcome replay)
│   │   ├── reports/           # HTML report generator
│   │   ├── mcp/               # MCP tool manager (Puppeteer web search bridge)
│   │   └── skills/            # Skill profile system
│   └── modules/               # HMVC feature modules
│       ├── workflow/          # LangGraph StateGraph + runner
│       ├── planner/           # Planner agent
│       ├── researcher/        # Researcher agent (web search + MCP)
│       ├── worker/            # Worker agent (RL-guided)
│       ├── reviewer/          # Reviewer agent (RL-calibrated)
│       ├── chat/              # Direct chat API
│       ├── memory/            # Memory API routes
│       ├── settings/          # Global + per-agent + browser tools settings
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
│       │   └── SettingsView   # Global + per-agent + MCP Browser config
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
[Analyze]   → research (web search + MCP) + generate step-by-step plan
   │
   ▼
[Worker]    → executes each plan step; RL patterns injected into system prompt
   │
   ▼
[Reviewer]  → quality checks output; RL calibration injected into system prompt
             on fail: retry or RL-guided improvement loop (target score ≥ 9/10)
             on pass: assembles final answer + HTML report
   │
   ▼ (loop up to N times if score < 10/10)
Final Answer + HTML Report
```

### Reinforcement Learning Loop

After every review the outcome is stored (`rl_outcomes` table: score, feedback, suggestions, goal, loop count). On subsequent runs:

- **Worker** receives a `## REINFORCEMENT LEARNING` block in its system prompt with top-3 high-scoring past examples (≥ 8/10) and bottom-3 anti-patterns (< 6/10).
- **Reviewer** receives a `## REVIEWER CALIBRATION` block with historical avg score, trend, and excellent/failure examples to keep scoring consistent.
- **Improvement loops** get a targeted task description built from RL data: required fixes + score target + similar past high-scoring examples + patterns from prior improvement passes.

Stats are available at `GET /api/rl/stats`.

### MCP Web Search

When **MCP Browser** is enabled for the Researcher agent, web search runs through a Puppeteer-backed MCP bridge in three phases:

1. **Parallel search** — all enabled sources queried simultaneously (Google AI Overview first, then DuckDuckGo, GitHub, and any custom URL-template sources).
2. **Selective browse** — top N pages per source fetched and read (browse depth configurable per source).
3. **LLM analysis** — all gathered content sent to the Researcher LLM together with the skill prompt.

Sources are fully configurable from the **Settings → MCP Browser** panel: enable/disable, set browse depth, add custom URL-template sources, or remove them.

---

## Prerequisites

- **Node.js v22.5 or later** — [https://nodejs.org](https://nodejs.org)
  - v24 recommended; v22.5+ required for `node:sqlite` built-in
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
1. Checks Node.js is installed (v22.5+)
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

Per-agent model overrides, tool configuration, workflow loop settings, and MCP Browser sources can all be changed at runtime from **Settings** in the UI.

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
| **Dashboard** | Live 2-column layout: workflow graph, token usage, agent status, recent runs, live logs |
| **Workflow** | Run multi-agent pipelines with a single goal prompt; stop anytime |
| **Chat** | Talk directly to any agent with streaming responses |
| **Memory** | View / manage Short-Term, Long-Term, and Working memory per agent; save STM → LTM |
| **Settings** | Sidebar-nav layout: configure LLM model, tools, workflow loop, and MCP Browser sources per agent |
| **MCP Browser** | Enable/disable and tune browse depth per search source; add custom URL-template sources; Google AI Overview prioritized first |
| **Reinforcement Learning** | Worker + Reviewer automatically improve over runs via experience replay — past scores, patterns, and calibration injected into prompts |
| **Logs** | Live log stream from the backend with level filtering |
| **Debug** | Interactive Researcher Agent walkthrough and backend connection tester |
| **Reports** | Auto-generated HTML walkthrough after each workflow run, viewable in-app |
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
GET    /api/settings/browser/tools      List MCP Browser search sources
PUT    /api/settings/browser/tools      Bulk update source enable/browse-count
POST   /api/settings/browser/tools      Add a custom search source
PUT    /api/settings/browser/tools/:sourceName   Edit a custom source
DELETE /api/settings/browser/tools/:sourceName   Delete a custom source

GET    /api/rl/stats                    Reinforcement learning outcome stats

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
→ The researcher uses native fetch — Google scraping, DuckDuckGo HTML, and the GitHub public API — no API keys required. Check that the backend has outbound internet access. Google AI Overview requires JavaScript rendering by Google; the scraper uses static HTML fallback strategies.

**MCP Browser not searching**
→ Ensure **MCP Browser** is toggled on in Settings for the Researcher agent, and at least one source is enabled in the MCP Browser panel.

**RL context not appearing**
→ RL patterns only appear after the first completed workflow run that produces a review score. Run at least one full workflow to seed the `rl_outcomes` table.

**Reports not appearing in Workflow / Dashboard**
→ Reports are generated after a run completes. Ensure the `reports/` directory exists at the project root (created automatically by `install.bat` or `start.bat`).

**`node_modules` errors after updating**
→ Delete `node_modules` in the root, `backend/`, and `frontend/` directories, then run `install.bat` or `npm install` again.

**Node.js version errors (`node:sqlite` / `--experimental-sqlite`)**
→ This project requires Node.js v22.5 or later. Run `node -v` to check. Download the latest LTS from [https://nodejs.org](https://nodejs.org).
