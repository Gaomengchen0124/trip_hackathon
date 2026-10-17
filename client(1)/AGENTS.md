# Repository Guidelines

## Project Structure & Module Organization

This workspace contains three JavaScript ES modules targeting Node.js 22.9 or newer:

- `deepseek-client/`: DeepSeek API transport, retries, and JSON response handling.
- `trip-mcp-client/`: all 12 Trip MCP query tools; additional field references live in `docs/`.
- `itinerary-planner/`: itinerary budgeting, prompts, validation, Markdown rendering, and CLI.

Each module has `src/`, `test/`, `examples/`, and its own README and `package.json`. Shared test helpers live in `deepseek-client/testkit/`; planner fixtures also live in `itinerary-planner/testkit/`.

Reuse modules through explicit source imports, such as `./deepseek-client/src/deepseek-client.js`. Keep the three directories as siblings: the planner imports DeepSeek through relative paths. Package publishing and workspace tooling are not required.

## Build, Test, and Development Commands

There is no build step or third-party dependency installation requirement. Run commands from the relevant module directory; the workspace root has no package scripts.

- `npm test`: run that module's offline test suite.
- `npm run check` in `itinerary-planner/`: check the sample itinerary's time budget without an API call.
- `npm run demo` in `itinerary-planner/`: run the complete planning flow against a local stub.
- `npm run plan -- examples/shanghai.json`: generate an itinerary using DeepSeek, from `itinerary-planner/`.
- `npm run chat` in `deepseek-client/` or `npm run example -- query_bus '<JSON>'` in `trip-mcp-client/`: run live API examples with configured credentials.

## Coding Style & Naming Conventions

Follow existing JavaScript style: two-space indentation, single quotes, semicolons, explicit `.js` import extensions, camelCase functions, and PascalCase classes. Use descriptive kebab-case filenames. No formatter or linter is configured. Keep changes scoped; preserve source-import compatibility and avoid unnecessary dependencies or abstractions.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`, with `*.test.js` filenames. Use local HTTP stubs and deterministic fixtures; ordinary tests must not need real credentials. Add regression coverage for changed behavior, including relevant error paths. Run both DeepSeek and planner suites when changing their shared contract. No numerical coverage threshold is configured.

## Commit & Pull Request Guidelines

This checkout has no Git history available to establish a commit convention. Use concise, imperative messages describing the affected module and behavior. PR descriptions should explain the change, reason, and commands actually run; link related issues when available and identify unverified live behavior.

## Security & Configuration

Copy the relevant `.env.example` to `.env` for live examples. Keep credentials server-side and out of commits, logs, and error messages. Preserve Trip's query-only behavior and local validation of model-generated itinerary arithmetic.
