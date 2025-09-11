import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import { StyledBox, StyledText } from '../../styles/components.js';
import { getStyleManager } from '../../styles/manager.js';

export interface ConversationEntry {
  id: string;
  timestamp: number;
  title: string;
  messageCount: number;
  lastActivity: number;
  tags: string[];
  bookmarked: boolean;
  preview: string;
  branch?: string;
}

export interface ConversationHistoryProps {
  conversations: ConversationEntry[];
  selectedId?: string;
  searchQuery?: string;
  filterTags?: string[];
  showBookmarkedOnly?: boolean;
  showTimeline?: boolean;
  maxVisible?: number;
  onSelect?: (conversation: ConversationEntry) => void;
  onBookmark?: (id: string, bookmarked: boolean) => void;
  onTag?: (id: string, tags: string[]) => void;
  onBranch?: (id: string, branchName: string) => void;
  onSearch?: (query: string) => void;
}

/**
 * ConversationHistory component - Manages conversation history with search and filtering
 * Provides bookmarking, tagging, timeline view, and conversation branching
 */
export const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  conversations = [],
  selectedId,
  searchQuery = '',
  filterTags = [],
  showBookmarkedOnly = false,
  showTimeline = false,
  maxVisible = 10,
  onSelect,
  onBookmark,
  onTag,
  onBranch,
  onSearch
}) => {
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
  const [searchMode, setSearchMode] = useState(false);

  const manager = getStyleManager();
  const style = manager.getStyle();

  // Filter and sort conversations
  const filteredConversations = useMemo(() => {
    let filtered = [...conversations];

    // Apply search filter
    if (localSearchQuery.trim()) {
      const query = localSearchQuery.toLowerCase();
      filtered = filtered.filter(conv => 
        conv.title.toLowerCase().includes(query) ||
        conv.preview.toLowerCase().includes(query) ||
        conv.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Apply tag filter
    if (filterTags.length > 0) {
      filtered = filtered.filter(conv => 
        filterTags.every(tag => conv.tags.includes(tag))
      );
    }

    // Apply bookmark filter
    if (showBookmarkedOnly) {
      filtered = filtered.filter(conv => conv.bookmarked);
    }

    // Sort by last activity (most recent first)
    filtered.sort((a, b) => b.lastActivity - a.lastActivity);

    return filtered.slice(0, maxVisible);
  }, [conversations, localSearchQuery, filterTags, showBookmarkedOnly, maxVisible]);

  // Group conversations by time for timeline view
  const timelineGroups = useMemo(() => {
    if (!showTimeline) return [];

    const groups = new Map<string, ConversationEntry[]>();
    
    filteredConversations.forEach(conv => {
      const date = new Date(conv.lastActivity);
      const key = formatTimelineGroup(date);
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(conv);
    });

    return Array.from(groups.entries());
  }, [filteredConversations, showTimeline]);

  // Handle search input
  const handleSearchUpdate = (query: string) => {
    setLocalSearchQuery(query);
    onSearch?.(query);
  };

  // Format conversation preview
  const formatConversationPreview = (conversation: ConversationEntry) => {
    const age = formatRelativeTime(conversation.lastActivity);
    const isSelected = conversation.id === selectedId;
    
    return {
      title: truncateText(conversation.title, 40),
      preview: truncateText(conversation.preview, 60),
      metadata: `${conversation.messageCount} msgs • ${age}`,
      selected: isSelected
    };
  };

  // Render conversation item
  const renderConversationItem = (conversation: ConversationEntry, index: number) => {
    const formatted = formatConversationPreview(conversation);
    const isSelected = formatted.selected;
    
    return (
      <Box key={conversation.id} flexDirection="column" marginBottom={1}>
        {/* Main conversation line */}
        <Box flexDirection="row" alignItems="center">
          {/* Selection indicator */}
          <StyledText type={isSelected ? 'info' : 'secondary'}>
            {isSelected ? '▶ ' : '  '}
          </StyledText>
          
          {/* Bookmark indicator */}
          <StyledText type={conversation.bookmarked ? 'warning' : 'secondary'}>
            {conversation.bookmarked ? '★ ' : '☆ '}
          </StyledText>
          
          {/* Title */}
          <StyledText type={isSelected ? 'primary' : 'secondary'} bold={isSelected}>
            {formatted.title}
          </StyledText>
          
          {/* Branch indicator */}
          {conversation.branch && (
            <>
              <StyledText type="secondary"> | </StyledText>
              <StyledText type="info">
                ⑃ {conversation.branch}
              </StyledText>
            </>
          )}
        </Box>
        
        {/* Preview and metadata */}
        <Box flexDirection="column" marginLeft={4}>
          <StyledText type="secondary">
            {formatted.preview}
          </StyledText>
          
          <Box flexDirection="row" justifyContent="space-between">
            <StyledText type="secondary">
              {formatted.metadata}
            </StyledText>
            
            {/* Tags */}
            {conversation.tags.length > 0 && (
              <Box flexDirection="row">
                {conversation.tags.slice(0, 3).map(tag => (
                  <StyledText key={tag} type="info">
                    #{tag}{' '}
                  </StyledText>
                ))}
                {conversation.tags.length > 3 && (
                  <StyledText type="secondary">
                    +{conversation.tags.length - 3}
                  </StyledText>
                )}
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    );
  };

  // Render timeline view
  const renderTimelineView = () => {
    return (
      <Box flexDirection="column">
        {timelineGroups.map(([timeGroup, conversations]) => (
          <Box key={timeGroup} flexDirection="column" marginBottom={1}>
            <StyledText type="warning" bold>
              {timeGroup}
            </StyledText>
            <Box flexDirection="column" marginLeft={2}>
              {conversations.map((conversation, index) => 
                renderConversationItem(conversation, index)
              )}
            </Box>
          </Box>
        ))}
      </Box>
    );
  };

  // Render search interface
  const renderSearchInterface = () => {
    if (!searchMode) return null;

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box flexDirection="row" alignItems="center">
          <StyledText type="info">Search: </StyledText>
          <StyledText type="primary" bold>
            {localSearchQuery || '_'}
          </StyledText>
        </Box>
        
        <Box flexDirection="row">
          <StyledText type="secondary">
            {filteredConversations.length} of {conversations.length} conversations
          </StyledText>
          
          {filterTags.length > 0 && (
            <>
              <StyledText type="secondary"> | Tags: </StyledText>
              {filterTags.map(tag => (
                <StyledText key={tag} type="info">
                  #{tag}{' '}
                </StyledText>
              ))}
            </>
          )}
          
          {showBookmarkedOnly && (
            <>
              <StyledText type="secondary"> | </StyledText>
              <StyledText type="warning">Bookmarked only</StyledText>
            </>
          )}
        </Box>
      </Box>
    );
  };

  if (conversations.length === 0) {
    return (
      <StyledBox noBorder>
        <Box flexDirection="column" alignItems="center" padding={2}>
          <StyledText type="secondary">
            No conversation history available
          </StyledText>
          <StyledText type="secondary">
            Start a conversation to build your history
          </StyledText>
        </Box>
      </StyledBox>
    );
  }

  return (
    <StyledBox noBorder>
      <Box flexDirection="column" width="100%">
        {/* Header */}
        <Box flexDirection="row" justifyContent="space-between" paddingX={1} marginBottom={1}>
          <StyledText type="primary" bold>
            Conversation History
          </StyledText>
          
          <Box flexDirection="row" alignItems="center">
            {/* View mode indicators */}
            <StyledText type={showTimeline ? 'info' : 'secondary'}>
              Timeline
            </StyledText>
            <StyledText type="secondary"> | </StyledText>
            <StyledText type={searchMode ? 'info' : 'secondary'}>
              Search
            </StyledText>
            
            {/* Count */}
            <StyledText type="secondary">
              {' '}({filteredConversations.length})
            </StyledText>
          </Box>
        </Box>

        {/* Search interface */}
        {renderSearchInterface()}

        {/* Conversation list */}
        <Box flexDirection="column" flexGrow={1}>
          {showTimeline ? renderTimelineView() : (
            filteredConversations.map((conversation, index) => 
              renderConversationItem(conversation, index)
            )
          )}
        </Box>

        {/* Footer with instructions */}
        <Box marginTop={1} paddingX={1}>
          <StyledText type="secondary">
            Enter: select • Space: bookmark • /: search • t: timeline • b: bookmarks
          </StyledText>
        </Box>
      </Box>
    </StyledBox>
  );
};

/**
 * Hook for managing conversation history state
 */
export const useConversationHistory = () => {
  const [conversations, setConversations] = useState<ConversationEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);

  // Add new conversation
  const addConversation = (conversation: Omit<ConversationEntry, 'id'>) => {
    const newConversation: ConversationEntry = {
      ...conversation,
      id: `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    setConversations(prev => [newConversation, ...prev]);
    return newConversation.id;
  };

  // Update conversation
  const updateConversation = (id: string, updates: Partial<ConversationEntry>) => {
    setConversations(prev => 
      prev.map(conv => 
        conv.id === id ? { ...conv, ...updates, lastActivity: Date.now() } : conv
      )
    );
  };

  // Toggle bookmark
  const toggleBookmark = (id: string) => {
    setConversations(prev => 
      prev.map(conv => 
        conv.id === id ? { ...conv, bookmarked: !conv.bookmarked } : conv
      )
    );
  };

  // Add/remove tags
  const updateTags = (id: string, tags: string[]) => {
    setConversations(prev => 
      prev.map(conv => 
        conv.id === id ? { ...conv, tags: [...new Set(tags)] } : conv
      )
    );
  };

  // Create conversation branch
  const createBranch = (id: string, branchName: string) => {
    const original = conversations.find(conv => conv.id === id);
    if (!original) return null;

    const branchedConversation: ConversationEntry = {
      ...original,
      id: `${id}-branch-${Date.now()}`,
      title: `${original.title} (${branchName})`,
      branch: branchName,
      timestamp: Date.now(),
      lastActivity: Date.now()
    };

    setConversations(prev => [branchedConversation, ...prev]);
    return branchedConversation.id;
  };

  return {
    conversations,
    selectedId,
    searchQuery,
    filterTags,
    showBookmarkedOnly,
    setSelectedId,
    setSearchQuery,
    setFilterTags,
    setShowBookmarkedOnly,
    addConversation,
    updateConversation,
    toggleBookmark,
    updateTags,
    createBranch
  };
};

// Helper functions
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

function formatTimelineGroup(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const inputDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  if (inputDate.getTime() === today.getTime()) return 'Today';
  if (inputDate.getTime() === yesterday.getTime()) return 'Yesterday';
  
  const diffDays = Math.floor((today.getTime() - inputDate.getTime()) / 86400000);
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  
  return date.toLocaleDateString();
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

export default ConversationHistory;