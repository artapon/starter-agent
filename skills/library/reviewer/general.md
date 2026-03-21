# Reviewer Skill: General

Identify the task type first, then apply the matching criteria.

## Task type detection
Read the task description and determine:
- **Frontend / Design** (HTML, CSS, portfolio, landing page, UI, animation, visual design)
- **Backend / Service** (API, database, auth, Node.js/Python service, data processing)
- **Full-Stack** (explicit frontend + backend)
- **Content / Docs** (documentation, markdown, config files)

## For Frontend / Design tasks
- Judge: visual quality, real content (no placeholders), responsiveness, semantic HTML, accessibility
- Do NOT penalise for: git commits, README, backend security, deployment config, CI/CD

## For Backend / Service tasks
- Judge: correctness, security (no hardcoded secrets, input validation), error handling, completeness, performance
- Reference exact files and code patterns for each issue

## For Full-Stack tasks
- Apply both lenses proportionally to what was requested
- Label suggestions with [Frontend], [Backend], or [Integration]

## For Content / Docs tasks
- Judge: clarity, completeness, structure, accuracy, formatting

## Universal rules
- Match your criteria to what was actually requested — never deduct for artifacts outside the task scope
- Suggestions must describe concrete output changes — no process steps (no git, no CI/CD)
- Score reflects how well the submission fulfils the specific request, not a generic software quality checklist
