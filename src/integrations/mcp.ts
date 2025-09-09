import fs from 'fs/promises';
import http from 'http';
import { URL } from 'url';
import path from 'path';
import { PermissionManager } from '../permissions/PermissionManager.js';
import { ProfileManager } from '../permissions/ProfileManager.js';
import { AuditLogger } from '../permissions/AuditLogger.js';
import { PermissionQuery } from '../permissions/types.js';

export type Server = { id: string; url: string };
export type MCPServer = Server;
const DB = path.join(process.cwd(), '.plato/mcp-servers.json');

// Permission system instances for MCP operations
let mcpPermissionManager: PermissionManager | null = null;

// Initialize MCP permission system
async function ensureMCPPermissionSystem(): Promise<PermissionManager> {
  if (!mcpPermissionManager) {
    const profileManager = new ProfileManager();
    // ProfileManager doesn't have initialize method
    
    const auditLogger = new AuditLogger({
      logDirectory: '.plato/audit/mcp',
      maxFileSize: 5 * 1024 * 1024, // 5MB
      maxArchiveFiles: 5,
      enableIndexing: true,
    });
    await auditLogger.initialize();
    
    mcpPermissionManager = new PermissionManager({
      profileManager,
      auditLogger,
      configPath: '.plato/mcp-permissions.yml',
    });
    await mcpPermissionManager.initialize();
  }
  return mcpPermissionManager;
}

// Check MCP operation permissions
async function checkMCPPermission(
  operation: string,
  serverId: string,
  toolName?: string,
  input?: any
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const permissionMgr = await ensureMCPPermissionSystem();
    const query: PermissionQuery = {
      tool: 'mcp_operation',
      server: serverId,
      action: operation,
      arguments: toolName ? { tool: toolName, input } : undefined,
      context: {
        source: 'system' as const,
        workspace_path: process.cwd(),
        environment: {
          node_env: process.env.NODE_ENV,
          platform: process.platform,
          node_version: process.version,
        },
        correlation_id: 'mcp-' + Date.now(),
      },
    };

    const result = await permissionMgr.checkPermission(query);
    
    return {
      allowed: result.action === 'allow',
      reason: result.reason,
    };
  } catch (error) {
    console.warn('MCP permission check failed:', error);
    // Fallback: allow operation but log warning
    return { allowed: true, reason: 'Permission system unavailable' };
  }
}

export async function listServers(): Promise<Server[]> {
  try { return JSON.parse(await fs.readFile(DB, 'utf8')) as Server[]; } catch { return []; }
}

export async function attachServer(id: string, url: string) {
  // Check permission to attach MCP server
  const permission = await checkMCPPermission('attach', id);
  if (!permission.allowed) {
    throw new Error(`Permission denied to attach MCP server '${id}': ${permission.reason}`);
  }

  const list = await listServers();
  if (list.find(s=>s.id===id)) throw new Error(`mcp server exists: ${id}`);
  list.push({ id, url });
  await save(list);
}

export async function detachServer(id: string) {
  // Check permission to detach MCP server
  const permission = await checkMCPPermission('detach', id);
  if (!permission.allowed) {
    throw new Error(`Permission denied to detach MCP server '${id}': ${permission.reason}`);
  }

  const list = await listServers();
  const next = list.filter(s=>s.id!==id);
  await save(next);
}

export async function health(id?: string): Promise<{ id: string; ok: boolean; status?: number }[]> {
  const list = await listServers();
  const targets = id ? list.filter(s=>s.id===id) : list;
  const res: { id: string; ok: boolean; status?: number }[] = [];
  for (const s of targets) {
    try {
      const u = new URL(s.url);
      const status = await head(u);
      res.push({ id: s.id, ok: status>=200 && status<500, status });
    } catch { res.push({ id: s.id, ok: false }); }
  }
  return res;
}

async function save(list: Server[]) { await fs.mkdir(path.dirname(DB), { recursive: true }); await fs.writeFile(DB, JSON.stringify(list, null, 2), 'utf8'); }

function head(u: URL): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request({ method: 'HEAD', hostname: u.hostname, port: u.port || (u.protocol==='https:' ? 443 : 80), path: u.pathname || '/', protocol: u.protocol }, (res) => {
      resolve(res.statusCode || 0);
      res.resume();
    });
    req.on('error', reject);
    req.end();
  });
}

export type McpTool = { id: string; name: string; description?: string; input_schema?: any };

