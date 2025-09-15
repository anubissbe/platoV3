import fs from "fs/promises";
import path from "path";
import os from "os";
import YAML from "yaml";
import type { OutputStyle } from "./styles/types.js";

export type Config = {
  provider?: {
    active?: "copilot";
    copilot?: {
      client_id?: string;
      headers?: Record<string, string>;
      base_url?: string;
      chat_path?: string;
    };
  };
  model?: { active?: string };
  statusline?: { format?: string; enabled?: boolean };
  editing?: { autoApply?: "on" | "off" };
  privacy?: {
    redact?: boolean;
    prompt_on_large_payloads?: boolean;
    max_payload_mb?: number;
    skip_all_prompts?: boolean; // for --dangerously-skip-permissions
    dangerous_mode?: boolean; // headless mode flag
  };
  context?: {
    roots?: string[];
    selected?: string[];
  };
  toolCallPreset?: {
    enabled?: boolean;
    strictOnly?: boolean; // if true, accept only fenced JSON tool_call schema
    allowHeuristics?: boolean; // if true, allow legacy heuristics when strictOnly is false
    messageOverride?: string; // custom one-liner message
    overrides?: Record<string, string>; // per-model overrides by model id
  };
  outputStyle?: {
    active?: string;
    custom?: OutputStyle[];
  };
  status?: {
    enabled?: boolean;
    position?: "top" | "bottom";
    showStatusLine?: boolean;
    showProgressBar?: boolean;
    compactMode?: boolean;
    theme?: "light" | "dark";
    updateInterval?: number;
    visibleMetrics?: string[];
    progressBarWidth?: number;
    showStreamingProgress?: boolean;
    showToolCallProgress?: boolean;
    pulseOnUpdate?: boolean;
    showSpinner?: boolean;
  };
  permissions?: {
    enabled?: boolean;
    activeProfile?: string;
    defaultAction?: "allow" | "deny" | "prompt";
    uiEnabled?: boolean;
    showProfileIndicator?: boolean;
    profilePath?: string;
    auditPath?: string;
    mcpPermissionsPath?: string;
    globalRules?: Array<{
      pattern: string;
      action: "allow" | "deny" | "prompt";
      priority?: number;
    }>;
    protectedPaths?: string[];
    safeMode?: boolean;
    emergencyStop?: boolean;
    autoSwitchProfiles?: boolean;
    interactivePrompts?: boolean;
    auditSettings?: {
      enabled?: boolean;
      maxLogSize?: number;
      maxLogFiles?: number;
      retentionDays?: number;
    };
  };
};

const HOME = os.homedir();
const GLOBAL_DIR = path.join(HOME, ".config", "plato");
const GLOBAL_CFG = path.join(GLOBAL_DIR, "config.yaml");
const PROJECT_DIR = path.join(process.cwd(), ".plato");
const PROJECT_CFG = path.join(PROJECT_DIR, "config.yaml");

let cached: Config | null = null;

export async function ensureConfigLoaded() {
  if (!cached) await loadConfig();
}

export async function loadConfig(): Promise<Config> {
  const [g, p] = await Promise.all([
    readYamlSafe(GLOBAL_CFG),
    readYamlSafe(PROJECT_CFG),
  ]);
  cached = mergeConfig(g || {}, p || {});
  if (!cached.provider) cached.provider = { active: "copilot", copilot: {} };
  if (!cached.provider.copilot) cached.provider.copilot = {};
  if (!cached.provider.copilot.base_url)
    cached.provider.copilot.base_url = "https://api.githubcopilot.com";
  if (!cached.provider.copilot.chat_path)
    cached.provider.copilot.chat_path = "/v1/chat/completions";
  if (!cached.model) cached.model = { active: "gpt-4o" };
  else if (!cached.model.active) cached.model.active = "gpt-4o";
  if (!cached.editing) cached.editing = { autoApply: "on" };
  if (!cached.context)
    cached.context = { roots: [process.cwd()], selected: [] };
  if (!cached.toolCallPreset)
    cached.toolCallPreset = { enabled: true, strictOnly: true };

  // Initialize permission system defaults
  if (!cached.permissions) {
    cached.permissions = {
      enabled: true,
      activeProfile: "development",
      defaultAction: "prompt",
      uiEnabled: true,
      showProfileIndicator: true,
      profilePath: ".plato/permissions.yml",
      auditPath: ".plato/audit",
      mcpPermissionsPath: ".plato/mcp-permissions.yml",
      globalRules: [],
      protectedPaths: ["/etc", "/sys", "/proc", "/boot"],
      safeMode: false,
      emergencyStop: false,
      autoSwitchProfiles: true,
      interactivePrompts: true,
      auditSettings: {
        enabled: true,
        maxLogSize: 10 * 1024 * 1024, // 10MB
        maxLogFiles: 10,
        retentionDays: 30,
      },
    };
  }

  return cached;
}

