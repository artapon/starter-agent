# Starter Agent

A local multi-agent AI system powered by LM Studio. Researcher, Planner, Worker, and Reviewer agents collaborate in an automated LangGraph workflow, organized by Projects with isolated workspace folders, a sequential job queue, and a Vue 3 dashboard to monitor and interact with them in real time.

---

## Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js v22.5+ (v24 recommended) |
| **Backend** | Express.js (ESM modules) |
| **Frontend** | Vue 3 + Vuetify 3 + Vite |
| **Agents / Workflow** | LangChain.js + LangGraph.js |
| **LLM Provider** | LM Studio (local, OpenAI-compatible API) |
| **Database** | `node:sqlite` built-in (Node 22.5+) |
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
│   │   ├── database/          # node:sqlite DB, table helpers, migrator
│   │   ├── tools/             # Tool definitions, implementations, registry
│   │   ├── socket/            # Socket.IO manager + events
│   │   ├── logger/            # Winston logger + socket transport
│   │   ├── memory/            # STM / LTM / Working memory stores
│   │   ├── browser/           # Web search tools (Google, DuckDuckGo, GitHub, fetch)
│   │   ├── rl/                # Reinforcement learning store (outcome replay)
│   │   ├── reports/           # HTML report generator
│   │   ├── mcp/               # MCP tool manager (Puppeteer web search bridge)
│   │   ├── projects/          # Project store (JSON file)
│   │   ├── queue/             # In-memory sequential job queue
│   │   ├── workspace/         # Workspace path resolver + file reader
│   │   └── skills/            # Skill profile system
│   └── modules/               # HMVC feature modules
│       ├── workflow/          # LangGraph StateGraph + runner
│       ├── planner/           # Planner agent
│       ├── researcher/        # Researcher agent (web search + MCP)
│       ├── worker/            # Worker agent (RL-guided)
│       ├── reviewer/          # Reviewer agent (RL-calibrated)
│       ├── chat/              # Direct chat API
│       ├── memory/            # Memory API routes
│       ├── projects/          # Projects CRUD API + folder management
│       ├── queue/             # Job queue API
│       ├── settings/          # Global + per-agent + browser tools settings
│       ├── workspace/         # Workspace file browser API
│       └── dashboard/         # Stats aggregation
├── frontend/
│   └── src/
│       ├── views/             # Page components
│       │   ├── DashboardView  # Live stats, workflow graph, agent status, job queue, recent runs
│       │   ├── ProjectsView   # Project management — select active project, workspace folder per project
│       │   ├── WorkflowView   # Run + monitor pipelines, project selector, run history
│       │   ├── ChatView       # Real-time chat with typing animation + agent avatars
│       │   ├── MemoryView     # STM / LTM / working memory per agent, project-filtered
│       │   ├── WalkthroughView # Embedded workflow report viewer
│       │   ├── DebugView      # Researcher debug tool
│       │   ├── LogsView       # Live log stream
│       │   └── SettingsView   # Global + per-agent + MCP Browser config + App Reset
│       ├── composables/       # useActiveProject (global project state)
│       ├── components/        # Shared UI components
│       └── plugins/           # Router (with project guard), Vuetify, Socket.IO
├── workspace/                 # Agent file sandbox root
│   └── <Project_Folder>/      # Per-project isolated workspace (auto-created)
├── reports/                   # Generated workflow HTML reports
├── skills/                    # Skill profiles (default, software_house)
├── install.bat                # One-click dependency installer (Windows)
└── start.bat                  # One-click launcher (Windows)
```

### Workflow Pipeline

4-agent LangGraph pipeline:

```
User Goal  (+ active Project)
   │
   ▼
[Researcher + Planner]  → web search (MCP or native) + step-by-step plan
                           workspace scanned for existing project files
   │
   ▼
[Worker]    → executes each plan step; writes files to workspace/<Project>/
              RL patterns injected into system prompt
   │
   ▼
[Reviewer]  → quality checks output (0–10 score)
              score ≥ 7 → approved → final answer + HTML report
              score < 7 → RL-guided improvement loop (target ≥ 9/10, up to N retries)
   │
   ▼
