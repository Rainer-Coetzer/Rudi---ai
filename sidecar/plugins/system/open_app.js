import child_process from 'child_process';

export default {
  name: 'open_app',
  description: 'Launch a specific application on the system (e.g., vscode, terminal, chrome).',
  parameters: {
    type: 'object',
    properties: {
      app: { type: 'string', description: 'Application name or command.' }
    },
    required: ['app']
  },
  permission: 'safe',
  autonomy: 'assist',
  
  execute: async (params: any) => {
    const appName = params.app?.toLowerCase() || '';
    const appMap = {
      vscode: 'code', terminal: 'wt', browser: 'chrome', calculator: 'calc'
    };
    const exe = appMap[appName] || appName;
    
    // Sanitize by escaping single quotes for PowerShell
    const shellCmd = `Start-Process '${exe.replace(/'/g, "''")}' -ErrorAction Stop`;
    
    return new Promise((resolve) => {
      child_process.exec(`powershell -NoProfile -Command "${shellCmd}"`, (error, stdout, stderr) => {
        if (error || stderr) resolve({ success: false, result: `Failed to launch ${appName}.` });
        else resolve({ success: true, result: `Launched ${appName}.` });
      });
    });
  }
};
