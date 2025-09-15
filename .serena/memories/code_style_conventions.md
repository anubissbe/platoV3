# Plato Code Style and Conventions

## TypeScript Configuration

- **Target**: ES2022
- **Module System**: ES2022 with Bundler resolution
- **Strict Mode**: Enabled for type safety
- **JSX**: react-jsx transform
- **Import Style**: ES modules with `.js` extensions in imports

## Naming Conventions

Based on observed codebase patterns:

### Files and Directories

- **Files**: kebab-case for most files (`keyboard-handler.tsx`, `mcp-integration.ts`)
- **React Components**: PascalCase files (`ConversationArea.tsx`, `Header.tsx`)
- **Test Files**: `*.test.ts` or `*.test.tsx` pattern
- **Directories**: kebab-case (`src/tools`, `src/tui`, `src/__tests__`)

### Code Elements

- **Functions**: camelCase (`runTui`, `getTerminalEnvironment`, `loadConfig`)
- **Interfaces**: PascalCase (`KeyboardState`, `MCPServer`)
- **Types**: PascalCase (`UnifiedDiff`, `Creds`)
- **Constants**: UPPER_SNAKE_CASE (`CLIENT_ID_DEFAULT`, `DEVICE_CODE_URL`)
- **React Components**: PascalCase (`App`, `ConversationArea`)

## Import Patterns

- ES module imports with explicit `.js` extensions
- Relative imports using `./` and `../`
- External libraries imported without extensions
- Type imports separated when needed

## Code Structure Patterns

- **Async/await**: Preferred over promises
- **Error Handling**: Try-catch blocks with proper error messages
- **React Hooks**: Functional components with hooks
- **Type Definitions**: Explicit typing, avoiding `any`

## File Organization

- **Barrel Exports**: Used in some directories (`src/styles/`)
- **Component Co-location**: Related components in same directory
- **Separation of Concerns**: Clear separation between UI, business logic, and data

## Documentation Standards

- **JSDoc**: Used for complex functions and APIs
- **README Files**: Present at project root with comprehensive documentation
- **CLAUDE.md**: AI assistant integration documentation
- **Inline Comments**: Used sparingly for complex logic

## Testing Conventions

- **Test Location**: `src/__tests__/` directory
- **Test Structure**: Describe-it pattern with Jest
- **Mock Usage**: Mocks in `__mocks__/` directories
- **Test Categories**: Unit, integration, e2e test separation

## Commit Message Format

From CONTRIBUTING.md:

- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation
- `test:` for test additions/changes
- `refactor:` for code refactoring
- `perf:` for performance improvements
- `chore:` for maintenance tasks

## Code Quality Tools

- **ESLint**: For linting (version 9.9.0)
- **Prettier**: For code formatting (version 3.3.2)
- **TypeScript**: Strict type checking (version 5.5.4)
- **Jest**: Testing framework with coverage reporting