export async function setConfigValue(
  key: string,
  value: string,
): Promise<void> {
  // Type coercion based on known keys
  let parsedValue: any = value;

  // Boolean fields
  if (
    [
      "telemetry",
      "vimMode",
      "autoApply",
      "permissions.enabled",
      "permissions.uiEnabled",
      "permissions.showProfileIndicator",
      "permissions.safeMode",
      "permissions.emergencyStop",
      "permissions.autoSwitchProfiles",
      "permissions.interactivePrompts",
    ].includes(key)
  ) {
    parsedValue = value === "true" || value === "on";
  }
  // Number fields
  else if (
    [
      "port",
      "timeout",
      "maxRetries",
      "permissions.auditSettings.maxLogSize",
      "permissions.auditSettings.maxLogFiles",
      "permissions.auditSettings.retentionDays",
    ].includes(key)
  ) {
    parsedValue = Number(value);
    if (isNaN(parsedValue)) {
      throw new Error(`Invalid value for ${key}: expected number`);
    }
  }
  // Permission action validation
  else if (["permissions.defaultAction"].includes(key)) {
    if (!["allow", "deny", "prompt"].includes(value)) {
      throw new Error(
        `Invalid value for ${key}: expected 'allow', 'deny', or 'prompt'`,
      );
    }
    parsedValue = value;
  }
  // JSON fields
  else if (["toolCallPreset", "statusline", "editing"].includes(key)) {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      throw new Error(`Invalid value for ${key}: expected valid JSON`);
    }
  }

  const cfgObj = await loadConfig();

  // Handle nested keys like 'model.active'
  const keyParts = key.split(".");
  if (keyParts.length === 1) {
    // Simple key
    (cfgObj as any)[key] = parsedValue;
  } else {
    // Nested key
    let current = cfgObj as any;
    for (let i = 0; i < keyParts.length - 1; i++) {
      const part = keyParts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    current[keyParts[keyParts.length - 1]] = parsedValue;
  }

  await saveConfig(cfgObj);
}

export async function saveConfig(cfg: Config): Promise<void> {
  await fs.mkdir(GLOBAL_DIR, { recursive: true });
  await fs.writeFile(GLOBAL_CFG, YAML.stringify(cfg), "utf8");
  cached = null;
}

function tryParse(v: string) {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function mergeConfig(a: Config, b: Config): Config {
  return {
    ...a,
    ...b,
    provider: { ...(a.provider || {}), ...(b.provider || {}) },
    model: { ...(a.model || {}), ...(b.model || {}) },
    statusline: { ...(a.statusline || {}), ...(b.statusline || {}) },
    privacy: { ...(a.privacy || {}), ...(b.privacy || {}) },
    status: { ...(a.status || {}), ...(b.status || {}) },
  };
}

async function readYamlSafe(file: string) {
  try {
    const txt = await fs.readFile(file, "utf8");
    return YAML.parse(txt) || {};
  } catch (e: any) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

export function paths() {
  return { GLOBAL_DIR, GLOBAL_CFG, PROJECT_DIR, PROJECT_CFG };
}

/**
 * Permission system configuration helpers
 */
export async function getPermissionConfig(): Promise<Config["permissions"]> {
  const config = await loadConfig();
  return config.permissions!;
}

export async function setPermissionConfig(
  permissions: Partial<Config["permissions"]>,
): Promise<void> {
  const config = await loadConfig();
  config.permissions = { ...config.permissions!, ...permissions };
  await saveConfig(config);
}

export async function getPermissionPath(
  type: "profile" | "audit" | "mcp",
): Promise<string> {
  const config = await loadConfig();
  const permissions = config.permissions!;

  switch (type) {
    case "profile":
      return path.resolve(permissions.profilePath || ".plato/permissions.yml");
    case "audit":
      return path.resolve(permissions.auditPath || ".plato/audit");
    case "mcp":
      return path.resolve(
        permissions.mcpPermissionsPath || ".plato/mcp-permissions.yml",
      );
    default:
      throw new Error(`Unknown permission path type: ${type}`);
  }
}

export async function isPermissionSystemEnabled(): Promise<boolean> {
  const config = await loadConfig();
  return config.permissions?.enabled !== false;
}

export async function getActivePermissionProfile(): Promise<string> {
  const config = await loadConfig();
  return config.permissions?.activeProfile || "development";
}

export async function setActivePermissionProfile(
  profileName: string,
): Promise<void> {
  await setConfigValue("permissions.activeProfile", profileName);
}

export async function getDefaultPermissionAction(): Promise<
  "allow" | "deny" | "prompt"
> {
  const config = await loadConfig();
  return config.permissions?.defaultAction || "prompt";
}

export async function isPermissionUIEnabled(): Promise<boolean> {
  const config = await loadConfig();
  return config.permissions?.uiEnabled !== false;
}

export async function shouldShowProfileIndicator(): Promise<boolean> {
  const config = await loadConfig();
  return config.permissions?.showProfileIndicator !== false;
}

export async function isPermissionSafeMode(): Promise<boolean> {
  const config = await loadConfig();
  return config.permissions?.safeMode === true;
}

export async function setPermissionSafeMode(enabled: boolean): Promise<void> {
  await setConfigValue("permissions.safeMode", enabled.toString());
}

export async function shouldAutoSwitchProfiles(): Promise<boolean> {
  const config = await loadConfig();
  return config.permissions?.autoSwitchProfiles !== false;
}

export async function areInteractivePromptsEnabled(): Promise<boolean> {
  const config = await loadConfig();
  return config.permissions?.interactivePrompts !== false;
}

export async function getProtectedPaths(): Promise<string[]> {
  const config = await loadConfig();
  return (
    config.permissions?.protectedPaths || ["/etc", "/sys", "/proc", "/boot"]
  );
}

export async function addProtectedPath(pathToProtect: string): Promise<void> {
  const config = await loadConfig();
  const protectedPaths = config.permissions?.protectedPaths || [];
  if (!protectedPaths.includes(pathToProtect)) {
    protectedPaths.push(pathToProtect);
    config.permissions = { ...config.permissions!, protectedPaths };
    await saveConfig(config);
  }
}

export async function removeProtectedPath(pathToRemove: string): Promise<void> {
  const config = await loadConfig();
  const protectedPaths = config.permissions?.protectedPaths || [];
  const filtered = protectedPaths.filter((p) => p !== pathToRemove);
  config.permissions = { ...config.permissions!, protectedPaths: filtered };
  await saveConfig(config);
}
