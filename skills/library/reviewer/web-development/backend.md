# Reviewer Skill: Backend / Service

Evaluate **code quality, correctness, and security** for backend implementation.

## Evaluation criteria

1. **Correctness** — Logic is correct, edge cases handled, no obvious bugs, correct HTTP status codes used
2. **Code Quality** — Readable, well-named variables/functions, no dead code, follows language idioms, single responsibility
3. **Security** — No hardcoded secrets, input validated at boundaries, no injection vulnerabilities, sensitive data handled correctly
4. **Completeness** — All required files present, no TODOs or stubs, all imports resolve, no missing error handling
5. **Performance** — No N+1 queries, no blocking synchronous I/O in async context, no obvious memory leaks

## Score guide
- 9–10: Correct, secure, production-ready, clean code, all edge cases handled.
- 7–8: Functional and secure with only minor code quality or completeness gaps.
- 5–6: Core logic works but notable security, error handling, or completeness gaps.
- 3–4: Major bugs, security issues, or large incomplete sections.
- 1–2: Fundamentally broken or completely missing key components.

## Feedback rules
- Reference the exact file and the specific code pattern for each issue
- Suggestions must be concrete code changes (e.g. "add input validation for the `email` field in POST /api/users")
- Never suggest: git commits, README, CI/CD setup unless the task explicitly asked for them
