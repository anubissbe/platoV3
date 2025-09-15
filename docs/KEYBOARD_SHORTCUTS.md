# Keyboard Shortcuts Reference

Complete reference for all keyboard shortcuts and key bindings available in Plato.

## 🚀 Quick Reference

| Action               | Shortcut           | Context        |
| -------------------- | ------------------ | -------------- |
| **Send Message**     | `Enter`            | Input area     |
| **New Line**         | `Shift+Enter`      | Input area     |
| **Exit Application** | `Ctrl+C`, `Ctrl+D` | Global         |
| **Command Palette**  | `Ctrl+P`           | Global         |
| **Clear Input**      | `Ctrl+U`           | Input area     |
| **Select All**       | `Ctrl+A`           | Input area     |
| **Copy**             | `Ctrl+C`           | Text selection |
| **Paste**            | `Ctrl+V`           | Input area     |
| **Undo**             | `Ctrl+Z`           | Input area     |
| **Redo**             | `Ctrl+Y`           | Input area     |

## 📝 Input and Editing

### Text Entry

- **Enter**: Send message or execute command
- **Shift+Enter**: Insert new line without sending
- **Tab**: Auto-complete commands (when available)
- **Escape**: Cancel current operation or clear command input

### Text Selection

- **Shift+Arrow Keys**: Select text
- **Ctrl+Shift+Arrow**: Select words
- **Ctrl+A**: Select all text in input area
- **Double Click**: Select word (mouse required)

### Text Manipulation

- **Ctrl+X**: Cut selected text
- **Ctrl+C**: Copy selected text
- **Ctrl+V**: Paste from clipboard
- **Ctrl+Z**: Undo last action
- **Ctrl+Y**: Redo last undone action
- **Ctrl+U**: Clear entire input line
- **Ctrl+K**: Delete from cursor to end of line
- **Ctrl+W**: Delete previous word

### Cursor Movement

- **Arrow Keys**: Move cursor one character
- **Ctrl+Arrow Keys**: Move cursor one word
- **Home**: Move to beginning of line
- **End**: Move to end of line
- **Ctrl+Home**: Move to beginning of input
- **Ctrl+End**: Move to end of input

## 🎛️ Panel and Layout Control

### Panel Navigation

- **Ctrl+1**: Focus main conversation panel
- **Ctrl+2**: Focus status/metrics panel
- **Ctrl+3**: Focus input panel
- **F1**: Toggle status panel visibility
- **F2**: Expand/collapse input area
- **F3**: Switch layout modes (single/multi-panel)

### View Controls

- **Page Up**: Scroll conversation up
- **Page Down**: Scroll conversation down
- **Ctrl+Home**: Scroll to top of conversation
- **Ctrl+End**: Scroll to bottom of conversation
- **Mouse Wheel**: Smooth scrolling (when mouse enabled)

## 🔧 System Commands

### Core Functions

- **Ctrl+C**: Exit application (confirm prompt)
- **Ctrl+D**: Alternative exit command
- **Ctrl+R**: Refresh/restart interface
- **Ctrl+L**: Clear screen (conversation remains in memory)

### Quick Commands

- **F5**: Refresh status and connection
- **F9**: Toggle mouse mode on/off
- **F10**: Enter paste mode (disable input temporarily)
- **F11**: Toggle fullscreen mode (if supported)
- **F12**: Open developer/debug panel

## 📋 Slash Commands Shortcuts

### Frequently Used

- **`/h` + Tab**: Auto-complete to `/help`
- **`/s` + Tab**: Auto-complete to `/status`
- **`/m` + Tab**: Auto-complete to `/model`
- **`/q` + Tab**: Auto-complete to `/quit`

### Command Navigation

- **Tab**: Auto-complete current command
- **Shift+Tab**: Show command suggestions
- **Up/Down Arrows**: Navigate command history
- **Ctrl+R**: Search command history

## 🎨 Accessibility Shortcuts

### Screen Reader Support

