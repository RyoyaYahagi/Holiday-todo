## Scope

- These rules apply to all tasks in which an agent modifies or generates repository files.
- Includes adding dependencies, modifying CI settings, creating tests, and updating documentation.

---

## Core Principles (Mandatory)

1.  **Prioritize actual code and real data**
    -   Decisions must be based on the current repository state. Always review the actual file before modifying it.

2.  **Implement fail-fast behavior**
    -   Invalid input or violated assumptions must immediately throw clear, descriptive errors.

3.  **No dummy or placeholder implementations**
    -   Do not submit incomplete implementations (e.g., `// TODO`, placeholder logic). If unavoidable, stop and request user approval with justification.

4.  **No implicit fallback behavior**
    -   If specifications are unclear, do not guess. Always add explicit guards and request user confirmation.

5.  **Terminology alignment**
    -   If using project-specific terms or abbreviations, define them and request user approval before implementation.

---

## Pre-Implementation Workflow (Checklist)

1.  List repository root files and identify key directories.
2.  Check for dependency files (`package.json`, `tsconfig.json`).
3.  Run existing tests (`npm test` or `yarn test`) and investigate failures.
4.  For important data files (`data/` etc.), read-only review them to verify assumptions.
5.  Identify function/module call sites and references to assess impact.

**Note:** Summaries must reference files using the format `filename:line(summary)` **and be written in Japanese**.

---

## Coding Rules (Mandatory)

-   **Path operations**: Always use the Node.js `path` module (`import path from 'path';`) to handle file paths cross-platform.

-   **Style**: Us `prettier` for code formatting, and `eslint` for linting.

-   **Type Safety**:
    -   All public functions must include type annotations.
    -   Avoid `any` wherever possible. Use `unknown` or specific types/interfaces.
    -   Code should aim to pass strict `tsconfig` settings.

-   **Docstrings (TSDoc)**: All modules, classes, and functions must include detailed docstrings **written in Japanese** using TSDoc format.

### Docstring Template (TSDoc, text written *in Japanese*)

```typescript
/**
 * (Describe purpose of the function **in Japanese**.)
 *
 * @param param1 - (Describe meaning **in Japanese**.)
 * @param flag - (Describe meaning **in Japanese**.)
 * @returns (Describe return value **in Japanese**.)
 * @throws {ValueError} (Describe failure conditions **in Japanese**.)
 *
 * @remarks
 * (Additional notes **in Japanese** if needed.)
 */
export function example(param1: number, flag: boolean = false): string {
  // ...
}
```

-   **Comments**: Complex logic must include explanatory comments **in Japanese** specifying intent and rationale.

---

## Error Handling & Logging

-   Use explicit errors (`Error`, `TypeError`, or custom error classes).
-   Fail fast on invalid states.
-   Logging must describe key events and errors. Log messages must be **written in Japanese**, with optional structured (JSON) logs.

---

## Testing Rules (Mandatory)

1.  **Readability first**: Test descriptions (`describe`, `it`) must be documented **in Japanese**.

2.  **Test structure**:
    -   Use `jest` or `vitest` for unit tests.
    -   Avoid real network calls; use local test data or realistic mocks.

3.  **Test data naming**: Use meaningful names **in Japanese** (e.g., `sample_user_田中.json`).

4.  **Explicit assumptions**: Document environmental assumptions **in Japanese** at the beginning of each test file.

5.  **Coverage**: Core logic must be covered; include boundary and error tests.

---

## Reporting Rules

Reports must:

-   Be written **in Japanese**.
-   Include exact file references (`path/to/file.ts:45`).
-   Follow this structure:
    1.  Summary
    2.  Actions taken
    3.  Impact analysis
    4.  Test results
    5.  Recommended next steps

---

## Workflow / Pull Request Rules

1.  Keep PRs small and single-purpose.
2.  PR descriptions must be written **in Japanese**.
3.  Major design or dependency changes must include documentation updates.
4.  Leaving TODOs/dummy implementations requires prior user approval.

---

## Dependencies & Security

-   **Pinned dependencies**: Use fixed versions in `package.json` (avoid `^` or `~` ranges if strict reproducibility is required, or follow project convention).
-   **Static analysis**: Use `eslint` and `tsc --noEmit` in CI.
-   **Security scan**: Use `npm audit`.
-   **Secrets**: Never hard-code secrets. Report if discovered.

---

## CI / Automation

-   **Minimum checks**:
    -   `npm run format:check` (or equivalent)
    -   `npm run lint`
    -   `npm run build` (or `tsc --noEmit`)
    -   `npm test`

-   CI must fail fast; summarize errors **in Japanese**.

---

## Decision-Making Procedure

1.  Identify the file and line number causing concern.
2.  Provide at least two alternative solutions, explained **in Japanese**.
3.  Proceed only after receiving approval.

---

## Appendix: Templates

### 1) Report Header Template

```
(Write all content below **in Japanese**)

Summary:
- <short summary>

Target file:
- path/to/file.ts:123 (function name)

Actions:
- Description of performed changes

Impact:
- Caller: path/a.ts:45
- Related: path/b.ts:10

Tests:
- Command: npm test
- Result: XX passed, 0 failed

Recommended actions:
- Next steps
```

### 2) Test Header Template

```typescript
// (Write all following items **in Japanese**)
// Assumptions:
// - Node.js 18+
// - Dependencies installed: npm install
// Purpose: Validate that user input checks behave as expected
```
