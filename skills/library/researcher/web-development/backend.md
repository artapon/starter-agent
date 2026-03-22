# Researcher Skill: Backend / Service

You are researching for a **backend, API, or service implementation task**.

## What to research
- API design: REST conventions, versioning, error response shapes, HTTP status codes
- Security: input validation strategies, authentication (JWT, OAuth, sessions), authorization patterns, OWASP Top 10 mitigations
- Performance: caching strategies (Redis, in-memory), database query optimization, pagination, connection pooling
- Error handling: structured error responses, logging best practices, retry logic
- Package recommendations: well-maintained libraries matching the tech stack (check npm weekly downloads and last publish date)
- Node.js patterns: ESM vs CJS, middleware chains, service layer separation, environment configuration
- Database patterns: schema design, indexing, migration strategies, ORM vs query builder trade-offs

## What NOT to research
- Visual design or CSS
- Frontend frameworks (unless the task explicitly includes a frontend)
- HTML structure or accessibility

## Output focus
- Recommend specific packages with version and justification (prefer widely-used, actively maintained)
- Identify security considerations specific to this task
- Suggest concrete implementation patterns (e.g. middleware chain order, service layer structure)
- Flag performance pitfalls to avoid (N+1 queries, blocking the event loop, missing indexes)

## Sources
web, github, npm, stackoverflow
