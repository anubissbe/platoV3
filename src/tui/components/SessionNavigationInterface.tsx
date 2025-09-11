import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { StyledBox, StyledText } from '../../styles/components.js';
import { getStyleManager } from '../../styles/manager.js';
import { ConversationHistory, ConversationEntry, useConversationHistory } from './ConversationHistory.js';
import { SessionIndicator, SessionData, useSessionManagement } from './SessionIndicator.js';

export interface SessionNavigationProps {
  isVisible?: boolean;
  width?: number;
  height?: number;
  onSessionSelect?: (sessionId: string) => void;
  onConversationSelect?: (conversationId: string) => void;
  onClose?: () => void;
  initialSessionData?: SessionData;
  conversations?: ConversationEntry[];
}

/**
 * SessionNavigationInterface - Comprehensive session and conversation management
 * Provides visual feedback for session operations, history navigation, and data management
 */
export const SessionNavigationInterface: React.FC<SessionNavigationProps> = ({
  isVisible = false,
  width = 60,
  height = 20,
  onSessionSelect,
  onConversationSelect,
  onClose,
  initialSessionData,
  conversations = []
}) => {
  const [activeTab, setActiveTab] = useState<'sessions' | 'history' | 'export'>('sessions');
  const [searchMode, setSearchMode] = useState(false);
  const [exportData, setExportData] = useState<string>('');

  const manager = getStyleManager();
  const style = manager.getStyle();

  // Session management
  const {
    session,
    saveStatus,
    createSession,
    updateSession,
    saveSession,
    exportSession,
    importSession
  } = useSessionManagement(initialSessionData);

  // Conversation history management
  const {
    conversations: historyConversations,
    selectedId: selectedConversationId,
    searchQuery,
    filterTags,
    showBookmarkedOnly,
    setSelectedId: setSelectedConversationId,
    setSearchQuery,
    setFilterTags,
    setShowBookmarkedOnly,
    addConversation,
    updateConversation,
    toggleBookmark,
    updateTags,
    createBranch
  } = useConversationHistory();

  // Initialize with provided conversations
  useEffect(() => {
    if (conversations.length > 0 && historyConversations.length === 0) {
      conversations.forEach(conv => {
        addConversation({
          timestamp: conv.timestamp,
          title: conv.title,
          messageCount: conv.messageCount,
          lastActivity: conv.lastActivity,
          tags: conv.tags,
          bookmarked: conv.bookmarked,
          preview: conv.preview,
          branch: conv.branch
        });
      });
    }
  }, [conversations, historyConversations.length, addConversation]);

  // Handle session operations
  const handleSessionSave = async () => {
    await saveSession();
  };

  const handleSessionExport = async () => {
    const data = await exportSession();
    if (data) {
      setExportData(data);
      setActiveTab('export');
    }
  };

  const handleSessionImport = async (data: string) => {
    const success = await importSession(data);
    if (success && onSessionSelect && session) {
      onSessionSelect(session.id);
    }
    return success;
  };

  // Handle conversation operations
  const handleConversationSelect = (conversation: ConversationEntry) => {
    setSelectedConversationId(conversation.id);
    onConversationSelect?.(conversation.id);
  };

  const handleConversationBookmark = (id: string, bookmarked: boolean) => {
    toggleBookmark(id);
  };

  const handleConversationTag = (id: string, tags: string[]) => {
    updateTags(id, tags);
  };

  const handleConversationBranch = (id: string, branchName: string) => {
    const newId = createBranch(id, branchName);
    if (newId && onConversationSelect) {
      onConversationSelect(newId);
    }
  };

  // Render tab navigation
  const renderTabNavigation = () => {
    const tabs = [
      { id: 'sessions', label: 'Sessions', icon: '💾' },
      { id: 'history', label: 'History', icon: '📋' },
      { id: 'export', label: 'Export/Import', icon: '📤' }
    ] as const;

    return (
      <Box flexDirection="row" marginBottom={1}>
        {tabs.map(tab => (
          <Box key={tab.id} marginRight={2}>
            <StyledText
              type={activeTab === tab.id ? 'primary' : 'secondary'}
              bold={activeTab === tab.id}
            >
              {tab.icon} {tab.label}
            </StyledText>
          </Box>
        ))}
      </Box>
    );
  };

  // Render session management tab
  const renderSessionTab = () => {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <StyledText type="primary" bold>
          Current Session
        </StyledText>
        
        {session ? (
          <Box flexDirection="column">
            <SessionIndicator
              session={session}
              showSaveStatus={true}
              showExportOption={true}
              onSave={handleSessionSave}
              onExport={handleSessionExport}
              onImport={async () => {
                // This would open an import dialog in a real implementation
                return true;
              }}
            />
            
            <Box marginTop={2} flexDirection="column">
              <StyledText type="secondary">
                Session Details:
              </StyledText>
              
              <Box flexDirection="column" marginLeft={2}>
                <StyledText type="info">
                  ID: {session.id}
                </StyledText>
                <StyledText type="info">
                  Messages: {session.messageCount}
                </StyledText>
                <StyledText type="info">
                  Started: {new Date(session.timestamp).toLocaleString()}
                </StyledText>
                {session.lastSaved && (
                  <StyledText type="success">
                    Last Saved: {new Date(session.lastSaved).toLocaleString()}
                  </StyledText>
                )}
              </Box>
            </Box>
            
            <Box marginTop={2} flexDirection="row">
              <StyledText type="secondary">
                Actions: Space (save) • E (export) • I (import) • N (new session)
              </StyledText>
            </Box>
          </Box>
        ) : (
          <Box flexDirection="column" alignItems="center" marginTop={4}>
            <StyledText type="secondary">
              No active session
            </StyledText>
            <StyledText type="info">
              Press N to create a new session
            </StyledText>
          </Box>
        )}
      </Box>
    );
  };

  // Render history tab
  const renderHistoryTab = () => {
    return (
      <ConversationHistory
        conversations={historyConversations}
        selectedId={selectedConversationId}
        searchQuery={searchQuery}
        filterTags={filterTags}
        showBookmarkedOnly={showBookmarkedOnly}
        showTimeline={false}
        maxVisible={height - 8}
        onSelect={handleConversationSelect}
        onBookmark={handleConversationBookmark}
        onTag={handleConversationTag}
        onBranch={handleConversationBranch}
        onSearch={setSearchQuery}
      />
    );
  };

  // Render export/import tab
  const renderExportTab = () => {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <StyledText type="primary" bold>
          Export/Import Data
        </StyledText>
        
        <Box flexDirection="column" marginBottom={2}>
          <StyledText type="secondary">
            Export Format:
          </StyledText>
          
          <Box borderStyle="single" padding={1} backgroundColor="gray">
            <Text wrap="wrap">
              {exportData || 'No export data available. Click "Export Session" to generate.'}
            </Text>
          </Box>
        </Box>
        
        <Box flexDirection="column">
          <StyledText type="secondary">
            Available Actions:
          </StyledText>
          
          <Box flexDirection="column" marginLeft={2}>
            <StyledText type="info">
              • E: Export current session
            </StyledText>
            <StyledText type="info">
              • I: Import session from clipboard
            </StyledText>
            <StyledText type="info">
              • C: Copy export data to clipboard
            </StyledText>
            <StyledText type="info">
              • R: Reset export data
            </StyledText>
          </Box>
        </Box>
      </Box>
    );
  };

  if (!isVisible) {
    return null;
  }

  return (
    <StyledBox noBorder>
      <Box
        flexDirection="column"
        width={width}
        height={height}
        borderStyle="double"
        borderColor="cyan"
        padding={1}
      >
        {/* Header */}
        <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
          <StyledText type="primary" bold>
            Session Management
          </StyledText>
          <StyledText type="secondary">
            Esc: close
          </StyledText>
        </Box>

        {/* Tab navigation */}
        {renderTabNavigation()}

        {/* Tab content */}
        <Box flexGrow={1}>
          {activeTab === 'sessions' && renderSessionTab()}
          {activeTab === 'history' && renderHistoryTab()}
          {activeTab === 'export' && renderExportTab()}
        </Box>

        {/* Footer */}
        <Box marginTop={1}>
          <StyledText type="secondary">
            Tab: switch tabs • ↑↓: navigate • Enter: select • ?: help
          </StyledText>
        </Box>
      </Box>
    </StyledBox>
  );
};

/**
 * Hook for managing session navigation interface state
 */
export const useSessionNavigationInterface = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [activeSession, setActiveSession] = useState<SessionData | undefined>();
  const [conversations, setConversations] = useState<ConversationEntry[]>([]);

  // Show the interface
  const showInterface = () => setIsVisible(true);

  // Hide the interface
  const hideInterface = () => setIsVisible(false);

  // Toggle interface visibility
  const toggleInterface = () => setIsVisible(prev => !prev);

  // Update session data
  const updateSessionData = (sessionData: SessionData) => {
    setActiveSession(sessionData);
  };

  // Add conversation to history
  const addConversationToHistory = (conversation: Omit<ConversationEntry, 'id'>) => {
    const newConversation: ConversationEntry = {
      ...conversation,
      id: `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    setConversations(prev => [newConversation, ...prev]);
    return newConversation.id;
  };

  return {
    isVisible,
    activeSession,
    conversations,
    showInterface,
    hideInterface,
    toggleInterface,
    updateSessionData,
    addConversationToHistory
  };
};

export default SessionNavigationInterface;