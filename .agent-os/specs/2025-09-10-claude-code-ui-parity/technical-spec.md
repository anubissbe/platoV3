# Claude Code UI Parity - Technical Specification

## Architecture Overview

**Current State**: Basic CLI with broken React/Ink TUI system
**Target State**: Rich terminal interface with Claude Code visual parity

### Technical Stack
- **Frontend**: React 18 + Ink 4 for terminal rendering
- **Styling**: Styled components with Claude Code color scheme
- **State Management**: React hooks + Context API
- **Mouse Integration**: Terminal escape sequences + custom scroll controller
- **Performance**: Virtual scrolling, memoized components, 60fps target

## Core Components Architecture

### 1. Application Entry Point
```typescript
// src/cli.ts (modified)
async function main() {
  // Default to TUI unless --cli flag is used
  if (!argv.cli && isTerminalCapable()) {
    await runTui();
  } else {
    // Fallback to basic CLI
    await runBasicCLI();
  }
}
```

### 2. TUI Application Structure
```typescript
// src/tui/app.tsx
export function App() {
  return (
    <Box flexDirection="column" height="100%">
      <Header />
      <ConversationArea />
      <InputArea />
      <StatusBar />
    </Box>
  );
}
```

### 3. Component Hierarchy
```
App
├── Header
│   ├── ModelInfo
│   ├── TokenUsage
│   └── ConnectionStatus
├── ConversationArea
│   ├── MessageList (with virtual scrolling)
│   ├── ScrollController (integrated)
│   └── StreamingIndicator
├── InputArea
│   ├── MultiLineInput
│   ├── InputPrompt
│   └── SendButton
└── StatusBar
    ├── SessionInfo
    ├── KeyboardShortcuts
    └── ProgressIndicators
```

## Implementation Details

### Phase 1: Critical Fixes

#### TypeScript Compilation Issues
```typescript
// Fix duplicate function declarations in keyboard-handler.tsx
// Remove or consolidate duplicate handlers:
// - handleStatuslineCommand (appears twice)
// - handlePermissionsCommand (appears twice)
// - handleAddDirCommand, handleCostCommand, etc.

// Fix import/export issues
import { Component } from 'react';
import { Box, Text } from 'ink';
// Ensure all imports have proper type definitions
```

#### Entry Point Modification
```typescript
// src/cli.ts modifications
import { runTui } from './tui/app.js';

// Terminal capability detection
function isTerminalCapable(): boolean {
  return process.stdin.isTTY && 
         process.stdout.isTTY &&
         process.stdin.setRawMode !== undefined;
}

// WSL and Docker compatibility
function getTerminalEnvironment() {
  const isWSL = process.env.WSL_DISTRO_NAME !== undefined;
  const isDocker = process.env.container !== undefined;
  return { isWSL, isDocker, isCI: process.env.CI !== undefined };
}
```

### Phase 2: Visual Parity Components

#### Header Bar Implementation
```typescript
// src/tui/components/Header.tsx
export function Header() {
  const { model, tokens, connectionStatus } = useAppState();
  
  return (
    <Box borderStyle="single" borderColor="blue" padding={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text color="cyan">Plato - Claude Code Compatible</Text>
        <Box>
          <Text color="green">Model: {model}</Text>
          <Text color="yellow"> | Tokens: {tokens}</Text>
          <Text color={connectionStatus === 'connected' ? 'green' : 'red'}>
            ● {connectionStatus}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
```

#### Conversation Area with Mouse Integration
```typescript
// src/tui/components/ConversationArea.tsx
export function ConversationArea() {
  const scrollControllerRef = useRef<ScrollController>();
  const { messages, isStreaming } = useConversation();
  
  useEffect(() => {
    // Initialize mouse wheel scrolling
    const scrollController = new ScrollController({
      scrollSensitivity: 3,
      smoothScrolling: true,
      boundaryFeedback: true
    });
    scrollControllerRef.current = scrollController;
    
    return () => scrollController.dispose();
  }, []);
  
  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <VirtualScrollList
        items={messages}
        renderItem={MessageComponent}
        onScroll={(event) => scrollControllerRef.current?.handleWheelEvent(event)}
      />
      {isStreaming && <StreamingIndicator />}
    </Box>
  );
}
```

#### Multi-line Input System
```typescript
// src/tui/components/InputArea.tsx
export function InputArea() {
  const [input, setInput] = useState('');
  const [isMultiLine, setIsMultiLine] = useState(false);
  
  return (
    <Box borderStyle="single" borderColor="gray" padding={1}>
      <Box flexDirection="column">
        <Text color="dim">
          {isMultiLine ? 'Multi-line mode (Ctrl+Enter to send)' : 'Type message (Shift+Enter for multi-line)'}
        </Text>
        <TextInput
          value={input}
          onChange={setInput}
          placeholder="Message Plato..."
          multiline={isMultiLine}
        />
      </Box>
    </Box>
  );
}
```

