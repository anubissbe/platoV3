import { attachServer, listTools, callTool, detachServer } from '../src/integrations/mcp.js';

const id = 'test-local';
const url = 'http://localhost:8721';

console.log('Running simple MCP test...');

try {
  console.log('1. Attaching server...');
  await attachServer(id, url);
  
  console.log('2. Listing tools...');
  const tools = await listTools(id);
  console.log('Tools:', tools);
  
  console.log('3. Calling echo tool...');
  const echoResult = await callTool(id, 'echo', { text: 'test' });
  console.log('Echo result:', echoResult);
  
  console.log('4. Calling sum tool...');
  const sumResult = await callTool(id, 'sum', { a: 3, b: 4 });
  console.log('Sum result:', sumResult);
  
  console.log('All tests passed!');
} catch (error) {
  console.error('Test failed:', error);
} finally {
  console.log('5. Cleaning up...');
  await detachServer(id).catch(console.warn);
}