import fs from 'fs/promises';
import path from 'path';
import { captureSnapshot } from '../undo.js';

function validatePath(filePath: string): boolean {
  if (!filePath) return false;
  try {
    const root = process.cwd();
    const resolvedPath = path.resolve(filePath);
    const relative = path.relative(root, resolvedPath);
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  } catch {
    return false;
  }
}

export default {
  name: 'write_code',
  description: 'Create or overwrite a file with specific code content.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Destination file path.' },
      content: { type: 'string', description: 'The code or text content to write.' }
    },
    required: ['path', 'content']
  },
  permission: 'caution',
  autonomy: 'assist',
  
  execute: async (params: any) => {
    const filePath = params.path;
    if (!validatePath(filePath)) return { success: false, result: 'Security block: Path traversal detected.' };
    
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    captureSnapshot(filePath, 'write');
    await fs.writeFile(filePath, params.content, 'utf-8');
    
    return { success: true, result: `Successfully written to ${filePath}.` };
  }
};
