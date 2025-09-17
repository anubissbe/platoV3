const stripAnsi = jest.fn().mockImplementation((text: string) => {
  // Remove ANSI escape codes from text
  if (typeof text !== 'string') return '';
  return text.replace(/\x1b\[[0-9;]*m/g, '');
});

export default stripAnsi;