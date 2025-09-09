import { EventEmitter } from 'events';
import { execa } from 'execa';
import fs from 'fs/promises';
import { watch, FSWatcher } from 'fs';
import path from 'path';
import YAML from 'yaml';
import {
  IProfileManager,
  Profile,
  PermissionProfile,
  AdvancedPermissionsConfig,
  PermissionContext,
  ProfileChangeEvent,
  Rule,
  PermissionAction,
  ProfileError,
  ProfileManagerEvents
} from './types';

export class ProfileManager extends EventEmitter implements IProfileManager {
  private profiles: Profile[] = [];
  private currentProfile: Profile | null = null;
  private context: PermissionContext | null = null;
  private config: AdvancedPermissionsConfig | null = null;
  private temporaryRules: Rule[] = []; // Temporary rule overrides
  private watchers: FSWatcher[] = []; // File watchers for hot-reload
  private hotReloadEnabled: boolean = false;

  constructor() {
    super();
    this.setMaxListeners(50); // Allow multiple components to listen
  }

  /**
   * Load profiles from YAML configuration files
   * Merges global and project-level configurations
   */
  async loadProfiles(): Promise<void> {
    try {
      const globalPath = path.join(process.env.HOME || '', '.config', 'plato', 'config.yaml');
      const projectPath = path.join(process.cwd(), '.plato', 'config.yaml');
      
      let mergedConfig: any = { permissions: { profiles: {} } };

      // Load global config
      try {
        const globalContent = await fs.readFile(globalPath, 'utf8');
        const globalConfig = YAML.parse(globalContent) || {};
        mergedConfig = this.mergeConfigs(mergedConfig, globalConfig);
      } catch (error) {
        // Global config is optional
      }

      // Load project config (overrides global)
      try {
        const projectContent = await fs.readFile(projectPath, 'utf8');
        const projectConfig = YAML.parse(projectContent) || {};
        mergedConfig = this.mergeConfigs(mergedConfig, projectConfig);
      } catch (error) {
        // Project config is optional
      }

      this.config = mergedConfig.permissions as AdvancedPermissionsConfig;
      
      if (!this.config?.profiles) {
        this.profiles = [];
        this.emit('profileLoaded', this.profiles);
        return;
      }

      // Convert profile configurations to Profile objects
      this.profiles = await Promise.all(
        Object.entries(this.config.profiles).map(async ([name, profile]) => {
          await this.validateProfile(profile);
          return {
            ...profile,
            name,
            isActive: false,
            lastActivated: undefined,
            activationScore: 0
          } as Profile;
        })
      );

      this.emit('profileLoaded', this.profiles);
    } catch (error) {
      this.emit('activationFailed', error as Error);
      throw error;
    }
  }

  /**
   * Get all loaded profiles
   */
  getAllProfiles(): Profile[] {
    return [...this.profiles];
  }

  /**
   * Get the currently active profile
   */
  getCurrentProfile(): Profile | null {
    return this.currentProfile;
  }

  /**
   * Manually switch to a specific profile
   */
  async switchProfile(profileName: string): Promise<boolean> {
    const targetProfile = this.profiles.find(p => p.name === profileName);
    
    if (!targetProfile) {
      return false;
    }

    const previousProfile = this.currentProfile;
    
    // Deactivate current profile
    if (this.currentProfile) {
      this.currentProfile.isActive = false;
    }

    // Activate new profile
    targetProfile.isActive = true;
    targetProfile.lastActivated = new Date();
    this.currentProfile = targetProfile;

    // Emit change event
    this.emit('profileChanged', {
      previous: previousProfile,
      current: targetProfile,
      reason: 'manual'
    } as ProfileChangeEvent);

    return true;
  }

  /**
   * Detect active profile based on current context
   */
  async detectActiveProfile(): Promise<Profile | null> {
    const context = await this.getCurrentContext();
    
    if (!context) {
      return null;
    }

    let bestMatch: Profile | null = null;
    let highestScore = 0;

    for (const profile of this.profiles) {
      const score = await this.calculateActivationScore(profile, context);
      
      if (score > highestScore && score > 0) {
        highestScore = score;
        bestMatch = profile;
      }
    }

    if (bestMatch) {
      bestMatch.activationScore = highestScore;
    }

    return bestMatch;
  }

  /**
   * Automatically activate the best matching profile
   */
  async autoActivateProfile(): Promise<void> {
    try {
      const detectedProfile = await this.detectActiveProfile();
      
      // If no profile matches or current profile still matches, no change needed
      if (!detectedProfile || detectedProfile === this.currentProfile) {
        return;
      }

      const previousProfile = this.currentProfile;

      // Deactivate current profile
      if (this.currentProfile) {
        this.currentProfile.isActive = false;
      }

      // Activate detected profile
      detectedProfile.isActive = true;
      detectedProfile.lastActivated = new Date();
      this.currentProfile = detectedProfile;

      // Emit change event
      this.emit('profileChanged', {
        previous: previousProfile,
        current: detectedProfile,
        reason: 'automatic'
      } as ProfileChangeEvent);

    } catch (error) {
      this.emit('activationFailed', error as Error);
    }
  }

