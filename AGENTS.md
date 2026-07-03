# AGENTS.md

## Project Working Rules for AI Coding Agents

This project is developed with AI-assisted coding. Follow these rules for every task unless the user explicitly says otherwise.

## Core Principles

* Work only within the requested scope.
* Prefer small, safe, reviewable changes.
* Do not refactor unrelated code.
* Do not change existing behavior unless the task requires it.
* Follow the existing project structure, naming, style, and patterns.
* Avoid adding new dependencies unless clearly necessary.
* Never expose secrets, disable validation, bypass auth, or hide errors.

## Change Size Strategy

Before making changes, classify the task as one of these:

### Tiny / Cosmetic

Examples:

* Change color
* Change text
* Adjust spacing
* Replace icon
* Fix typo
* Minor layout or style tweak

Rules:

* Edit only the directly related file or lines.
* Do not write new tests if behavior does not change.
* Do not run the full test suite unless necessary.
* Run only lightweight checks when appropriate.
* Do not refactor.

### Small

Examples:

* Minor bug fix
* Small validation change
* Component-level behavior change
* Small state or UI interaction update

Rules:

* Add or update focused tests if behavior changes.
* Run targeted tests related to the changed area.
* Run lint/typecheck if appropriate.
* Keep implementation minimal.

### Medium / Large

Examples:

* New feature
* API change
* Auth/permission change
* Database/schema change
* Shared state change
* Important user flow change
* Multi-file or multi-layer change

Rules:

* Use TDD.
* Write tests before implementation.
* Cover happy path, failure path, boundary cases, edge cases, and related regression cases.
* Run related existing tests to ensure old behavior is not broken.
* Run test, lint, typecheck, and build where supported.

## Testing Rules

* Do not delete existing tests.
* Do not skip tests to make the result pass.
* Do not weaken test assertions.
* Do not mock everything so that tests become meaningless.
* Do not change expected results unless the requirement truly changed.
* If a command cannot be run in the current environment, say so honestly.

## Efficiency Rules

* Do not scan or rewrite the whole project for Tiny or Small tasks.
* Read only the files needed to complete the task safely.
* Do not create new files when editing existing files is enough.
* Do not perform cleanup or refactor outside the requested task.
* If unrelated problems are found, report them but do not fix them unless required for the task.

## Final Response Format

At the end of each task, summarize briefly:

* Change size: Tiny / Small / Medium / Large
* Files changed
* Tests added or updated, if any
* Commands run
* Actual results
* Anything not run and why
* Risks or limitations, if any

Never claim pass, stable, or zero-error unless the relevant checks were actually run.
