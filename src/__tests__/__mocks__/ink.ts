import React from 'react';

export const Box = jest.fn().mockImplementation((props: any) => React.createElement('div', props));
export const Text = jest.fn().mockImplementation((props: any) => React.createElement('span', props));
export const render = jest.fn().mockImplementation(() => ({
  lastFrame: () => 'mocked output',
  rerender: jest.fn(),
  waitUntilExit: jest.fn().mockResolvedValue(undefined),
}));
export const useApp = jest.fn(() => ({ exit: jest.fn() }));
export const useInput = jest.fn();
export const useStdin = jest.fn(() => ({
  stdin: {
    setRawMode: jest.fn(),
    isRaw: false,
    write: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  },
  setRawMode: jest.fn(),
  isRawModeSupported: false,
}));
export const useEffect = React.useEffect;
export const useState = React.useState;
export const useRef = React.useRef;
export const useMemo = React.useMemo;