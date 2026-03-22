# Starter Agent

A local multi-agent AI system powered by LM Studio. Researcher, Planner, Worker, and Reviewer agents collaborate in an automated LangGraph workflow, organized by Projects with isolated workspace folders, a sequential job queue, scheduled automation via Cron Jobs, and a Vue 3 dashboard to monitor and interact with them in real time.

---

## Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js v22.5+ (v24 recommended) |
| **Backend** | Express.js (ESM modules) |
| **Frontend** | Vue 3 + Vuetify 3 + Vite |
| **Agents / Workflow** | LangChain.js + LangGraph.js |
| **LLM Provider** | LM Studio (local, OpenAI-compatible API) |
| **Database** | JSON file DB (custom, no native addons required) |
| **Realtime** | Socket.IO |
| **Logging** | Winston (streams live to frontend) |
| **Scheduling** | `cron` npm package — server-local timezone |
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
│   │   ├── database/          # JSON DB, table helpers, migrator
│   │   ├── tools/             # Tool definitions, implementations, registry
│   │   ├── socket/            # Socket.IO manager + events
│   │   ├── logger/            # Winston logger + socket transport
│   │   ├── memory/            # STM / LTM / Working memory stores
│   │   ├── browser/           # Web search tools (Google, DuckDuckGo, GitHub, fetch)
│   │   ├── rl/                # Reinforcement learning store (outcome replay)
│   │   ├── reports/           # HTML report generator (walkthrough.html with skill chips)
│   │   ├── mcp/               # MCP tool manager (Puppeteer web search bridge)
│   │   ├── projects/          # Project store (JSON file)
│   │   ├── queue/             # In-memory sequential job queue
│   │   ├── workspace/         # Workspace path resolver + file reader
│   │   └── skills/            # Skill system
│   │       ├── skill.loader.js        # Profile + library skill loader, cache, buildSkillMenu()
│   │       └── skill.requests.js      # Track missing skills requested by the Planner
│   └── modules/               # HMVC feature modules
│       ├── workflow/          # LangGraph StateGraph + runner
│       ├── planner/           # Planner agent (selects agentSkills from library)
│       ├── researcher/        # Researcher agent (web search + MCP, library skill)
│       ├── worker/            # Worker agent (two-phase file-by-file, library skill, RL-guided)
│       ├── reviewer/          # Reviewer agent (library skill, RL-calibrated)
│       ├── chat/              # Direct chat API
│       ├── cron/              # Cron job scheduler (service + controller + module)
│       ├── memory/            # Memory API routes
│       ├── projects/          # Projects CRUD API + folder management
│       ├── queue/             # Job queue API
│       ├── settings/          # Global + per-agent + browser tools settings API
│       ├── skills/            # Skill library CRUD API + skill requests API
│       ├── workspace/         # Workspace file browser API
│       └── dashboard/         # Stats aggregation
├── frontend/
│   └── src/
│       ├── views/             # Page components
│       │   ├── DashboardView        # Live stats, agent cards with step/score progress, workflow graph, job queue, recent runs
│       │   ├── ProjectsView         # Project management — select active project, workspace folder, per-project token usage
│       │   ├── WorkflowView         # Run + monitor pipelines, project selector, run history
│       │   ├── SwimlaneView         # Realtime 5-lane task tracker (Planner/Researcher/Worker Doing/Worker Done/Reviewer)
│       │   ├── SkillManagementView  # Skill library — browse/create/edit/delete skill files + pending Planner requests
│       │   ├── ScheduleView         # Cron job scheduler — create, edit, run-now, live status, search
│       │   ├── ChatView             # Real-time chat with typing animation + agent avatars
│       │   ├── MemoryView           # STM / LTM / working memory per agent, project-filtered
│       │   ├── WalkthroughView      # Embedded workflow report viewer
│       │   ├── DebugView            # Per-agent debug tabs (Planner first) with skill selectors
│       │   ├── LogsView             # Live log stream with pagination and search
│       │   └── SettingsView         # Global + per-agent + MCP Browser config + Clear Logs + App Reset
│       ├── composables/       # useActiveProject (global project state)
│       ├── components/        # Shared UI components
│       └── plugins/           # Router, Vuetify, Socket.IO
├── workspace/                 # Agent file sandbox root
│   └── <Project_Folder>/      # Per-project isolated workspace (auto-created)
├── reports/                   # Generated workflow HTML reports
├── skills/
│   ├── default/               # Active skill profile (SKILL.md, PLANNER.md, …)
│   └── library/               # Named skill files loaded dynamically per run
│       ├── researcher/        # design.md, backend.md, general.md
│       ├── worker/            # html-css.md, nodejs.md, vue.md, fullstack.md, general.md
│       └── reviewer/          # design.md, backend.md, fullstack.md, general.md
├── install.bat                # One-click dependency installer (Windows)
└── start.bat                  # One-click launcher (Windows)
```

### Workflow Pipeline

4-agent LangGraph pipeline with dynamic skill selection:

```
User Goal  (+ active Project)
   │
   ▼
