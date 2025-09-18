/**
 * Autocomplete Dropdown Component
 *
 * Displays autocomplete suggestions in a dropdown format with:
 * - Keyboard navigation (arrow keys, Enter, Escape)
 * - Character highlighting using picocolors
 * - Scroll indicators for >10 items
 * - Type indicators (CMD/FILE)
 * - Performance optimized for large result sets
 */

import React from "react";
import { Box, Text, useInput } from "ink";
import pc from "picocolors";
import type { AutocompleteResult } from "../../autocomplete/types.js";

export interface AutocompleteDropdownProps {
  /** Array of autocomplete results to display */
  results: AutocompleteResult[];
  /** Whether the dropdown is visible */
  isVisible: boolean;
  /** Index of currently selected item */
  selectedIndex: number;
  /** Maximum number of items to show at once */
  maxVisibleItems?: number;
  /** Callback when user selects an item */
  onSelect: (result: AutocompleteResult) => void;
  /** Callback when user cancels autocomplete */
  onCancel: () => void;
}

/**
 * Autocomplete dropdown component for TUI interface
 */
export const AutocompleteDropdown: React.FC<AutocompleteDropdownProps> = ({
  results,
  isVisible,
  selectedIndex,
  maxVisibleItems = 10,
  onSelect,
  onCancel,
}) => {
  // Handle keyboard navigation
  useInput((input: string, key: any) => {
    if (!isVisible) return;

    if (key.return) {
      if (results[selectedIndex]) {
        onSelect(results[selectedIndex]);
      }
    } else if (key.escape) {
      onCancel();
    }
    // Arrow navigation is handled by parent component
  });

  if (!isVisible) {
    return null;
  }

  if (results.length === 0) {
    return (
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="gray">No suggestions</Text>
      </Box>
    );
  }

  // Calculate visible range for scrolling
  const startIndex = Math.max(0, Math.min(selectedIndex - Math.floor(maxVisibleItems / 2), results.length - maxVisibleItems));
  const endIndex = Math.min(startIndex + maxVisibleItems, results.length);
  const visibleResults = results.slice(startIndex, endIndex);

  const showScrollUp = startIndex > 0;
  const showScrollDown = endIndex < results.length;

  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1}>
      {/* Scroll up indicator */}
      {showScrollUp && (
        <Text color="gray">
          {"↑ "}{pc.gray(`${startIndex} more above`)}
        </Text>
      )}

      {/* Visible items */}
      {visibleResults.map((result, index) => {
        const actualIndex = startIndex + index;
        const isSelected = actualIndex === selectedIndex;

        return (
          <AutocompleteItem
            key={`${result.type}-${result.item}`}
            result={result}
            isSelected={isSelected}
          />
        );
      })}

      {/* Scroll down indicator */}
      {showScrollDown && (
        <Text color="gray">
          {"↓ "}{pc.gray(`${results.length - endIndex} more below`)}
        </Text>
      )}

      {/* Footer with navigation hint */}
      <Box borderTop borderColor="gray" marginTop={1} paddingTop={1}>
        <Text color="gray">
          {pc.cyan("↑↓")} navigate • {pc.green("Enter")} select • {pc.yellow("Esc")} cancel
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Individual autocomplete item component
 */
interface AutocompleteItemProps {
  result: AutocompleteResult;
  isSelected: boolean;
}

const AutocompleteItem: React.FC<AutocompleteItemProps> = ({
  result,
  isSelected,
}) => {
  // Get type indicator
  const typeIndicator = result.type === "command" ? "CMD" : "FILE";
  const typeColor = result.type === "command" ? "cyan" : "yellow";

  // Apply character highlighting
  const highlightedText = applyHighlighting(result.item, result.highlight);

  // Style the entire item based on selection
  const ItemWrapper = isSelected ?
    ({ children }: { children: React.ReactNode }) => <Text>{pc.inverse(children as string)}</Text> :
    ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>;

  return (
    <Box>
      <ItemWrapper>
        <Text color={typeColor}>
          {pc.bold(`[${typeIndicator}]`)} {highlightedText}
        </Text>
      </ItemWrapper>
    </Box>
  );
};

/**
 * Apply character highlighting to text based on highlight ranges
 */
function applyHighlighting(text: string, highlights: Array<{ start: number; end: number }>): string {
  if (!highlights || highlights.length === 0) {
    return text;
  }

  let result = "";
  let lastIndex = 0;

  // Sort highlights by start position
  const sortedHighlights = highlights.sort((a, b) => a.start - b.start);

  for (const highlight of sortedHighlights) {
    // Add text before highlight
    if (highlight.start > lastIndex) {
      result += text.slice(lastIndex, highlight.start);
    }

    // Add highlighted text
    const highlightedPart = text.slice(highlight.start, highlight.end);
    result += pc.bold(pc.yellow(highlightedPart));

    lastIndex = highlight.end;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    result += text.slice(lastIndex);
  }

  return result;
}

export default AutocompleteDropdown;