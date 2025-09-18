// Built-in output styles

import { OutputStyle } from "./types.js";

export const defaultStyle: OutputStyle = {
  name: "default",
  description: "Claude Code classic appearance",
  theme: {
    primary: "white",
    secondary: "gray",
    success: "green",
    error: "red",
    warning: "yellow",
    info: "blue",
    muted: "gray",
    border: "blue",
    spinner: "cyan",
    selection: "cyan",
  },
  formatting: {
    bold: true,
    italic: false,
    underline: false,
    padding: 1,
    margin: 0,
    borderStyle: "round",
    showIcons: true,
    showTimestamps: false,
    showLineNumbers: false,
  },
  components: {
    welcome: {
      icon: "✻",
      text: "Welcome to {name}!",
    },
    statusLine: {
      format: "{mode} | {context} | {session}",
      separator: " | ",
    },
    fileWrite: {
      icon: "📝",
      format: "Writing {file}...",
      success: "✓ Wrote {lines} lines to {file}",
    },
    error: {
      icon: "❌",
      format: "Error: {message}",
    },
    toolCall: {
      icon: "🔧",
      format: "Running tool: {name}",
    },
  },
};

export const minimalStyle: OutputStyle = {
  name: "minimal",
  description: "Clean, distraction-free output",
  theme: {
    primary: "white",
    secondary: "gray",
    success: "green",
    error: "red",
    warning: "yellow",
    info: "white",
    muted: "gray",
    border: "gray",
    spinner: "white",
    selection: "white",
  },
  formatting: {
    bold: false,
    italic: false,
    underline: false,
    padding: 0,
    margin: 0,
    borderStyle: "none",
    showIcons: false,
    showTimestamps: false,
    showLineNumbers: false,
  },
  components: {
    welcome: {
      icon: "",
      text: "{name} ready",
    },
    statusLine: {
      format: "{mode}",
      separator: " ",
    },
    fileWrite: {
      icon: "",
      format: "write: {file}",
      success: "done: {lines} lines",
    },
    error: {
      icon: "",
      format: "error: {message}",
    },
    toolCall: {
      icon: "",
      format: "tool: {name}",
    },
  },
};

export const verboseStyle: OutputStyle = {
  name: "verbose",
  description: "Detailed output with timestamps",
  theme: {
    primary: "white",
    secondary: "cyan",
    success: "green",
    error: "red",
    warning: "yellow",
    info: "blue",
    muted: "gray",
    border: "cyan",
    spinner: "magenta",
    selection: "cyan",
  },
  formatting: {
    bold: true,
    italic: false,
    underline: false,
    padding: 1,
    margin: 0,
    borderStyle: "double",
    showIcons: true,
    showTimestamps: true,
    showLineNumbers: true,
  },
  components: {
    welcome: {
      icon: "🚀",
      text: "=== Welcome to {name} ===",
    },
    statusLine: {
      format: "[{timestamp}] {mode} | {context} | {session} | {tokens}",
      separator: " | ",
    },
    fileWrite: {
      icon: "📝",
      format: "[{timestamp}] Writing to {file}...",
      success: "[{timestamp}] ✓ Successfully wrote {lines} lines to {file}",
    },
    error: {
      icon: "⚠️",
      format: "[{timestamp}] ERROR: {message}",
    },
    toolCall: {
      icon: "⚙️",
      format: "[{timestamp}] Executing tool: {name} with args: {args}",
    },
  },
};

export const emojiStyle: OutputStyle = {
  name: "emoji",
  description: "Expressive output with emojis",
  theme: {
    primary: "white",
    secondary: "cyan",
    success: "green",
    error: "red",
    warning: "yellow",
    info: "blue",
    muted: "gray",
    border: "magenta",
    spinner: "cyan",
    selection: "cyan",
  },
  formatting: {
    bold: true,
    italic: false,
    underline: false,
    padding: 1,
    margin: 0,
    borderStyle: "round",
    showIcons: true,
    showTimestamps: false,
    showLineNumbers: false,
  },
  components: {
    welcome: {
      icon: "🎉",
      text: "Welcome to {name}! 🚀",
    },
    statusLine: {
      format: "🔧 {mode} | 📁 {context} | 🔗 {session}",
      separator: " | ",
    },
    fileWrite: {
      icon: "✍️",
      format: "Writing {file}... ⏳",
      success: "✅ Wrote {lines} lines to {file} 🎯",
    },
    error: {
      icon: "🚨",
      format: "Error: {message} 💥",
    },
    toolCall: {
      icon: "🛠️",
      format: "Running tool: {name} ⚡",
    },
  },
};

export const technicalStyle: OutputStyle = {
  name: "technical",
  description: "Precise technical output",
  theme: {
    primary: "white",
    secondary: "gray",
    success: "green",
    error: "red",
    warning: "yellow",
    info: "cyan",
    muted: "gray",
    border: "white",
    spinner: "white",
    selection: "white",
  },
  formatting: {
    bold: false,
    italic: false,
    underline: false,
    padding: 0,
    margin: 0,
    borderStyle: "single",
    showIcons: false,
    showTimestamps: true,
    showLineNumbers: true,
  },
  components: {
    welcome: {
      icon: "",
      text: "PLATO_INIT: {name}",
    },
    statusLine: {
      format: "MODE={mode} CTX={context} SID={session}",
      separator: " ",
    },
    fileWrite: {
      icon: "",
      format: "FILE_WRITE: {file}",
      success: "FILE_WRITE_OK: {lines} bytes -> {file}",
    },
    error: {
      icon: "",
      format: "ERROR: {message}",
    },
    toolCall: {
      icon: "",
      format: "EXEC: {name}",
    },
  },
};

export const BUILTIN_STYLES = {
  default: defaultStyle,
  minimal: minimalStyle,
  verbose: verboseStyle,
  emoji: emojiStyle,
  technical: technicalStyle,
};
