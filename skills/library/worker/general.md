# Worker Skill: General

## Accuracy (non-negotiable)
- Every import path must resolve to a real file in the workspace or one you are outputting
- Every function you call must be defined — in the same file or in a module you import
- Zero placeholder comments: `// TODO`, `// implement this`, `// rest of code`, `// ...` are forbidden
- If a function is exported, it must have a complete, working implementation

## Consistency
- Match the existing codebase: same indentation, quote style, import syntax, naming conventions
- Reuse patterns already present in the codebase; keep naming coherent across all files

## Completeness
- Every file must contain ALL of its required code — never split logic across responses
- Include every file needed for the task to work end-to-end

## Node.js / Backend
- Use ESM (`import`/`export`) unless the project uses CommonJS
- Prefer `async/await`; handle all Promise rejections
- Use environment variables for config — never hardcode secrets or URLs

## Frontend (Vue 3)
- Use Composition API with `<script setup>`; scoped styles; Vuetify components where applicable

## HTML / CSS / Design
- Write real content — no lorem ipsum, no placeholder text
- CSS custom properties, Google Font, Grid/Flexbox, mobile-first responsive layout

## Code quality
- Clean, readable, self-documenting code; meaningful names; single responsibility per function
- Error handling for all I/O operations; input validation at system boundaries
