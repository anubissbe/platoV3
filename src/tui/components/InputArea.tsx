import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';

interface InputAreaProps {
  value: string;
  multiLineValue: string[];
  isMultiLine: boolean;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onNewLine: () => void;
  width: number;
  height?: number;
  showSendButton?: boolean;
  showModeIndicator?: boolean;
}

/**
 * Enhanced input area component matching Claude Code's style
 * - Single-line mode by default, multi-line with Shift+Enter
 * - Visual mode indicators and guides
 * - Proper cursor handling and text wrapping
 */
export const InputArea: React.FC<InputAreaProps> = ({
  value,
  multiLineValue,
  isMultiLine,
  placeholder = 'Message Plato...',
  onSubmit,
  onNewLine,
  width,
  height = 3,
  showSendButton = true,
  showModeIndicator = true,
}) => {
  const [cursorVisible, setCursorVisible] = useState(true);
  const [focusState, setFocusState] = useState(true);
  
  // Cursor blink effect
  useEffect(() => {
    const interval = setInterval(() => {
      setCursorVisible(prev => !prev);
    }, 530); // Standard cursor blink rate
    
    return () => clearInterval(interval);
  }, []);
  
  // Calculate effective height based on mode
  const effectiveHeight = isMultiLine ? Math.max(height, multiLineValue.length + 2) : 1;
  
  // Combine multi-line value for display
  const displayValue = isMultiLine 
    ? multiLineValue.join('\n') + value
    : value;
  
  // Determine if placeholder should be shown
  const showPlaceholder = !displayValue && !isMultiLine;
  
  // Calculate cursor position
  const cursorChar = cursorVisible && focusState ? '▊' : ' ';
  
  // Border styles based on focus state
  const borderColor = focusState ? 'cyan' : 'gray';
  const borderStyle = focusState ? 'round' : 'single';
  
  return (
    <Box
      flexDirection="column"
      width={width}
      marginTop={1}
      paddingLeft={1}
      paddingRight={1}
    >
      {/* Mode indicator */}
      {showModeIndicator && isMultiLine && (
        <Box marginBottom={1}>
          <Text dimColor>
            Multi-line mode • Ctrl+Enter to send • Shift+Enter for new line
          </Text>
        </Box>
      )}
      
      {/* Input area container */}
      <Box
        borderStyle={borderStyle}
        borderColor={borderColor}
        width={width - 2}
        minHeight={effectiveHeight + 2}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={0}
        paddingBottom={0}
      >
        <Box flexDirection="column" width="100%">
          {/* Input content or placeholder */}
          {showPlaceholder ? (
            <Text dimColor>{placeholder}</Text>
          ) : (
            <Box flexDirection="column">
              {isMultiLine && multiLineValue.map((line, index) => (
                <Text key={index}>{line}</Text>
              ))}
              <Box>
                <Text>
                  {value}
                  {cursorChar}
                </Text>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
      
      {/* Bottom helper text */}
      <Box marginTop={1} justifyContent="space-between">
        <Box>
          {!isMultiLine ? (
            <Text dimColor>
              Press Shift+Enter for multi-line • Tab for completions
            </Text>
          ) : (
            <Text dimColor>
              {multiLineValue.length + 1} lines • Press Escape to cancel
            </Text>
          )}
        </Box>
        
        {/* Send button indicator */}
        {showSendButton && value.length > 0 && (
          <Box marginLeft={2}>
            <Text color={isMultiLine ? 'cyan' : 'green'}>
              {isMultiLine ? '[Ctrl+Enter to send]' : '[Enter to send]'}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};

/**
 * Compact input area for limited space environments
 */
export const CompactInputArea: React.FC<Omit<InputAreaProps, 'height'>> = (props) => {
  const { value, placeholder = '> ', width } = props;
  const cursorChar = '▊';
  
  return (
    <Box width={width}>
      <Text>
        {placeholder}
        {value || ''}
        <Text color="cyan">{cursorChar}</Text>
      </Text>
    </Box>
  );
};

/**
 * Input mode indicator component
 */
export const InputModeIndicator: React.FC<{
  mode: 'single' | 'multi' | 'command' | 'search';
  width?: number;
}> = ({ mode, width }) => {
  const modeConfig = {
    single: { icon: '➤', text: 'Single Line', color: 'green' },
    multi: { icon: '▦', text: 'Multi Line', color: 'cyan' },
    command: { icon: '/', text: 'Command', color: 'yellow' },
    search: { icon: '🔍', text: 'Search', color: 'magenta' },
  };
  
  const config = modeConfig[mode];
  
  return (
    <Box width={width} justifyContent="center">
      <Text color={config.color}>
        {config.icon} {config.text}
      </Text>
    </Box>
  );
};