export async function listTools(serverId?: string): Promise<{ server: string; tools: McpTool[] }[]> {
  const servers = await listServers();
  const targets = serverId ? servers.filter(s => s.id === serverId) : servers;
  const out: { server: string; tools: McpTool[] }[] = [];
  
  for (const s of targets) {
    // Check permission to list tools for this server
    const permission = await checkMCPPermission('list_tools', s.id);
    if (!permission.allowed) {
      console.warn(`Permission denied to list tools for server '${s.id}': ${permission.reason}`);
      continue;
    }

    const tools = await fetchTools(s).catch(() => [] as McpTool[]);
    out.push({ server: s.id, tools });
  }
  return out;
}

export async function callTool(serverId: string, toolName: string, input: any): Promise<any> {
  const servers = await listServers();
  const s = servers.find(x => x.id === serverId);
  if (!s) throw new Error(`no mcp server: ${serverId}`);

  // Check permission to call this specific tool
  const permission = await checkMCPPermission('call_tool', serverId, toolName, input);
  if (!permission.allowed) {
    throw new Error(`Permission denied to call tool '${toolName}' on server '${serverId}': ${permission.reason}`);
  }
  
  console.log(`🔧 Running tool: ${toolName}... (permission granted)`);
  
  const endpoints = [
    `${s.url.replace(/\/$/,'')}/tools/${encodeURIComponent(toolName)}`,
    `${s.url.replace(/\/$/,'')}/.well-known/mcp/tools/${encodeURIComponent(toolName)}`
  ];
  
  let lastErr: any;
  const retryDelays = [1000, 2000, 4000];
  const retryableCodes = [502, 503, 504, 429];
  const nonRetryableCodes = [400, 401, 403, 404];
  
  for (const ep of endpoints) {
    for (let attempt = 0; attempt <= 3; attempt++) {
      try {
        const r = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input })
        });
        
        if (nonRetryableCodes.includes(r.status)) {
          throw new Error(`Tool call failed: ${r.status} ${r.statusText}`);
        }
        
        if (retryableCodes.includes(r.status) && attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
          continue;
        }
        
        if (!r.ok) {
          lastErr = new Error(`status ${r.status}`);
          break;
        }
        
        const data = await r.json();
        console.log('\x1b[90m' + JSON.stringify(data, null, 2) + '\x1b[0m');
        return data;
      } catch (e) {
        lastErr = e;
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
        }
      }
    }
  }
  throw lastErr || new Error('tool call failed');
}

async function fetchTools(s: Server): Promise<McpTool[]> {
  const endpoints = [`${s.url.replace(/\/$/,'')}/tools`, `${s.url.replace(/\/$/,'')}/.well-known/mcp/tools`];
  let lastErr: any;
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep, { method: 'GET' });
      if (!r.ok) { lastErr = new Error(`status ${r.status}`); continue; }
      const data = await r.json();
      if (Array.isArray(data)) return data as McpTool[];
      if (Array.isArray(data?.tools)) return data.tools as McpTool[];
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('tools fetch failed');
}

/**
 * MCP Permission System Management
 */
export async function getMCPPermissionManager(): Promise<PermissionManager | null> {
  return mcpPermissionManager;
}

export async function getMCPPermissionStatistics(): Promise<any> {
  const permissionMgr = await ensureMCPPermissionSystem();
  const auditLogger = permissionMgr.getAuditLogger?.();
  if (auditLogger) {
    return await auditLogger.getStatistics();
  }
  return null;
}

export async function listMCPPermissionProfiles(): Promise<any[]> {
  try {
    const permissionMgr = await ensureMCPPermissionSystem();
    const profileManager = permissionMgr.getProfileManager?.();
    if (profileManager) {
      return profileManager.getAllProfiles();
    }
    return [];
  } catch (error) {
    console.warn('Failed to list MCP permission profiles:', error);
    return [];
  }
}

export async function switchMCPPermissionProfile(profileName: string): Promise<void> {
  const permissionMgr = await ensureMCPPermissionSystem();
  const profileManager = permissionMgr.getProfileManager?.();
  if (profileManager) {
    await profileManager.switchProfile(profileName);
  }
}

/**
 * Cleanup MCP permission system resources
 */
export async function cleanupMCPPermissionSystem(): Promise<void> {
  try {
    if (mcpPermissionManager) {
      await mcpPermissionManager.cleanup?.();
      mcpPermissionManager = null;
    }
  } catch (error) {
    console.warn('Error cleaning up MCP permission system:', error);
  }
}
