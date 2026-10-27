import child_process from 'child_process';

/**
 * Autonomous Debugging Tool
 * Executes a command and provides specialized error context for self-correction.
 */
export default {
  name: 'autonomous_debug',
  description: 'Execute a command and enter an autonomous debugging loop if it fails.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute.' },
      cwd: { type: 'string', description: 'Working directory.' },
      context: { type: 'string', description: 'Initial context or hypothesis.' }
    },
    required: ['command']
  },
  permission: 'caution',
  autonomy: 'autonomous',
  
  execute: async (params: any) => {
    return new Promise((resolve) => {
      const cwd = params.cwd || process.cwd();
      child_process.exec(params.command, { cwd, shell: 'powershell.exe' }, (error, stdout, stderr) => {
        if (error) {
          const result = `
[DEBUG_CONTEXT]
COMMAND_FAILED: "${params.command}"
EXIT_CODE: ${error.code}
STDOUT:
${stdout}
STDERR:
${stderr}

[INSTRUCTION]
Sir, the command failed. Please analyze the STDOUT and STDERR above, use your 'read_file' or 'search_project' tools to investigate the cause, and then issue a 'write_code' or 'apply_fix' command to rectify the issue before retrying the execution.
          `.trim();
          resolve({ success: false, result });
        } else {
          resolve({ success: true, result: stdout || 'Command successful (Exit Code 0).' });
        }
      });
    });
  }
};
