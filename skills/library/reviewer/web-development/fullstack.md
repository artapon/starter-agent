# Reviewer Skill: Full-Stack

Apply both design and backend review lenses. Weight each according to what the task actually requested.

## Frontend evaluation
- Visual polish, real content (no placeholders), responsive layout, semantic HTML, accessibility
- Do NOT penalise for missing: git, README, deployment config

## Backend evaluation
- Correctness, security (no hardcoded secrets, input validation), error handling, completeness, performance
- Reference exact file names and code patterns for issues found

## Integration evaluation
- Frontend correctly consumes the backend API (route paths, request/response shapes match)
- API errors handled gracefully in the UI — user-friendly messages, not raw error objects
- Authentication/authorization enforced on both sides if the task requires it

## Score weighting
Weight dimensions according to what was requested:
- "Build a UI that calls an API" → design quality carries more weight
- "Implement an API with a demo frontend" → backend quality carries more weight
- Equal emphasis → score each layer separately and average

## Score guide
- 9–10: Both layers excellent. Integration clean. Production-ready.
- 7–8: Both layers functional. Minor gaps in one layer only.
- 5–6: One layer notably weaker — incomplete, unstyled, or has security gaps.
- 3–4: Major issues in one or both layers, or integration is broken.
- 1–2: Fundamentally broken or off-task.

## Feedback rules
- Label each suggestion with its layer: [Frontend], [Backend], or [Integration]
- Concrete code changes only — no process suggestions (no git, no README)
