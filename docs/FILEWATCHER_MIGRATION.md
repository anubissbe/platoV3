# File Watcher Migration Guide

## Overview

The Plato project now supports two file watching implementations:

1. **Basic File Watcher** (`src/tools/file-watcher.ts`) - Uses native Node.js `fs.watch`
2. **Enhanced File Watcher** (`src/tools/enhanced-file-watcher.ts`) - Uses chokidar library

A compatibility layer (`src/tools/file-watcher-compat.ts`) provides seamless migration between the two implementations.

## Configuration

Configure the file watcher implementation in your Plato config file (`.plato/config.yaml` or `~/.config/plato/config.yaml`):

```yaml
fileWatcher:
  useEnhanced: false      # Set to true to use chokidar-based watcher
  enableFallback: true    # Fallback to fs.watch if chokidar fails
  debugMigration: false   # Enable debug logging for migration events
```

## Migration Path

### Phase 1: Current State (Default)
- Uses basic file watcher (fs.watch) by default
- Enhanced watcher available but opt-in
- Full backward compatibility maintained

### Phase 2: Testing (Recommended)
```yaml
fileWatcher:
  useEnhanced: true       # Enable enhanced watcher
  enableFallback: true    # Keep fallback enabled
  debugMigration: true    # Monitor migration
```

### Phase 3: Production
```yaml
fileWatcher:
  useEnhanced: true       # Use enhanced watcher
  enableFallback: false   # Disable fallback once stable
  debugMigration: false   # Disable debug logging
```

## Feature Comparison

| Feature | Basic (fs.watch) | Enhanced (chokidar) |
|---------|-----------------|---------------------|
| Cross-platform | Limited | Excellent |
| Recursive watching | Platform-dependent | Reliable |
| Performance | Good | Better with optimizations |
| Debouncing | 100ms | 150ms (configurable) |
| Conflict detection | No | Yes |
| File hashing | No | Yes |
| Ignore patterns | No | Yes (extensive) |
| Large file handling | Standard | Optimized with chunking |

## API Compatibility

The compatibility layer ensures all existing code continues to work:

```javascript
// This works with both implementations
import { FileWatcher, fileWatcher } from "../tools/file-watcher-compat.js";

const watcher = new FileWatcher();
watcher.on("change", (event) => {
  console.log(`File changed: ${event.filename}`);
});

await watcher.watch("/path/to/dir", { recursive: true });
```

## Testing

Run the migration test to verify everything works:

```bash
node test-migration.js
```

This tests:
1. Basic file watcher functionality
2. Enhanced file watcher functionality
3. API compatibility layer
4. Automatic fallback on error

## Troubleshooting

### Issue: Enhanced watcher not detecting changes
- Check if chokidar is properly installed: `npm list chokidar`
- Try disabling `awaitWriteFinish` in the enhanced watcher options
- Increase debounce delay if events are being missed

### Issue: High CPU usage with enhanced watcher
- Enable ignore patterns for large directories (node_modules, .git, etc.)
- Use polling only as a last resort
- Consider increasing the debounce delay

### Issue: Fallback not working
- Ensure `enableFallback` is set to `true` in config
- Check console for `[FileWatcher]` debug messages
- Verify basic file watcher is still present

## Performance Optimizations

The enhanced file watcher includes several optimizations:

1. **Intelligent Ignore Patterns**: Automatically ignores common non-source directories
2. **Chunked Hashing**: Memory-efficient processing for files >10MB
3. **Debounced Events**: Reduces event spam with configurable delays
4. **Performance Metrics**: Built-in tracking of processing times and event counts

## Future Plans

- Gradual migration to enhanced watcher as default
- Additional performance optimizations
- More granular conflict detection
- Integration with Plato's permission system