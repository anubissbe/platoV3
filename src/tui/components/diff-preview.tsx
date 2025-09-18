import React, { useState, useEffect, useMemo } from "react";
import { Box, Text } from "ink";
import { FileEdit, EditOperation } from "../../tools/multi-file-editor.js";

export interface DiffPreviewProps {
  fileEdit: FileEdit;
  showLineNumbers?: boolean;
  width?: number;
  height?: number;
  focusedFile?: boolean;
  onNavigate?: (line: number) => void;
  showMetadata?: boolean;
}

export interface DiffLine {
  type: "unchanged" | "added" | "removed" | "context";
  lineNumber: number;
  originalLineNumber?: number;
  content: string;
  operation?: EditOperation;
}

export interface DiffChunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

/**
 * DiffPreview component - Side-by-side diff visualization for multi-file editing
 * Provides visual representation of changes with line-by-line comparison
 */
export const DiffPreview: React.FC<DiffPreviewProps> = ({
  fileEdit,
  showLineNumbers = true,
  width = process.stdout.columns || 80,
  height = process.stdout.rows - 10 || 20,
  focusedFile = false,
  onNavigate,
  showMetadata = true,
}) => {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedLine, setSelectedLine] = useState(0);

  // Calculate diff chunks from file edit operations
  const diffChunks = useMemo(() => {
    return calculateDiffChunks(fileEdit);
  }, [fileEdit]);

  // Generate unified diff view
  const diffLines = useMemo(() => {
    const lines: DiffLine[] = [];

    for (const chunk of diffChunks) {
      lines.push(...chunk.lines);
    }

    return lines;
  }, [diffChunks]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!focusedFile) return;

    const handleKeyPress = (str: string, key: any) => {
      if (key.downArrow && selectedLine < diffLines.length - 1) {
        setSelectedLine(prev => prev + 1);
      } else if (key.upArrow && selectedLine > 0) {
        setSelectedLine(prev => prev - 1);
      } else if (key.return) {
        onNavigate?.(selectedLine);
      }
    };

    process.stdin.on('keypress', handleKeyPress);
    return () => {
      process.stdin.off('keypress', handleKeyPress);
    };
  }, [focusedFile, selectedLine, diffLines.length, onNavigate]);

  // Auto-scroll to keep selected line visible
  useEffect(() => {
    const visibleLines = height - 4; // Account for header and metadata
    if (selectedLine >= scrollOffset + visibleLines) {
      setScrollOffset(selectedLine - visibleLines + 1);
    } else if (selectedLine < scrollOffset) {
      setScrollOffset(selectedLine);
    }
  }, [selectedLine, height]);

  const renderLineNumber = (lineNum: number | undefined, width: number = 4) => {
    if (lineNum === undefined) return " ".repeat(width);
    return lineNum.toString().padStart(width, " ");
  };

  const getLineColor = (line: DiffLine) => {
    switch (line.type) {
      case "added":
        return "green";
      case "removed":
        return "red";
      case "unchanged":
        return "white";
      case "context":
        return "gray";
      default:
        return "white";
    }
  };

  const getLinePrefix = (line: DiffLine) => {
    switch (line.type) {
      case "added":
        return "+";
      case "removed":
        return "-";
      case "unchanged":
        return " ";
      case "context":
        return " ";
      default:
        return " ";
    }
  };

  const getLineBg = (line: DiffLine, isSelected: boolean) => {
    if (isSelected) return "blue";
    switch (line.type) {
      case "added":
        return "greenBright";
      case "removed":
        return "redBright";
      default:
        return undefined;
    }
  };

  const visibleLines = diffLines.slice(scrollOffset, scrollOffset + height - 4);
  const sideWidth = Math.floor((width - 4) / 2); // Split width for side-by-side view

  return (
    <Box flexDirection="column" width={width} height={height} borderStyle="round" borderColor={focusedFile ? "cyan" : "gray"}>
      {/* Header */}
      <Box paddingX={1} borderStyle="single" borderColor="gray">
        <Box justifyContent="space-between" width="100%">
          <Text color="cyan" bold>
            📄 {fileEdit.filePath.split('/').pop()}
          </Text>
          <Text color={fileEdit.isDirty ? "yellow" : "green"}>
            {fileEdit.isDirty ? "Modified" : "Clean"} • {fileEdit.changes.length} changes
          </Text>
        </Box>
      </Box>

      {/* Metadata */}
      {showMetadata && (
        <Box paddingX={1} borderStyle="single" borderColor="gray">
          <Text color="gray" dimColor>
            Original: {fileEdit.originalContent.split('\n').length} lines •
            Current: {fileEdit.currentContent.split('\n').length} lines •
            Last modified: {fileEdit.lastModified.toLocaleTimeString()}
          </Text>
        </Box>
      )}

      {/* Side-by-side diff view */}
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {/* Column headers */}
        <Box borderStyle="single" borderColor="gray">
          <Box width={sideWidth} justifyContent="center">
            <Text color="red" bold>Original</Text>
          </Box>
          <Text color="gray">│</Text>
          <Box width={sideWidth} justifyContent="center">
            <Text color="green" bold>Modified</Text>
          </Box>
        </Box>

        {/* Diff content */}
        <Box flexDirection="column" flexGrow={1}>
          {visibleLines.map((line, index) => {
            const actualIndex = scrollOffset + index;
            const isSelected = actualIndex === selectedLine && focusedFile;

            return (
              <Box key={actualIndex}>
                {/* Original side */}
                <Box width={sideWidth} backgroundColor={line.type === "removed" ? "redBright" : isSelected ? "blue" : undefined}>
                  {showLineNumbers && (
                    <Text color="gray" dimColor>
                      {renderLineNumber(line.originalLineNumber)}
                    </Text>
                  )}
                  <Text color="gray">│</Text>
                  <Text color={getLineColor(line)}>
                    {line.type === "removed" ? `- ${line.content}` :
                     line.type === "unchanged" ? `  ${line.content}` : ""}
                  </Text>
                </Box>

                {/* Separator */}
                <Text color="gray">│</Text>

                {/* Modified side */}
                <Box width={sideWidth} backgroundColor={line.type === "added" ? "greenBright" : isSelected ? "blue" : undefined}>
                  {showLineNumbers && (
                    <Text color="gray" dimColor>
                      {renderLineNumber(line.lineNumber)}
                    </Text>
                  )}
                  <Text color="gray">│</Text>
                  <Text color={getLineColor(line)}>
                    {line.type === "added" ? `+ ${line.content}` :
                     line.type === "unchanged" ? `  ${line.content}` : ""}
                  </Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Footer with navigation hints */}
      {focusedFile && (
        <Box paddingX={1} borderStyle="single" borderColor="gray">
          <Text color="gray" dimColor>
            ↑↓ Navigate • Enter: Go to line • {selectedLine + 1}/{diffLines.length} lines
          </Text>
        </Box>
      )}

      {/* Conflict indicator */}
      {fileEdit.conflictState?.hasConflicts && (
        <Box paddingX={1} backgroundColor="red">
          <Text color="white" bold>
            ⚠️  Conflicts detected: {fileEdit.conflictState.conflictType}
          </Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * Compact diff preview for dashboard views
 */
export const CompactDiffPreview: React.FC<{
  fileEdit: FileEdit;
  width?: number;
}> = ({ fileEdit, width = 40 }) => {
  const stats = useMemo(() => {
    const original = fileEdit.originalContent.split('\n');
    const current = fileEdit.currentContent.split('\n');
    const added = Math.max(0, current.length - original.length);
    const removed = Math.max(0, original.length - current.length);
    return { added, removed, total: fileEdit.changes.length };
  }, [fileEdit]);

  return (
    <Box
      width={width}
      borderStyle="round"
      borderColor={fileEdit.isDirty ? "yellow" : "gray"}
      paddingX={1}
    >
      <Box justifyContent="space-between" width="100%">
        <Text color="cyan">{fileEdit.filePath.split('/').pop()}</Text>
        <Box>
          {stats.added > 0 && <Text color="green">+{stats.added}</Text>}
          {stats.removed > 0 && <Text color="red"> -{stats.removed}</Text>}
          {stats.total > 0 && <Text color="gray"> ({stats.total})</Text>}
        </Box>
      </Box>
    </Box>
  );
};

/**
 * Multi-file diff overview component
 */
export const MultiFileDiffOverview: React.FC<{
  files: FileEdit[];
  selectedIndex: number;
  onSelectFile: (index: number) => void;
  width?: number;
  height?: number;
}> = ({ files, selectedIndex, onSelectFile, width = 80, height = 20 }) => {
  return (
    <Box flexDirection="column" width={width} height={height} borderStyle="round" borderColor="cyan">
      <Box paddingX={1} borderStyle="single" borderColor="gray">
        <Text color="cyan" bold>📁 Multi-File Diff Overview ({files.length} files)</Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {files.map((file, index) => (
          <Box
            key={file.filePath}
            backgroundColor={index === selectedIndex ? "blue" : undefined}
            paddingX={1}
          >
            <Text color={index === selectedIndex ? "white" : "gray"}>
              {index === selectedIndex ? "▶ " : "  "}
              {file.filePath.split('/').pop()}
              {file.isDirty && <Text color="yellow"> •</Text>}
              {file.conflictState?.hasConflicts && <Text color="red"> ⚠️</Text>}
            </Text>
          </Box>
        ))}
      </Box>

      <Box paddingX={1} borderStyle="single" borderColor="gray">
        <Text color="gray" dimColor>
          ↑↓ Select file • Enter: View diff • Space: Toggle
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Calculate diff chunks from file edit operations
 */
function calculateDiffChunks(fileEdit: FileEdit): DiffChunk[] {
  const originalLines = fileEdit.originalContent.split('\n');
  const currentLines = fileEdit.currentContent.split('\n');

  // Simple line-by-line diff calculation
  const chunks: DiffChunk[] = [];
  let currentChunk: DiffChunk | null = null;

  const maxLines = Math.max(originalLines.length, currentLines.length);

  for (let i = 0; i < maxLines; i++) {
    const originalLine = originalLines[i];
    const currentLine = currentLines[i];

    let diffLine: DiffLine;

    if (originalLine === undefined) {
      // Line added
      diffLine = {
        type: "added",
        lineNumber: i + 1,
        content: currentLine || "",
      };
    } else if (currentLine === undefined) {
      // Line removed
      diffLine = {
        type: "removed",
        lineNumber: i + 1,
        originalLineNumber: i + 1,
        content: originalLine,
      };
    } else if (originalLine === currentLine) {
      // Line unchanged
      diffLine = {
        type: "unchanged",
        lineNumber: i + 1,
        originalLineNumber: i + 1,
        content: originalLine,
      };
    } else {
      // Line modified (show as remove + add)
      diffLine = {
        type: "removed",
        lineNumber: i + 1,
        originalLineNumber: i + 1,
        content: originalLine,
      };
    }

    // Start new chunk if needed
    if (!currentChunk || (diffLine.type !== "unchanged" && currentChunk.lines.length > 0)) {
      if (currentChunk) chunks.push(currentChunk);

      currentChunk = {
        oldStart: i + 1,
        oldLines: 0,
        newStart: i + 1,
        newLines: 0,
        lines: [],
      };
    }

    currentChunk.lines.push(diffLine);

    // Update chunk statistics
    if (diffLine.type === "removed" || diffLine.type === "unchanged") {
      currentChunk.oldLines++;
    }
    if (diffLine.type === "added" || diffLine.type === "unchanged") {
      currentChunk.newLines++;
    }

    // Handle modified lines (add the "added" part)
    if (originalLine !== undefined && currentLine !== undefined && originalLine !== currentLine) {
      const addedLine: DiffLine = {
        type: "added",
        lineNumber: i + 1,
        content: currentLine,
      };
      currentChunk.lines.push(addedLine);
      currentChunk.newLines++;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Diff statistics calculator
 */
export function calculateDiffStats(fileEdit: FileEdit): {
  linesAdded: number;
  linesRemoved: number;
  linesModified: number;
  totalChanges: number;
} {
  const chunks = calculateDiffChunks(fileEdit);

  let linesAdded = 0;
  let linesRemoved = 0;
  let linesModified = 0;

  for (const chunk of chunks) {
    for (const line of chunk.lines) {
      switch (line.type) {
        case "added":
          linesAdded++;
          break;
        case "removed":
          linesRemoved++;
          break;
      }
    }
  }

  // Estimate modified lines (pairs of remove + add)
  linesModified = Math.min(linesAdded, linesRemoved);
  linesAdded -= linesModified;
  linesRemoved -= linesModified;

  return {
    linesAdded,
    linesRemoved,
    linesModified,
    totalChanges: linesAdded + linesRemoved + linesModified,
  };
}