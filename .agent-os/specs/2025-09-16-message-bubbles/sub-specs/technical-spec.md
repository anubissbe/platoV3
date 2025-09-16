# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2025-09-16-message-bubbles/spec.md

## Technical Requirements

### Component Architecture
- **Location**: `src/tui/components/MessageBubble.tsx`
- **Props Interface**:
  - `message`: Message object with content, role, timestamp, status
  - `isStreaming`: Boolean for streaming state
  - `theme`: Theme configuration for colors and styles
  - `maxWidth`: Maximum width constraint for responsive layout
  - `showAvatar`: Boolean to control avatar display
  - `showTimestamp`: Boolean to control timestamp display

### Border Rendering System
- Use Unicode box-drawing characters: ╭─╮ │ ╰─╯ for rounded corners
- Calculate dynamic width based on terminal size and content
- Implement text wrapping within bubble boundaries
- Support both single-line and multi-line messages
- Handle code blocks and special formatting within bubbles

### Avatar Implementation
- Default avatars: User (👤), Assistant (🤖)
- Configurable through theme system
- Position: Left side of bubble with 2-space padding
- Color coding: Different colors for user vs assistant
- Fallback to text indicators ([U] / [A]) for terminals without emoji support

### Timestamp Formatting
- Format: HH:MM:SS or relative time (e.g., "2 minutes ago")
- Position: Top-right corner of bubble
- Color: Muted/secondary color from theme
- Update mechanism for relative timestamps
- Configurable format through settings

### Status Indicator System
- Streaming: Animated dots (...) or spinner (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏)
- Complete: Checkmark (✅) or fade animation
- Error: Red X (❌) with error message display
- Pending: Clock (🕐) or loading indicator
- Position: Bottom-right corner of bubble

### Role-Based Styling
- User messages: Right-aligned, distinct background color
- Assistant messages: Left-aligned, different background color
- System messages: Center-aligned, minimal styling
- Color schemes must meet WCAG AA contrast requirements
- Support for both light and dark themes

### Performance Optimization
- Virtual scrolling integration for long conversations
- Lazy rendering of off-screen messages
- Memoization of bubble components to prevent unnecessary re-renders
- Efficient text measurement and wrapping algorithms
- Target: <16ms render time per bubble for 60fps

### Accessibility Requirements
- ARIA labels: role="article", aria-label with sender and timestamp
- Keyboard navigation: Tab between messages, Enter to expand/collapse
- Screen reader announcements for new messages
- Focus indicators with visible outline
- Semantic HTML structure within React components

### Integration Points
- Hook into existing Ink rendering system
- Integrate with current theme system in `src/styles/`
- Connect to message stream from `src/runtime/orchestrator.ts`
- Respect terminal capabilities detection
- Work with existing virtual scrolling in conversation view

## External Dependencies

- **boxen** (^7.1.1) - Enhanced box rendering with better Unicode support
  - **Justification:** Provides robust box-drawing capabilities with proper terminal detection and fallback options for message bubble borders

- **chalk** (^5.3.0) - Terminal string styling for role-based colors
  - **Justification:** More powerful than picocolors for complex styling needs including gradient support and theme management

- **strip-ansi** (^7.1.0) - Remove ANSI codes for text measurement
  - **Justification:** Required for accurate text width calculation when wrapping content within bubble boundaries