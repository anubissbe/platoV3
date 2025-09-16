const mockChalk = {
  blue: jest.fn((text: string) => text),
  green: jest.fn((text: string) => text),
  yellow: jest.fn((text: string) => text),
  red: jest.fn((text: string) => text),
  white: jest.fn((text: string) => text),
  gray: jest.fn((text: string) => text),
  cyan: jest.fn((text: string) => text),
  magenta: jest.fn((text: string) => text),
  bold: jest.fn((text: string) => text),
  dim: jest.fn((text: string) => text),
  italic: jest.fn((text: string) => text),
  underline: jest.fn((text: string) => text),
  bgBlue: jest.fn((text: string) => text),
  bgGreen: jest.fn((text: string) => text),
  bgYellow: jest.fn((text: string) => text),
  bgRed: jest.fn((text: string) => text),
};

export default mockChalk;