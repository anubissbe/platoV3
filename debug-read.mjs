import { ReadTool } from './src/tools/native/read-tool.js';
import path from 'path';
import os from 'os';

const tempDir = path.join(os.tmpdir(), 'test-debug');
console.log('tempDir:', tempDir);

const readTool = new ReadTool(tempDir);
try {
  const result = await readTool.execute({
    path: path.join(tempDir, 'nonexistent.txt')
  });
  console.log('Result:', result);
} catch (error) {
  console.log('Error type:', typeof error);
  console.log('Error name:', error.name);
  console.log('Error message:', error.message);
  console.log('Error code:', error.code);
  console.log('Error constructor:', error.constructor.name);
  console.log('SystemError properties:', Object.keys(error));
}