Final Answer + HTML Report
```

### Projects

Each project provides an isolated context for agents:

- **Active project** is selected by the user and persisted in `localStorage` — required before accessing Chat, Workflow, or Memory
- **Workspace folder** `workspace/<Title_With_Underscores>/` is auto-created when a project is created; files written by agents go here
- **Chat** sessions are scoped to a project (`session_id = proj_<id>`)
- **Workflow runs** record their `project_id`; the active project's workspace is set as the sandbox for tools during the run
- **Memory** view can be filtered by project — shows Chat vs Workflow session type automatically
- **Folder management** — recreate a missing workspace folder from the Projects page without losing project data
- **Delete** a project cascades: removes chat messages, workflow runs, memory snapshots, STM cache, workspace folder, and report files

### Job Queue

All workflow and chat requests are processed sequentially through an in-memory queue:

- Concurrent requests are automatically queued rather than running in parallel
- The **Job Queue** panel on the Dashboard shows each job's type, label, project, and position
- Queued jobs (not yet running) can be cancelled from the Dashboard
- `GET /api/queue` returns the current snapshot; `DELETE /api/queue/:jobId` cancels a queued job

### Reinforcement Learning Loop

After every review the outcome is stored (`rl_outcomes` table: score, feedback, suggestions, goal, loop count). On subsequent runs:

- **Worker** receives a `## PAST QUALITY PATTERNS` block with top-2 high-scoring past examples (≥ 8/10) and bottom-2 anti-patterns (< 6/10).
- **Reviewer** receives a single-line historical average score for consistent calibration.
- **Improvement loops** get a targeted task description built from RL data: required fixes + score target + similar past high-scoring examples + patterns from prior improvement passes.

Stats are available at `GET /api/rl/stats`.

### LLM Model Compatibility

All agents support both plain instruction models and thinking models (e.g. Qwen3, DeepSeek):

- `<think>…</think>` reasoning blocks are stripped from streamed output before agents process the JSON response
- Unclosed `<think>` blocks (truncated due to token limits) are also stripped
- `max_tokens` defaults to `32768` to avoid truncating responses mid-thinking
- JSON repair handles literal newlines and control characters that thinking models sometimes emit inside string values
- Multi-pass JSON extraction: direct parse → repair → markdown fence → `{"files":` anchor → brace-depth scan

### MCP Web Search

When **MCP Browser** is enabled for the Researcher agent, web search runs through a Puppeteer-backed MCP bridge in three phases:

1. **Parallel search** — all enabled sources queried simultaneously (Google AI Overview first, then DuckDuckGo, GitHub, and any custom URL-template sources).
2. **Selective browse** — top N pages per source fetched and read (browse depth configurable per source).
3. **LLM analysis** — all gathered content sent to the Researcher LLM with the skill prompt.

Sources are fully configurable from **Settings → MCP Browser**: enable/disable, set browse depth, add custom URL-template sources.

---

## Prerequisites

