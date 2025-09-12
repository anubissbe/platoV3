import { attachServer, listTools, callTool, detachServer } from '../src/integrations/mcp.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

async function main() {
  const id = 'local';
  const port = process.env.TEST_PORT || '8720';
  const url = `http://localhost:${port}`;
  
  // Create temporary test directory
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-test-'));
  
  // Change to test directory
  const originalCwd = process.cwd();
  process.chdir(testDir);
  
  try {
    console.log(`Testing MCP integration with server at ${url}`);
    console.log(`Test directory: ${testDir}`);
    
    await attachServer(id, url);
    console.log('✓ Server attached successfully');
    
    const tools = await listTools(id);
    console.log('✓ Tools listed:', JSON.stringify(tools, null, 2));
    
    const out = await callTool(id, 'echo', { text: 'hello' });
    console.log('✓ Echo tool result:', JSON.stringify(out, null, 2));
    
    const sum = await callTool(id, 'sum', { a: 2, b: 5 });
    console.log('✓ Sum tool result:', JSON.stringify(sum, null, 2));
    
    console.log('All MCP integration tests passed!');
  } catch (error) {
    console.error('MCP integration test failed:', error);
    process.exit(1);
  } finally {
    // Cleanup
    await detachServer(id).catch(() => {});
    process.chdir(originalCwd);
    
    // Remove test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup test directory:', error);
    }
  }
}

main().catch((e)=>{ console.error(e); process.exit(1); });