- **Ctrl+Shift+A**: Announce current panel content
- **Ctrl+Shift+S**: Announce system status
- **Ctrl+Shift+T**: Announce current time
- **Ctrl+Shift+M**: Announce memory usage

### High Contrast

- **Ctrl+Shift+H**: Toggle high contrast mode
- **Ctrl+Shift+C**: Cycle through color schemes
- **Ctrl+Shift+L**: Toggle low vision optimizations

## 🔍 Search and Navigation

### Text Search

- **Ctrl+F**: Search in conversation history
- **F3**: Find next match
- **Shift+F3**: Find previous match
- **Escape**: Close search

### Command Search

- **Ctrl+P**: Open command palette
- **Ctrl+Shift+P**: Command palette with options
- **Type**: Filter available commands
- **Enter**: Execute selected command

## 🎯 Advanced Features

### Memory Management

- **Ctrl+M**: Quick memory save
- **Ctrl+Shift+M**: Memory management panel
- **Ctrl+Alt+M**: Memory compaction

### Session Control

- **Ctrl+S**: Save current session
- **Ctrl+O**: Load/resume session
- **Ctrl+N**: Start new session
- **Ctrl+Shift+N**: New session (keep current)

### Tool Integration

- **Ctrl+T**: Toggle tool panel
- **Ctrl+Shift+T**: Tool configuration
- **F4**: Execute last tool command
- **Shift+F4**: Tool command history

## 🌐 Platform-Specific Shortcuts

### Windows

- **Alt+F4**: Close application
- **Windows+V**: System clipboard history
- **Ctrl+Shift+Esc**: Task manager (external)

### macOS

- **Cmd** replaces **Ctrl** for most shortcuts
- **Cmd+Q**: Quit application
- **Cmd+Space**: Spotlight search (external)
- **Cmd+Tab**: Application switcher (external)

### Linux

- **Alt+F2**: Run command (external)
- **Ctrl+Alt+T**: New terminal (external)
- **Ctrl+Shift+C/V**: Terminal copy/paste (context-dependent)

## ⚡ Performance Shortcuts

### Quick Actions

- **Ctrl+Shift+R**: Force refresh everything
- **Ctrl+Shift+D**: Toggle debug mode
- **Ctrl+Shift+P**: Performance monitor
- **Ctrl+Shift+B**: Benchmark current view

### Emergency Actions

- **Ctrl+Alt+Del**: Emergency stop (Windows)
- **Ctrl+C twice**: Force quit
- **Escape three times**: Emergency exit

## 🛠️ Customization

### Modifying Shortcuts

Shortcuts can be customized in `.plato/config/keybindings.json`:

```json
{
  "global": {
    "exit": ["Ctrl+C", "Ctrl+D"],
    "command_palette": ["Ctrl+P"],
    "refresh": ["F5"]
  },
  "input": {
    "send": ["Enter"],
    "new_line": ["Shift+Enter"],
    "clear": ["Ctrl+U"]
  },
  "navigation": {
    "scroll_up": ["Page Up"],
    "scroll_down": ["Page Down"],
    "home": ["Ctrl+Home"],
    "end": ["Ctrl+End"]
  }
}
```

### Disabling Shortcuts

To disable specific shortcuts, set them to `[]` in the config file.

### Context-Sensitive Help

Press **F1** in any panel to see context-specific shortcuts for that area.

## 📱 Mobile/Touch Considerations

When using Plato on mobile terminals or touch devices:

- Long press replaces right-click
- Pinch to zoom (if supported)
- Two-finger scroll for panel navigation
- Touch and hold for context menus

## 🔧 Troubleshooting Shortcuts

### Common Issues

- **Shortcut not working**: Check if terminal captures the key combination
- **Wrong action**: Verify current focus panel
- **No response**: Try **Ctrl+R** to refresh interface

### Testing Shortcuts

Use `/doctor keyboard` to test keyboard functionality and shortcut recognition.

---

_Last updated: 2025-09-11_  
_For more help, run `/help shortcuts` or visit the [documentation](docs/README.md)_
