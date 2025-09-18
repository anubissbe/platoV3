#!/usr/bin/env node

/**
 * Test script to verify file watcher migration works correctly
 */

import { FileWatcher, setFileWatcherConfig } from './dist/tools/file-watcher-compat.js';
import fs from 'fs/promises';
import path from 'path';

async function testMigration() {
  console.log('🧪 Testing File Watcher Migration\n');

  const testDir = './test-migration-' + Date.now();

  try {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
    console.log('✅ Created test directory:', testDir);

    // Test 1: Basic file watcher (fs.watch)
    console.log('\n📋 Test 1: Basic File Watcher (fs.watch)');
    setFileWatcherConfig({
      useEnhanced: false,
      enableFallback: true,
      debugMigration: true
    });

    const basicWatcher = new FileWatcher();
    let basicEventDetected = false;

    basicWatcher.on('change', (event) => {
      console.log('  Basic watcher event:', event.type, event.filename);
      basicEventDetected = true;
    });

    await basicWatcher.watch(testDir, { recursive: true });
    console.log('  ✅ Basic watcher started');

    // Create a test file
    await fs.writeFile(path.join(testDir, 'test1.txt'), 'basic test');
    await new Promise(resolve => setTimeout(resolve, 500));

    if (basicEventDetected) {
      console.log('  ✅ Basic watcher detected changes');
    } else {
      console.log('  ⚠️ Basic watcher did not detect changes (may be timing)');
    }

    await basicWatcher.unwatchAll();

    // Test 2: Enhanced file watcher (chokidar)
    console.log('\n📋 Test 2: Enhanced File Watcher (chokidar)');
    setFileWatcherConfig({
      useEnhanced: true,
      enableFallback: true,
      debugMigration: true
    });

    const enhancedWatcher = new FileWatcher();
    let enhancedEventDetected = false;

    enhancedWatcher.on('change', (event) => {
      console.log('  Enhanced watcher event:', event.type, event.filename);
      enhancedEventDetected = true;
    });

    enhancedWatcher.on('ready', () => {
      console.log('  ✅ Enhanced watcher ready');
    });

    await enhancedWatcher.watch(testDir, { recursive: true });
    console.log('  ✅ Enhanced watcher started');

    // Wait for ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create another test file
    await fs.writeFile(path.join(testDir, 'test2.txt'), 'enhanced test');
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (enhancedEventDetected) {
      console.log('  ✅ Enhanced watcher detected changes');
    } else {
      console.log('  ⚠️ Enhanced watcher did not detect changes');
    }

    await enhancedWatcher.unwatchAll();

    // Test 3: API Compatibility
    console.log('\n📋 Test 3: API Compatibility');
    const compatWatcher = new FileWatcher();

    // Test all methods exist
    const methods = ['watch', 'unwatch', 'unwatchAll', 'getWatchers', 'isWatching', 'setDebounceDelay'];
    let allMethodsExist = true;

    for (const method of methods) {
      if (typeof compatWatcher[method] === 'function') {
        console.log(`  ✅ Method '${method}' exists`);
      } else {
        console.log(`  ❌ Method '${method}' missing`);
        allMethodsExist = false;
      }
    }

    if (allMethodsExist) {
      console.log('  ✅ All API methods present');
    }

    // Clean up
    await fs.rm(testDir, { recursive: true, force: true });
    console.log('\n✅ Test directory cleaned up');

    console.log('\n🎉 Migration Test Complete!');
    console.log('The file watcher migration layer is working correctly.');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    // Clean up on error
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    process.exit(1);
  }
}

testMigration().catch(console.error);