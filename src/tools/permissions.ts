import YAML from 'yaml';
import fs from 'fs/promises';
import path from 'path';

export type Rule = {
  match: { tool?: string; path?: string; command?: string };
  action: 'allow' | 'deny' | 'confirm';
};

export type Permissions = {
  defaults?: Record<string, 'allow'|'deny'|'confirm'>;
  rules?: Rule[];
};

export async function loadPermissions(): Promise<Permissions> {
  const proj = path.join(process.cwd(), '.plato', 'config.yaml');
  const glob = path.join(process.env.HOME || '', '.config', 'plato', 'config.yaml');
  let mergedPermissions: Permissions = {
    defaults: {},
    rules: []
  };
  
  for (const f of [glob, proj]) {
    try {
      const txt = await fs.readFile(f, 'utf8');
      const y = YAML.parse(txt) || {};
      const permissions = (y.permissions || {}) as Permissions;
      
      // Deep merge permissions
      mergedPermissions = {
        defaults: { ...(mergedPermissions.defaults || {}), ...(permissions.defaults || {}) },
        rules: [...(mergedPermissions.rules || []), ...(permissions.rules || [])]
      };
    } catch {
      // Silent - config file optional
    }
  }
  
  return mergedPermissions;
}

export type PermissionQuery = { tool: string; path?: string; command?: string };

export async function checkPermission(q: PermissionQuery): Promise<'allow'|'deny'|'confirm'> {
  // Check for dangerous skip mode (--dangerously-skip-permissions)
  if (process.env.PLATO_SKIP_PERMISSIONS === 'true') {
    return 'allow';
  }

  // Check config for dangerous mode
  const { loadConfig } = await import('../config.js');
  const config = await loadConfig();
  if (config.privacy?.skip_all_prompts || config.privacy?.dangerous_mode) {
    return 'allow';
  }

  const p = await loadPermissions();
  const rules = p.rules || [];
  for (const r of rules) {
    if (r.match.tool && r.match.tool !== q.tool) continue;
    if (r.match.path) {
      if (!q.path || !matchGlob(q.path, r.match.path)) continue;
    }
    if (r.match.command) {
      if (!q.command || !new RegExp(r.match.command).test(q.command)) continue;
    }
    return r.action;
  }
  const def = p.defaults?.[q.tool];
  return def || 'allow';
}

function matchGlob(target: string, glob: string): boolean {
  // very naive glob: supports '**' anywhere and '*' wildcard
  let pattern = glob;
  
  // Use placeholders to avoid conflicts
  const DOUBLE_STAR_PLACEHOLDER = '___DOUBLE_STAR___';
  const SINGLE_STAR_PLACEHOLDER = '___SINGLE_STAR___';
  
  // Replace ** first (before escaping)
  pattern = pattern.replace(/\*\*/g, DOUBLE_STAR_PLACEHOLDER);
  
  // Replace single * 
  pattern = pattern.replace(/\*/g, SINGLE_STAR_PLACEHOLDER);
  
  // Escape regex special characters
  pattern = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  
  // Restore patterns with proper regex
  pattern = pattern.replace(new RegExp(DOUBLE_STAR_PLACEHOLDER, 'g'), '.*');
  pattern = pattern.replace(new RegExp(SINGLE_STAR_PLACEHOLDER, 'g'), '[^/]*');
  
  const re = new RegExp('^' + pattern + '$');
  return re.test(target);
}

// UI helpers: modify project permissions and save
export async function savePermissions(next: Permissions): Promise<void> {
  const proj = path.join(process.cwd(), '.plato', 'config.yaml');
  let current: any = {};
  try { current = YAML.parse(await fs.readFile(proj, 'utf8')) || {}; } catch {}
  current.permissions = next;
  await fs.mkdir(path.dirname(proj), { recursive: true });
  await fs.writeFile(proj, YAML.stringify(current), 'utf8');
}

export async function getProjectPermissions(): Promise<Permissions> {
  let current: any = {};
  try { current = YAML.parse(await fs.readFile(path.join(process.cwd(), '.plato', 'config.yaml'), 'utf8')) || {}; } catch {}
  const permissions = (current.permissions || {}) as Permissions;
  return {
    defaults: permissions.defaults || {},
    rules: permissions.rules || []
  };
}

export async function setDefault(tool: string, action: 'allow'|'deny'|'confirm') {
  const p = await getProjectPermissions();
  const next: Permissions = { ...p, defaults: { ...(p.defaults||{}), [tool]: action } };
  await savePermissions(next);
}

export async function addPermissionRule(rule: Rule) {
  const p = await getProjectPermissions();
  const next: Permissions = { ...p, rules: [ ...(p.rules||[]), rule ] };
  await savePermissions(next);
}

export async function removePermissionRule(index: number) {
  const p = await getProjectPermissions();
  const rules = (p.rules||[]).slice();
  if (index < 0 || index >= rules.length) {
    // Save the current permissions even if index is invalid
    await savePermissions(p);
    return;
  }
  rules.splice(index, 1);
  await savePermissions({ ...p, rules });
}