  /**
   * Get resolved rules with inheritance: global → project → profile → temporary
   */
  getResolvedRules(): Rule[] {
    const globalRules = this.config?.global_rules || [];
    const projectRules = this.config?.project_rules || [];
    const profileRules = this.resolveProfileRules(this.currentProfile);
    const temporaryRules = this.temporaryRules;
    
    // Combine all rules with proper precedence (temporary highest)
    const allRules = [...globalRules, ...projectRules, ...profileRules, ...temporaryRules];
    
    // Sort by priority (higher priority first), with temporary rules having implicit higher priority
    return allRules.sort((a, b) => {
      const aPriority = (a.priority || 0) + (this.temporaryRules.includes(a) ? 10000 : 0);
      const bPriority = (b.priority || 0) + (this.temporaryRules.includes(b) ? 10000 : 0);
      return bPriority - aPriority;
    });
  }

  /**
   * Resolve profile rules with inheritance from parent profiles
   */
  private resolveProfileRules(profile: Profile | null): Rule[] {
    if (!profile || !this.config) {
      return [];
    }

    let allRules: Rule[] = [...(profile.rules || [])];
    
    // Handle profile inheritance via inherits_from
    if (profile.inherits_from) {
      const parentProfile = this.profiles.find(p => p.name === profile.inherits_from);
      if (parentProfile) {
        // Recursively resolve parent profile rules (with lower priority)
        const parentRules = this.resolveProfileRules(parentProfile);
        // Parent rules get lower effective priority
        const adjustedParentRules = parentRules.map(rule => ({
          ...rule,
          priority: (rule.priority || 0) - 1000 // Lower priority than current profile
        }));
        allRules = [...adjustedParentRules, ...allRules];
      }
    }
    
    return allRules;
  }

  /**
   * Get resolved defaults with profile overriding global
   */
  getResolvedDefaults(): Record<string, PermissionAction> {
    return {
      ...(this.currentProfile?.defaults || {})
    };
  }

  /**
   * Validate a profile configuration
   */
  async validateProfile(profile: PermissionProfile): Promise<boolean> {
    // Required fields validation
    if (!profile.description) {
      throw new ProfileError('Profile must have a description');
    }

    if (!profile.activation) {
      profile.activation = {}; // Default to empty activation rules
    }

    if (!profile.defaults) {
      profile.defaults = {}; // Default to empty defaults
    }

    if (!profile.rules) {
      profile.rules = []; // Default to empty rules
    }

    // Validate branch pattern if provided
    if (profile.activation.branch_pattern) {
      try {
        // Test regex compilation
        new RegExp(profile.activation.branch_pattern.replace(/\|/g, '|'));
      } catch (error) {
        throw new ProfileError(`Invalid branch pattern: ${profile.activation.branch_pattern}`);
      }
    }

    // Validate rules
    for (const rule of profile.rules) {
      if (!rule.match || !rule.action) {
        throw new ProfileError('Each rule must have match criteria and action');
      }
      
      if (!['allow', 'deny', 'confirm'].includes(rule.action)) {
        throw new ProfileError(`Invalid rule action: ${rule.action}`);
      }
    }

    return true;
  }

  /**
   * Get current system context
   */
  private async getCurrentContext(): Promise<PermissionContext | null> {
    try {
      const context: PermissionContext = {
        environment: process.env as Record<string, string>,
        workingDirectory: process.cwd(),
        timestamp: new Date()
      };

      // Get git branch if in a git repository
      try {
        const { stdout: branch } = await execa('git', ['branch', '--show-current'], {
          cwd: context.workingDirectory
        });
        context.currentBranch = branch.trim();

        // Get git repository info
        const { stdout: gitRoot } = await execa('git', ['rev-parse', '--show-toplevel'], {
          cwd: context.workingDirectory
        });
        context.gitRepository = {
          root: gitRoot.trim(),
          remotes: [] // Can be expanded later
        };
      } catch (error) {
        // Not in a git repository or git not available
      }

      this.context = context;
      this.emit('contextChanged', context);
      return context;
    } catch (error) {
      return null;
    }
  }

  /**
   * Calculate activation score for a profile against current context
   */
  private async calculateActivationScore(profile: Profile, context: PermissionContext): Promise<number> {
    let score = 0;
    const activation = profile.activation;

    // Branch pattern matching (high weight)
    if (activation.branch_pattern && context.currentBranch) {
      const patterns = activation.branch_pattern.split('|');
      const branchMatches = patterns.some(pattern => {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(context.currentBranch!);
      });
      
      if (branchMatches) {
        score += 50;
      }
    }

    // Environment variable matching (medium weight)
    if (activation.env) {
      const [envVar, expectedValue] = activation.env.split('=');
      if (context.environment[envVar] === expectedValue) {
        score += 30;
      }
    }

    // Directory pattern matching (low weight)
    if (activation.directory_pattern) {
      const regex = new RegExp(activation.directory_pattern.replace(/\*/g, '.*'));
      if (regex.test(context.workingDirectory)) {
        score += 20;
      }
    }

    // Time range matching (if implemented)
    if (activation.time_range) {
      // TODO: Implement time range checking
      // This would check if current time falls within specified range
    }

    return score;
  }

