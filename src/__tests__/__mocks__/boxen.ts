const boxen = jest.fn().mockImplementation((text: string, options?: any) => {
  if (typeof text !== 'string') return '';

  const width = options?.width || 40;
  const padding = options?.padding || { top: 0, bottom: 0, left: 1, right: 1 };
  const lines = text.split('\n');
  const maxLineLength = Math.max(...lines.map(line => line.length));
  const boxWidth = Math.max(width, maxLineLength + padding.left + padding.right + 2);

  const topBorder = '╭' + '─'.repeat(boxWidth - 2) + '╮';
  const bottomBorder = '╰' + '─'.repeat(boxWidth - 2) + '╯';

  const contentLines = lines.map(line => {
    const paddedLine = ' '.repeat(padding.left) + line + ' '.repeat(padding.right);
    const remainingSpace = boxWidth - paddedLine.length - 2;
    return '│' + paddedLine + ' '.repeat(Math.max(0, remainingSpace)) + '│';
  });

  return [topBorder, ...contentLines, bottomBorder].join('\n');
});

export default boxen;