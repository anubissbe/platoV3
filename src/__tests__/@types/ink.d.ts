declare module "ink" {
  import React from "react";

  export interface BoxProps {
    flexDirection?: "row" | "column";
    height?: number;
    width?: number;
    padding?: number;
    paddingX?: number;
    paddingY?: number;
    margin?: number;
    marginX?: number;
    marginY?: number;
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    flexGrow?: number;
    flexShrink?: number;
    flexBasis?: number;
    alignItems?: "flex-start" | "center" | "flex-end" | "stretch";
    justifyContent?:
      | "flex-start"
      | "center"
      | "flex-end"
      | "space-between"
      | "space-around";
    overflow?: "visible" | "hidden";
    position?: "relative" | "absolute";
    borderStyle?: "single" | "double" | "round" | "bold" | "classic";
    borderColor?: string;
    children?: React.ReactNode;
  }

  export interface TextProps {
    color?: string;
    backgroundColor?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    children?: React.ReactNode;
  }

  export const Box: React.FC<BoxProps>;
  export const Text: React.FC<TextProps>;

  export interface RenderResult {
    lastFrame(): string;
    rerender(element: React.ReactElement): void;
    waitUntilExit(): Promise<void>;
  }

  export function render(element: React.ReactElement): RenderResult;

  export function useApp(): {
    exit(): void;
  };

  export function useInput(handler: (input: string, key: any) => void): void;

  export function useStdin(): {
    stdin: NodeJS.ReadStream;
    setRawMode: (enabled: boolean) => void;
    isRawModeSupported: boolean;
  };
}