  /**
   * Deep merge configuration objects
   */
  private mergeConfigs(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.mergeConfigs(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Add temporary rule override (highest priority)
   */
  addTemporaryRule(rule: Rule): void {
    // Ensure temporary rules have very high priority
    const temporaryRule = {
      ...rule,
      priority: (rule.priority || 0) + 10000,
      reason: rule.reason || 'Temporary override'
    };
    
    this.temporaryRules.push(temporaryRule);
    this.emit('rulesChanged', { type: 'temporary_added', rule: temporaryRule });
  }

  /**
   * Remove temporary rule override
   */
  removeTemporaryRule(ruleId: string): boolean {
    const initialLength = this.temporaryRules.length;
    this.temporaryRules = this.temporaryRules.filter(rule => rule.id !== ruleId);
    
    if (this.temporaryRules.length < initialLength) {
      this.emit('rulesChanged', { type: 'temporary_removed', ruleId });
      return true;
    }
    return false;
  }

  /**
   * Clear all temporary rule overrides
   */
  clearTemporaryRules(): void {
    const count = this.temporaryRules.length;
    this.temporaryRules = [];
    
    if (count > 0) {
      this.emit('rulesChanged', { type: 'temporary_cleared', count });
    }
  }

  /**
   * Get current temporary rules
   */
  getTemporaryRules(): Rule[] {
    return [...this.temporaryRules];
  }

  /**
   * Enable hot-reload capability for configuration files
   */
  enableHotReload(): void {
    if (this.hotReloadEnabled) {
      return; // Already enabled
    }

    this.hotReloadEnabled = true;
    this.setupFileWatchers();
    this.emit('hotReloadEnabled');
  }

  /**
   * Disable hot-reload capability
   */
  disableHotReload(): void {
    if (!this.hotReloadEnabled) {
      return; // Already disabled
    }

    this.hotReloadEnabled = false;
    this.cleanupWatchers();
    this.emit('hotReloadDisabled');
  }

  /**
   * Setup file watchers for configuration files
   */
  private setupFileWatchers(): void {
    const globalPath = path.join(process.env.HOME || '', '.config', 'plato', 'config.yaml');
    const projectPath = path.join(process.cwd(), '.plato', 'config.yaml');

    const watchPaths = [globalPath, projectPath];

    for (const configPath of watchPaths) {
      try {
        const watcher = watch(configPath, { persistent: false }, (eventType, filename) => {
          if (eventType === 'change') {
            this.handleConfigChange(configPath);
          }
        });

        // Handle watcher errors gracefully
        watcher.on('error', (error) => {
          console.warn(`File watcher error for ${configPath}:`, error.message);
        });

        this.watchers.push(watcher);
      } catch (error) {
        // File doesn't exist or can't be watched - this is fine
        console.debug(`Cannot watch ${configPath}:`, (error as Error).message);
      }
    }
  }

  /**
   * Handle configuration file changes
   */
  private async handleConfigChange(filePath: string): Promise<void> {
    try {
      // Debounce rapid file changes
      setTimeout(async () => {
        const previousProfile = this.currentProfile;
        
        // Reload profiles from updated configuration
        await this.loadProfiles();
        
        // Re-activate the current profile if it still exists
        if (previousProfile) {
          const profileExists = this.profiles.some(p => p.name === previousProfile.name);
          if (profileExists) {
            await this.switchProfile(previousProfile.name);
          } else {
            // Profile was removed, try to auto-activate a new one
            await this.autoActivateProfile();
          }
        }

        this.emit('configReloaded', { 
          filePath, 
          profileCount: this.profiles.length,
          currentProfile: this.currentProfile?.name 
        });

      }, 100); // 100ms debounce

    } catch (error) {
      this.emit('reloadError', { filePath, error: error as Error });
    }
  }

  /**
   * Cleanup all file watchers
   */
  private cleanupWatchers(): void {
    for (const watcher of this.watchers) {
      try {
        watcher.close();
      } catch (error) {
        console.warn('Error closing file watcher:', (error as Error).message);
      }
    }
    this.watchers = [];
  }

  /**
   * Get hot-reload status
   */
  isHotReloadEnabled(): boolean {
    return this.hotReloadEnabled;
  }

  /**
   * Clean up resources (call when shutting down)
   */
  destroy(): void {
    this.disableHotReload();
    this.clearTemporaryRules();
    this.removeAllListeners();
  }
}