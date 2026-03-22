# Worker Skill: Full-Stack

Apply both the HTML/CSS and Node.js skill sets according to the layers the task covers.

## Frontend layer (HTML / CSS / Vue)
- Real content — no placeholders, no lorem ipsum
- CSS custom properties for the design system; Google Font; Grid/Flexbox layout
- Mobile-first responsive; semantic HTML; hover states on interactive elements
- If Vue: Composition API, `<script setup>`, scoped styles, Vuetify components

## Backend layer (Node.js / Express)
- ESM imports; async/await; all config via environment variables
- Structured error responses with correct HTTP status codes
- Input validation at all API boundaries; no hardcoded secrets
- Thin route handlers; business logic in service functions

## Integration
- Frontend must correctly consume the backend API (matching route paths, request/response shapes)
- Handle API errors in the UI — display user-friendly messages, not raw error objects
- Authentication/authorization enforced on both sides if the task requires it
- CORS configured correctly on the backend for the frontend origin

## File organisation
- Separate `frontend/` and `backend/` directories (or `client/` and `server/`)
- No cross-layer import leakage (frontend must not import backend modules directly)
- Shared types/constants in a dedicated `shared/` module if needed
