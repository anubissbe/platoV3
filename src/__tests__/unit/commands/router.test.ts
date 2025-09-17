import { parseCommand } from "../../../commands/router.js";

describe("parseCommand", () => {
  describe("basic functionality", () => {
    it("should parse simple command without arguments", () => {
      const result = parseCommand("/help");
      expect(result).toEqual({
        command: "help",
        args: []
      });
    });

    it("should parse command with simple arguments", () => {
      const result = parseCommand("/search pattern file.txt");
      expect(result).toEqual({
        command: "search",
        args: ["pattern", "file.txt"]
      });
    });

    it("should return null for non-slash commands", () => {
      const result = parseCommand("help");
      expect(result).toBeNull();
    });

    it("should return null for escaped slash commands", () => {
      const result = parseCommand("\\/help");
      expect(result).toBeNull();
    });

    it("should return null for empty commands", () => {
      const result = parseCommand("/");
      expect(result).toBeNull();
    });

    it("should handle commands with extra whitespace", () => {
      const result = parseCommand("  /help   arg1   arg2  ");
      expect(result).toEqual({
        command: "help",
        args: ["arg1", "arg2"]
      });
    });
  });

  describe("quoted string handling", () => {
    it("should handle double-quoted strings with spaces", () => {
      const result = parseCommand('/search "hello world" file.txt');
      expect(result).toEqual({
        command: "search",
        args: ["hello world", "file.txt"]
      });
    });

    it("should handle single-quoted strings with spaces", () => {
      const result = parseCommand("/search 'hello world' file.txt");
      expect(result).toEqual({
        command: "search",
        args: ["hello world", "file.txt"]
      });
    });

    it("should handle multiple quoted arguments", () => {
      const result = parseCommand('/edit "file name.txt" "new content" --flag');
      expect(result).toEqual({
        command: "edit",
        args: ["file name.txt", "new content", "--flag"]
      });
    });

    it("should handle quoted strings at the end", () => {
      const result = parseCommand('/create file.txt "content with spaces"');
      expect(result).toEqual({
        command: "create",
        args: ["file.txt", "content with spaces"]
      });
    });

    it("should handle mixed quoted and unquoted arguments", () => {
      const result = parseCommand('/run echo "hello world" arg2 "another quote"');
      expect(result).toEqual({
        command: "run",
        args: ["echo", "hello world", "arg2", "another quote"]
      });
    });

    it("should handle empty quoted strings", () => {
      const result = parseCommand('/search "" file.txt');
      expect(result).toEqual({
        command: "search",
        args: ["", "file.txt"]
      });
    });

    it("should handle quotes at word boundaries", () => {
      const result = parseCommand('/search pattern"with quotes"end');
      expect(result).toEqual({
        command: "search",
        args: ["patternwith quotesend"]
      });
    });
  });

  describe("escaped quotes", () => {
    it("should handle escaped double quotes", () => {
      const result = parseCommand('/search "hello""world"');
      expect(result).toEqual({
        command: "search",
        args: ["hello\"world"]
      });
    });

    it("should handle escaped single quotes", () => {
      const result = parseCommand("/search 'hello''world'");
      expect(result).toEqual({
        command: "search",
        args: ["hello'world"]
      });
    });

    it("should handle multiple escaped quotes", () => {
      const result = parseCommand('/search "say ""hello"" world"');
      expect(result).toEqual({
        command: "search",
        args: ['say "hello" world']
      });
    });
  });

  describe("edge cases", () => {
    it("should handle unclosed quotes gracefully", () => {
      const result = parseCommand('/search "hello world');
      expect(result).toEqual({
        command: "search",
        args: ["hello world"]
      });
    });

    it("should handle quotes with no content", () => {
      const result = parseCommand('/search ""');
      expect(result).toEqual({
        command: "search",
        args: [""]
      });
    });

    it("should handle mixed quote types", () => {
      const result = parseCommand("/search \"hello 'world'\" file.txt");
      expect(result).toEqual({
        command: "search",
        args: ["hello 'world'", "file.txt"]
      });
    });

    it("should handle tabs and multiple spaces", () => {
      const result = parseCommand('/search\t"hello\tworld"\t\tfile.txt');
      expect(result).toEqual({
        command: "search",
        args: ["hello\tworld", "file.txt"]
      });
    });

    it("should preserve case for arguments but lowercase command", () => {
      const result = parseCommand('/SEARCH "Hello World" FILE.TXT');
      expect(result).toEqual({
        command: "search",
        args: ["Hello World", "FILE.TXT"]
      });
    });
  });

  describe("real-world scenarios", () => {
    it("should handle search with quoted pattern", () => {
      const result = parseCommand('/search "function authenticate" src/');
      expect(result).toEqual({
        command: "search",
        args: ["function authenticate", "src/"]
      });
    });

    it("should handle git commit with quoted message", () => {
      const result = parseCommand('/git commit -m "Fix: resolve authentication issue"');
      expect(result).toEqual({
        command: "git",
        args: ["commit", "-m", "Fix: resolve authentication issue"]
      });
    });

    it("should handle file creation with spaces in name and content", () => {
      const result = parseCommand('/create "test file.txt" "This is the content"');
      expect(result).toEqual({
        command: "create",
        args: ["test file.txt", "This is the content"]
      });
    });

    it("should handle complex shell commands", () => {
      const result = parseCommand('/run grep -r "console.log" . --include="*.ts"');
      expect(result).toEqual({
        command: "run",
        args: ["grep", "-r", "console.log", ".", "--include=*.ts"]
      });
    });
  });
});