- **Node.js v22.5 or later** — [https://nodejs.org](https://nodejs.org)
  - v24 recommended; v22.5+ required for `node:sqlite` built-in
- **LM Studio** — [https://lmstudio.ai](https://lmstudio.ai)
  - Start the local server on `http://localhost:1234`
  - Load at least one model (e.g. `qwen2.5-7b-instruct` or any Qwen3/DeepSeek thinking model)
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
4. Creates `workspace/` and `reports/` directories

### Manual (cross-platform)

```bash
# 1. Install all dependencies (npm workspaces)
npm install

# 2. Copy environment config
cp .env.example backend/.env

# 3. Create required directories
mkdir workspace
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
# Supports plain instruction models and thinking models (Qwen3, DeepSeek, etc.)
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
cd backend  && node server.js
cd frontend && npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3000 |
| Health check | http://localhost:3000/api/health |

---

## Getting Started

1. Start the app and open the frontend
2. Go to **Projects** and create your first project — a `workspace/<Project_Name>/` folder is created automatically
3. Click **Select** on the project card to set it as active
4. Navigate to **Chat** or **Workflow** — the active project is pre-selected
5. Enter a goal and run — agents will read and write files inside the project's workspace folder

---

## Features

| Feature | Description |
|---|---|
| **Projects** | Create/edit/delete projects; selecting a project is required before using Chat, Workflow, or Memory. Each project gets an isolated `workspace/<Name>/` folder. |
| **Project Workspace** | Files written by agents go into `workspace/<Project>/`. Folder is auto-created on project creation, can be recreated from the Projects page if deleted. |
| **Job Queue** | All workflow and chat jobs run sequentially. Live queue visible on the Dashboard with project name, type, position, and cancel button. |
| **Dashboard** | Live stats: workflow graph, token usage (per agent), agent status, job queue, recent runs with project badges, live log stream |
| **Workflow** | Run multi-agent pipelines scoped to the active project; stop anytime. Run history shows project names. |
| **Chat** | Real-time chat UI — agent avatars, message grouping, date separators, character-by-character typing animation |
| **Memory** | View / manage STM / LTM / Working memory per agent; filter by project; save STM → LTM |
| **Settings** | Sidebar-nav layout: configure LLM model, tools, workflow loop, MCP Browser sources per agent; Reset Application clears all data |
| **MCP Browser** | Enable/disable and tune browse depth per search source; add custom URL-template sources; Google AI Overview prioritized first |
| **Thinking Model Support** | All agents work with both plain models and thinking models (Qwen3, DeepSeek, QwQ). `<think>` blocks stripped automatically. |
| **Reinforcement Learning** | Worker + Reviewer automatically improve over runs via experience replay |
| **Logs** | Live log stream from the backend with level filtering |
| **Debug** | Interactive Researcher Agent walkthrough and backend connection tester |
| **Reports** | Auto-generated HTML walkthrough after each workflow run, viewable in-app |
| **Skill Profiles** | Switchable system prompt bundles per agent (default, software_house) |
| **Reset Application** | One-click wipe of all memory, logs, token stats, run history, and reports — agent settings and projects are preserved |

---

## Key API Endpoints

```
# Projects
GET    /api/projects                       List all projects
POST   /api/projects                       Create a project { title, description }
PUT    /api/projects/:id                   Update a project
DELETE /api/projects/:id                   Delete project + all related data (including workspace folder)
POST   /api/projects/:id/ensure-folder     Recreate workspace folder if missing

# Job Queue
GET    /api/queue                          Current queue snapshot
DELETE /api/queue/:jobId                   Cancel a queued job

# Workflow
POST   /api/workflow/start                 Start a workflow run { goal, projectId? }
POST   /api/workflow/stop/:runId           Stop a running workflow
GET    /api/workflow/runs                  List workflow run history

# Chat
POST   /api/chat/message                   Send a message { content, sessionId, projectId? }
POST   /api/chat/stop/:sessionId           Stop a running chat session
GET    /api/chat/history/:sessionId        Get chat history
GET    /api/chat/sessions                  List sessions

# Workspace
GET    /api/workspace/files?projectId=     File tree for a project's workspace folder
GET    /api/workspace/file?path=&projectId= Read a file from the workspace

# Memory
GET    /api/memory/stm/:agentId            Short-term memory snapshots
GET    /api/memory/ltm/:agentId/query      Query long-term memory
POST   /api/memory/ltm/:agentId/store      Store to long-term memory
GET    /api/memory/wm/:agentId             Working memory context

# Settings
GET    /api/settings/:agentId/tools        Get agent tool config
PUT    /api/settings/:agentId/tools        Update agent tools
GET    /api/settings/global                Get global settings
PUT    /api/settings/global                Update global settings
GET    /api/settings/browser/tools         List MCP Browser search sources
PUT    /api/settings/browser/tools         Bulk update source enable/browse-count
POST   /api/settings/browser/tools         Add a custom search source
PUT    /api/settings/browser/tools/:name   Edit a custom source
DELETE /api/settings/browser/tools/:name   Delete a custom source
POST   /api/settings/reset                 Reset application data (preserves settings + projects)

# Other
GET    /api/rl/stats                       Reinforcement learning outcome stats
GET    /api/reports/sessions               List sessions with reports
GET    /api/reports/:sessionId/content     Get parsed report HTML + styles
GET    /api/health                         Backend health check
```

---

## Troubleshooting

**LLM returns empty or errors**
→ Make sure LM Studio is running with the local server enabled on port 1234, and the model name in `.env` (or Settings) exactly matches the identifier shown in LM Studio.

**Worker agent produces no files with thinking models (Qwen3, DeepSeek)**
→ Increase `max_tokens` in Settings — thinking models consume many tokens before emitting the JSON response. The default is 32 768; try 65 536 for large tasks.

**Agent always responds "idle" / no streaming**
→ Check the backend terminal for errors. Verify the LM Studio server URL is reachable at `http://localhost:1234/v1`.

**Files written to root workspace instead of project folder**
→ Make sure a project is selected (active) before starting a workflow or chat. The project folder is shown in the nav drawer and on the Projects page.

**Web search returns no results**
→ The researcher uses native fetch — Google scraping, DuckDuckGo HTML, and the GitHub public API — no API keys required. Check that the backend has outbound internet access.

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

**Project workspace folder missing**
→ Go to **Projects**, find the project card, and click the folder-sync button (🗂) to recreate it without losing any project data.
