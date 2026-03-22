# Worker Skill: Node.js / Backend

## Language & module style
- Use ESM (`import`/`export`) unless the existing project uses CommonJS
- Prefer `async/await` everywhere; handle all Promise rejections
- Never leave unhandled `.catch()` or floating Promises

## Configuration
- All config via environment variables — never hardcode URLs, ports, secrets, or API keys
- Load with `process.env.VAR_NAME`; validate required vars at startup

## Error handling
- Return structured errors: `{ error: string, code?: string }` or throw with a descriptive message
- Use appropriate HTTP status codes: 200, 201, 400, 401, 403, 404, 409, 422, 500
- Catch async errors in route handlers — never let unhandled rejections crash the server

## Security
- Validate and sanitise all user input at the boundary (type, length, format)
- No SQL/NoSQL injection: use parameterised queries or ORM methods
- No hardcoded credentials in source code
- Set security headers (helmet or equivalent) on new Express apps

## Code structure
- File structure: imports → constants → middleware/helpers → route definitions → exports
- One responsibility per file: separate routes, service logic, and data access
- Keep route handlers thin — delegate business logic to service functions

## Performance
- No blocking synchronous I/O in request handlers
- Use `Promise.all()` for independent async operations
- Avoid N+1 query patterns — batch or join where possible