### Phase 3: Interactive Features

#### Real-time Streaming with Typewriter Effect
```typescript
// src/tui/components/StreamingMessage.tsx
export function StreamingMessage({ content }: { content: string }) {
  const [displayedContent, setDisplayedContent] = useState('');
  
  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      if (index < content.length) {
        setDisplayedContent(content.substring(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 25); // 40 characters per second for natural reading pace
    
    return () => clearInterval(interval);
  }, [content]);
  
  return (
    <Box>
      <Text>{displayedContent}</Text>
      {displayedContent.length < content.length && (
        <Text color="dim">▋</Text> // Blinking cursor effect
      )}
    </Box>
  );
}
```

#### Enhanced Mouse Support
```typescript
// Enhanced mouse event handling
export function useMouseSupport() {
  useEffect(() => {
    const handleMouseEvent = (data: Buffer) => {
      const sequence = data.toString();
      const mouseEvents = MouseEventHandler.parseMouseSequence(sequence);
      
      mouseEvents.forEach(event => {
        if (event.type === MouseEventType.SCROLL) {
          // Integrate with scroll controller
          scrollController.handleWheelEvent(event);
        }
      });
    };
    
    process.stdin.on('data', handleMouseEvent);
    
    // Enable mouse tracking
    process.stdout.write('\x1b[?1000h'); // Basic mouse tracking
    process.stdout.write('\x1b[?1006h'); // SGR extended mode
    
    return () => {
      process.stdin.off('data', handleMouseEvent);
      process.stdout.write('\x1b[?1000l');
      process.stdout.write('\x1b[?1006l');
    };
  }, []);
}
```

## Performance Considerations

### Virtual Scrolling Implementation
```typescript
// src/tui/components/VirtualScrollList.tsx
export function VirtualScrollList<T>({
  items,
  renderItem,
  itemHeight = 1,
  bufferSize = 5
}: VirtualScrollListProps<T>) {
  const [scrollPosition, setScrollPosition] = useState(0);
  const [containerHeight, setContainerHeight] = useState(10);
  
  const visibleStartIndex = Math.max(0, scrollPosition - bufferSize);
  const visibleEndIndex = Math.min(
    items.length - 1,
    scrollPosition + containerHeight + bufferSize
  );
  
  const visibleItems = items.slice(visibleStartIndex, visibleEndIndex + 1);
  
  return (
    <Box flexDirection="column">
      {visibleItems.map((item, index) => 
        renderItem(item, visibleStartIndex + index)
      )}
    </Box>
  );
}
```

### Component Memoization
```typescript
// Optimize re-renders with React.memo
export const MessageComponent = React.memo(function MessageComponent({
  message,
  isStreaming = false
}: MessageProps) {
  return (
    <Box marginY={1}>
      <Box marginRight={1}>
        <Text color={message.role === 'user' ? 'blue' : 'green'}>
          {message.role === 'user' ? '👤' : '🤖'}
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        <Text color="dim">{formatTimestamp(message.timestamp)}</Text>
        {isStreaming ? (
          <StreamingMessage content={message.content} />
        ) : (
          <MarkdownText content={message.content} />
        )}
      </Box>
    </Box>
  );
}, (prevProps, nextProps) => {
  return prevProps.message.content === nextProps.message.content &&
         prevProps.isStreaming === nextProps.isStreaming;
});
```

## Testing Strategy

### Compilation Testing
```bash
# Continuous compilation checking
npm run build:watch

# Type checking
npm run typecheck

# Test TUI launch
npm run test:tui-launch
```

### Visual Testing
```typescript
// src/__tests__/visual-regression.test.ts
describe('Visual Regression Tests', () => {
  test('header bar renders correctly', async () => {
    const { container } = render(<Header />);
    expect(container).toMatchSnapshot();
  });
  
  test('conversation area with messages', async () => {
    const messages = mockMessages();
    const { container } = render(
      <ConversationArea messages={messages} />
    );
    expect(container).toMatchSnapshot();
  });
});
```

### Cross-platform Testing
```bash
# Test environments
npm run test:wsl
npm run test:docker  
npm run test:native

# Performance benchmarking
npm run benchmark:rendering
npm run benchmark:scrolling
```

## Deployment and Rollout

### Development Workflow
1. Fix compilation errors in development branch
2. Implement core components with visual tests
3. Add mouse integration and performance optimization
4. Comprehensive testing across platforms
5. Beta release with select users for feedback

### Rollout Strategy
1. **Phase 1**: Internal testing with fixed TUI compilation
2. **Phase 2**: Beta release with core visual parity
3. **Phase 3**: Full release with advanced features
4. **Phase 4**: Performance optimization and polish
5. **Phase 5**: Documentation and community feedback integration