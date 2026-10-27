import fs from 'fs/promises';
import path from 'path';
import { captureSnapshot } from '../undo.js';

function validatePath(filePath, root) {
  if (!filePath) return false;
  try {
    const resolvedPath = path.resolve(root, filePath);
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
  
  execute: async (params) => {
    const root = params.__root || process.cwd();
    if (!validatePath(params.path, root)) return { success: false, result: 'Security block: Path traversal detected.' };
    // Write to the resolved path; the raw one would be relative to the sidecar's cwd.
    const filePath = path.resolve(root, params.path);
    
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    captureSnapshot(filePath, 'write');
    await fs.writeFile(filePath, params.content, 'utf-8');
    
    return { success: true, result: `Successfully written to ${filePath}.` };
  }
};
