export const render = jest.fn().mockImplementation((component: any) => ({
  lastFrame: jest.fn().mockImplementation(() => {
    // Mock the rendering by extracting text content from the component
    if (component && component.props && component.props.children) {
      return component.props.children;
    }
    return "mocked component output";
  }),
  rerender: jest.fn(),
  waitUntilExit: jest.fn().mockResolvedValue(undefined),
  stdin: {
    write: jest.fn(),
  },
  stderr: "",
  frames: [],
}));