[Planner]   → decomposes goal into steps + selects agentSkills from library
               (researcher / worker / reviewer skill names injected into plan JSON)
               workspace scanned for existing project files
               missing skills recorded → visible in Skills page
   │
   ▼
[Researcher] → web search (MCP or native) using planner-selected skill
               step-specific research query from plan
   │
   ▼
[Worker]    → two-phase execution per step:
               Phase 1: LLM outputs a file plan (short call)
               Phase 2: one LLM call per file — no truncation, full file content
               RL patterns injected; workspace re-read after each step
               uses planner-selected worker skill
   │
   ▼
[Reviewer]  → quality checks output (0–10 score) using planner-selected reviewer skill
               score ≥ 7 → approved → final answer + HTML report (with skill chips)
               score < 7 → RL-guided improvement loop (target ≥ 9/10, up to N retries)
   │
   ▼
Final Answer + HTML Report
```

### Dynamic Agent Skill Selection

The Planner analyzes each goal and selects the most appropriate skill from the library for each agent:

- **Planner output** includes `agentSkills: { researcher, worker, reviewer }` — e.g. `{ researcher: "design", worker: "html-css", reviewer: "design" }` for a portfolio task
- **Skill library** lives in `skills/library/<agent>/<skill>.md` — add a new `.md` file to create a new skill (or use the **Skills** page in the UI)
- **Fallback** — if a requested skill file doesn't exist, the agent falls back to `general`; the missing skill is recorded in the DB
- **Skills page** — browse all skills by agent and category, create/edit/delete them in-app, and see all skills the Planner has requested that don't exist yet
- **Chat stream** — selected skills are shown inline after the plan (`🎯 Skills selected — researcher: design, worker: html-css, reviewer: design`)
- **HTML report** — skill chips appear in the report header with per-agent colors
- **Debug page** — each agent tab has a skill selector so you can test any skill directly

Available library skills out of the box:

| Agent | Skills |
|---|---|
| researcher | `design`, `backend`, `general` |
| worker | `html-css`, `nodejs`, `vue`, `fullstack`, `general` |
| reviewer | `design`, `backend`, `fullstack`, `general` |

### Worker — File-by-File Execution

The Worker runs each plan step in two phases to eliminate context-window truncation:

1. **Phase 1 — File Plan**: a short LLM call returns a JSON list of files to create/modify
2. **Phase 2 — Per-file**: one focused LLM call per file produces the complete content

If Phase 1 fails to produce a valid plan, the Worker falls back to a single-call implementation.

### Projects

Each project provides an isolated context for agents:

- **Active project** is selected by the user and persisted in `localStorage`
- **Workspace folder** `workspace/<Title_With_Underscores>/` is auto-created on project creation; all agent-written files go here
- **Chat** sessions are scoped to a project (`session_id = proj_<id>`)
- **Workflow runs** record their `project_id`; the active project's workspace is set as the tool sandbox during the run
- **Memory** view can be filtered by project
- **Folder management** — recreate a missing workspace folder from the Projects page without losing data
- **Delete** cascades: removes chat messages, workflow runs, memory snapshots, STM cache, workspace folder, and report files

### Schedule (Cron Jobs)

Automate recurring tasks without manual intervention:

- **Targets** — each job can run a full Workflow, or trigger a single agent (Researcher, Planner, Worker) directly
- **Project-scoped** — every job requires a project; the selected project's workspace folder is used as the sandbox
- **Schedule picker** — 16 built-in presets (every minute → monthly) plus a Custom cron expression input with live validation
- **Timezone** — all expressions are evaluated in the server's local timezone (shown in the UI next to the expression)
- **Queue-aware** — cron-triggered runs go through the same `agentQueue` as manual runs, preventing collisions
- **Live status** — `cron:status` / `cron:updated` socket events update the UI in real time (running → success / error)
- **Run Now** — trigger any job immediately without waiting for its next scheduled time
- **Toggle** — pause / resume individual jobs without deleting them
- **Search** — filter jobs by name, target, schedule expression, or prompt

### Job Queue

All workflow, chat, and scheduled requests are processed sequentially through an in-memory queue:

- Concurrent requests are automatically queued rather than running in parallel
- The **Job Queue** panel on the Dashboard shows each job's type, label, project, and position
- Queued jobs (not yet running) can be cancelled from the Dashboard
- `GET /api/queue` returns the current snapshot; `DELETE /api/queue/:jobId` cancels a queued job

### Reinforcement Learning Loop

After every review the outcome is stored (`rl_outcomes` table: score, feedback, suggestions, goal, loop count). On subsequent runs:

- **Worker** receives a `## PAST QUALITY PATTERNS` block with top-2 high-scoring past examples (≥ 8/10) and bottom-2 anti-patterns (< 6/10)
- **Reviewer** receives a single-line historical average score for consistent calibration
- **Improvement loops** get a targeted task description built from RL data: required fixes + score target + similar past high-scoring examples + patterns from prior improvement passes

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

