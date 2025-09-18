# Plato Technology Stack

## Core Technologies

- **Runtime**: Node.js 18+ with npm 8+
- **Language**: TypeScript with strict mode enabled
- **Module System**: ES2022 modules (type: "module" in package.json)
- **Build Target**: ES2022 with Bundler module resolution
- **UI Framework**: React 19.1.1 + Ink 6.2.3 (Terminal UI)
- **CLI Framework**: yargs 17.7.2 for argument parsing

## Key Dependencies

- **ink**: React-based terminal UI framework
- **react**: Core React framework (v19.1.1)
- **yargs**: CLI argument parsing
- **prompts**: Interactive CLI prompts
- **eventsource-parser**: SSE parsing for streaming responses
- **picocolors**: Terminal color output
- **execa**: Process execution for git operations
- **keytar**: OS keychain for credential storage (optional)
- **cross-fetch**: HTTP client
- **yaml**: YAML parsing
- **diff**: Text diffing utilities

## Development Tools

- **Build**: TypeScript Compiler (tsc)
- **Runtime**: tsx for development
- **Testing**: Jest 30.1.3 with ts-jest
- **Linting**: ESLint 9.9.0
- **Formatting**: Prettier 3.3.2
- **Type Checking**: TypeScript 5.5.4

## Testing Infrastructure

- **Main Framework**: Jest with ts-jest preset
- **Test Environment**: Node.js
- **Testing Library**: ink-testing-library for TUI components
- **Extended Matchers**: jest-extended
- **Coverage**: Built-in Jest coverage reporting

## Prerequisites

- Node.js 18 or higher
- npm 8 or higher
- Git (for patch operations)
- Linux system (primary development environment)
