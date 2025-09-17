/**
 * TypeScript interfaces for the autocomplete engine system
 * Provides type definitions for fuzzy search, usage tracking, and result scoring
 */

export interface AutocompleteResult {
  /** The matched item text */
  item: string;
  /** Fuzzy search score (0-1, lower is better) */
  score: number;
  /** Type of autocomplete result */
  type: "command" | "file";
  /** Character ranges to highlight in UI */
  highlight: HighlightRange[];
  /** Number of times this item has been used */
  usageCount: number;
  /** Last time this item was used */
  lastUsed: Date;
  /** Calculated final score combining fuzzy + usage + recency */
  finalScore: number;
}

export interface HighlightRange {
  /** Start character index */
  start: number;
  /** End character index (exclusive) */
  end: number;
}

export interface AutocompleteEngine {
  /**
   * Search for items matching the query
   * @param query - Search text
   * @param type - Type of items to search for
   * @returns Ranked array of matching results
   */
  search(query: string, type: "command" | "file" | "mixed"): AutocompleteResult[];

  /**
   * Update usage statistics for an item
   * @param item - The item that was used
   * @param type - Type of the item
   */
  updateUsageStats(item: string, type: "command" | "file"): void;

  /**
   * Get current usage history
   * @returns Usage statistics
   */
  getHistory(): UsageHistory;

  /**
   * Clear usage history (for testing/reset)
   */
  clearHistory(): void;
}

export interface UsageHistory {
  /** Map of item -> usage statistics */
  items: Record<string, UsageStats>;
  /** Total number of autocomplete usages */
  totalUsages: number;
  /** Last time history was updated */
  lastUpdated: Date;
}

export interface UsageStats {
  /** Number of times this item was used */
  count: number;
  /** Last time this item was used */
  lastUsed: Date;
  /** Type of the item */
  type: "command" | "file";
}

export interface AutocompleteConfig {
  /** Maximum number of results to return */
  maxResults: number;
  /** Minimum query length to trigger autocomplete */
  minQueryLength: number;
  /** Maximum response time in milliseconds */
  maxResponseTime: number;
  /** Fuse.js search threshold (0-1, lower is stricter) */
  fuzzyThreshold: number;
  /** Whether to learn from usage patterns */
  enableUsageLearning: boolean;
  /** Path to usage history storage file */
  historyFilePath: string;
}

export interface SearchableItem {
  /** Primary search key */
  name: string;
  /** Alternative search terms */
  aliases?: string[];
  /** Description for additional context */
  description?: string;
  /** Category or grouping */
  category?: string;
  /** Type identifier */
  type: "command" | "file";
}

export interface FuseSearchResult {
  /** The matched item */
  item: SearchableItem;
  /** Fuse.js score */
  score?: number;
  /** Character match details */
  matches?: FuseMatch[];
}

export interface FuseMatch {
  /** Array indices that matched */
  indices: number[][];
  /** Value that was matched */
  value: string;
  /** Key that was matched */
  key: string;
}