1. **Parallel search** — all enabled sources queried simultaneously (Google AI Overview first, then DuckDuckGo, GitHub, and any custom URL-template sources)
2. **Selective browse** — top N pages per source fetched and read (browse depth configurable per source)
3. **LLM analysis** — all gathered content sent to the Researcher LLM with the skill prompt

Sources are fully configurable from **Settings → MCP Browser**: enable/disable, set browse depth, add custom URL-template sources.

---

## Prerequisites

- **Node.js v22.5 or later** — [https://nodejs.org](https://nodejs.org)
  - v24 recommended
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
6. After a workflow run, check the **Skills** page to see if the Planner requested skills you haven't created yet — create them in-app or add the `.md` file manually
7. Optionally go to **Schedule** to set up recurring automated runs scoped to a project

---

## Features

| Feature | Description |
|---|---|
| **Projects** | Create/edit/delete projects; each project gets an isolated `workspace/<Name>/` folder. Required before using Chat, Workflow, Memory, or Schedule. |
| **Project Workspace** | Files written by agents go into `workspace/<Project>/`. Folder is auto-created on project creation, can be recreated from the Projects page if deleted. |
| **Per-project Token Usage** | Token consumption is tracked per project and displayed on each project card — total tokens and today's usage shown on the right side of the card. |
| **Swimlane View** | Realtime 5-lane board (Planner / Researcher / Worker Doing / Worker Done / Reviewer). Opens from the Workflow graph when a run is active. Shows goal, skills, steps, research summary, file writes, score, feedback, and suggestions per agent in real time. Recovers missed events via snapshot loader when opened mid-run. |
| **Dynamic Skill Selection** | Planner analyzes each goal and selects the best skill from the library for Researcher, Worker, and Reviewer. Skills shown in chat stream, plan result, and HTML report. |
| **Skill Library** | Named skill files in `skills/library/<agent>/<skill>.md`. Create/edit/delete skills directly in the **Skills** page — no manual file editing needed. |
| **Skills Page** | Browse all skills by agent and category with search. Create new skills, edit content, delete unused ones. Shows pending Planner skill requests (skills selected but not yet created) with exact file paths. |
| **Worker File-by-File** | Worker executes each plan step in two phases: file plan (short call) + one LLM call per file. Eliminates truncation on large tasks. |
| **Schedule** | Cron job manager — 16 schedule presets + custom expressions, per-job project assignment (required), live socket status, run-now, toggle pause, search. All runs go through the job queue. |
| **Job Queue** | All workflow, chat, and scheduled jobs run sequentially. Live queue visible on the Dashboard with project name, type, position, and cancel button. |
| **Dashboard** | Live stats: active run banner, workflow graph, agent cards showing live step progress (worker) and review score (reviewer), token usage per agent, job queue, recent runs, live log stream |
| **Workflow** | Run multi-agent pipelines scoped to the active project; stop anytime. Run history shows project names. |
| **Chat** | Real-time chat UI — agent avatars, message grouping, date separators, character-by-character typing animation |
| **Memory** | View / manage STM / LTM / Working memory per agent; filter by project; save STM → LTM |
| **Settings** | Sidebar-nav layout: configure LLM model, tools, workflow loop, debug mode, MCP Browser sources per agent; Clear Logs; Reset Application |
| **MCP Browser** | Enable/disable and tune browse depth per search source; add custom URL-template sources; Google AI Overview prioritized first |
| **Debug Mode** | Toggle from Settings → Global; logs full LLM responses at debug level for troubleshooting |
| **Debug Page** | Per-agent tabs (Planner, Researcher, Worker, Reviewer) with skill selectors; run each agent directly and inspect output |
| **Thinking Model Support** | All agents work with both plain models and thinking models (Qwen3, DeepSeek, QwQ). `<think>` blocks stripped automatically. |
| **Reinforcement Learning** | Worker + Reviewer automatically improve over runs via experience replay |
| **Logs** | Live log stream from the backend with level filtering, pagination (25 lines/page), and search |
| **Reports** | Auto-generated HTML walkthrough after each workflow run, viewable in-app. Header shows selected agent skills with color-coded chips. |
| **Reset Application** | One-click wipe of all memory, logs, token stats, run history, and reports — agent settings and projects are preserved |

---

## Adding a Custom Skill

### Option A — In the UI

1. Go to **Skills** in the nav
2. Click **New Skill**, choose the agent, enter a name and category, write the skill content
3. Save — the Planner sees the new skill immediately on the next run

### Option B — Manually

1. Create a Markdown file at `skills/library/<agent>/<skill-name>.md`
   - `<agent>` is one of: `researcher`, `worker`, `reviewer`
   - File content is the system prompt addition injected for that agent
2. The Planner will automatically see the new skill in its menu on the next run
3. If the Planner had previously requested this skill, it will disappear from the **Skills** page automatically

Example — add a `mobile` skill for the Worker:
```
skills/library/worker/mobile.md
```

---

## Key API Endpoints

```
# Projects
GET    /api/projects                        List all projects
POST   /api/projects                        Create a project { title, description }
PUT    /api/projects/:id                    Update a project
DELETE /api/projects/:id                    Delete project + all related data (including workspace folder)
POST   /api/projects/:id/ensure-folder      Recreate workspace folder if missing

# Skills
GET    /api/skills                          List all skills (from library + default profile)
POST   /api/skills                          Create a skill { agentId, skillName, content, category? }
GET    /api/skills/:agentId/:skillName      Get a single skill's content
PUT    /api/skills/:agentId/:skillName      Update skill content
DELETE /api/skills/:agentId/:skillName      Delete a skill file
GET    /api/skills/requests                 List pending skill requests from the Planner
DELETE /api/skills/requests/:id             Dismiss a single skill request
DELETE /api/skills/requests/all             Clear all skill requests

# Schedule (Cron Jobs)
GET    /api/cron                            List all cron jobs
POST   /api/cron                            Create { name, schedule, target, prompt, project_id }
PUT    /api/cron/:id                        Update a cron job
DELETE /api/cron/:id                        Delete a cron job
PUT    /api/cron/:id/toggle                 Toggle enabled / paused
POST   /api/cron/:id/run                    Trigger immediately (goes through job queue)
POST   /api/cron/validate                   Validate a cron expression { schedule }

# Job Queue
GET    /api/queue                           Current queue snapshot
DELETE /api/queue/:jobId                    Cancel a queued job

# Workflow
POST   /api/workflow/start                  Start a workflow run { goal, projectId? }
POST   /api/workflow/stop/:runId            Stop a running workflow
GET    /api/workflow/runs                   List workflow run history
GET    /api/workflow/runs/:runId            Get a single run record (used by Swimlane snapshot loader)

# Chat
POST   /api/chat/message                    Send a message { content, sessionId, projectId? }
POST   /api/chat/stop/:sessionId            Stop a running chat session
GET    /api/chat/history/:sessionId         Get chat history
GET    /api/chat/sessions                   List sessions

# Workspace
GET    /api/workspace/files?projectId=      File tree for a project's workspace folder
GET    /api/workspace/file?path=&projectId= Read a file from the workspace

# Memory
GET    /api/memory/stm/:agentId             Short-term memory snapshots
GET    /api/memory/ltm/:agentId/query       Query long-term memory
POST   /api/memory/ltm/:agentId/store       Store to long-term memory
GET    /api/memory/wm/:agentId              Working memory context

# Settings
GET    /api/settings/:agentId/tools         Get agent tool config
PUT    /api/settings/:agentId/tools         Update agent tools
GET    /api/settings/global                 Get global settings (debug_mode, etc.)
PUT    /api/settings/global                 Update global settings
GET    /api/settings/browser/tools          List MCP Browser search sources
PUT    /api/settings/browser/tools          Bulk update source enable/browse-count
POST   /api/settings/browser/tools          Add a custom search source
PUT    /api/settings/browser/tools/:name    Edit a custom source
DELETE /api/settings/browser/tools/:name    Delete a custom source
POST   /api/settings/reset                  Reset application data (preserves settings + projects)

# Logs
DELETE /api/logs/files                      Clear all log files on disk

# Dashboard
GET    /api/dashboard/stats                 Live stats (agent availability, run counts, settings)
GET    /api/dashboard/tokens                Token usage — today/weekly/monthly/total, byAgent, byProject { total, today }
GET    /api/dashboard/recent-runs           Last 20 workflow runs

# Other
GET    /api/rl/stats                        Reinforcement learning outcome stats
GET    /api/reports/sessions                List sessions with reports
GET    /api/reports/:sessionId/content      Get parsed report HTML + styles
GET    /api/health                          Backend health check
```

---

## Socket Events

| Event | Direction | Payload | Description |
|---|---|---|---|
| `workflow:started` | server → client | `{ runId, goal, sessionId, maxLoops }` | Workflow run began |
| `workflow:complete` | server → client | `{ runId, finalAnswer }` | Run finished successfully |
| `workflow:stopped` | server → client | `{ runId }` | Run was aborted |
| `workflow:error` | server → client | `{ runId, error }` | Run failed |
| `workflow:node_complete` | server → client | `{ runId, node, state }` | Individual graph node update; `state.status` is `running`/`complete`/`loop`/`assembled`; running state includes `goal` (planner), `query` (researcher), `step`/`stepIdx`/`totalSteps` (worker), `step` (reviewer); complete state includes `plan` (planner), `findings` (researcher), `approved`/`score`/`feedback`/`suggestions` (reviewer) |
| `worker:action` | server → client | `{ type, path }` | Worker wrote a file (`type: "written"`) |
| `queue:updated` | server → client | `{ queue, ts }` | Job queue changed |
| `agent:status` | server → client | `{ agentId, status, currentTask }` | Agent busy/idle update |
| `cron:status` | server → client | `{ id, status, error? }` | Cron job running / success / error |
| `cron:updated` | server → client | `{ id }` | Cron job record updated (next_run, etc.) |
| `log:entry` | server → client | `{ level, message, agentId, ts }` | Live log entry |

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

**Planner selects a skill that doesn't exist**
→ The agent falls back to `general` automatically. Go to **Skills** in the nav to see which skills are pending, then create them in-app or add the file to `skills/library/<agent>/<skill>.md`.

**Cron job fires at wrong time**
→ Schedule expressions use the **server's local timezone** (shown next to the expression in the Schedule UI). The active timezone is also logged on startup: `Cron service started — timezone: Asia/Bangkok`. Adjust your expressions accordingly.

**Cron job shows "running" but nothing appears in the queue**
→ The job goes through `agentQueue` — check the Dashboard Job Queue panel. If another workflow is already running, the cron job will wait before starting.

**RL context not appearing**
→ RL patterns only appear after the first completed workflow run that produces a review score. Run at least one full workflow to seed the outcomes table.

**Reports not appearing in Workflow / Dashboard**
→ Reports are generated after a run completes. Ensure the `reports/` directory exists at the project root (created automatically by `install.bat` or `start.bat`).

**`node_modules` errors after updating**
→ Delete `node_modules` in the root, `backend/`, and `frontend/` directories, then run `install.bat` or `npm install` again.

**Project workspace folder missing**
→ Go to **Projects**, find the project card, and click the folder-sync button to recreate it without losing any project data.
