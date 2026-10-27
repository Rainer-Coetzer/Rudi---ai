import child_process from 'child_process';

export default {
  name: 'system_info',
  description: 'Provide a comprehensive detailed report on this machine\'s hardware, resources, and status.',
  parameters: { type: 'object', properties: {} },
  permission: 'safe',
  autonomy: 'assist',
  
  execute: async () => {
    return new Promise((resolve) => {
      child_process.exec('systeminfo | findstr /C:"OS Name" /C:"Total Physical Memory"', (error, stdout) => {
        if (error) resolve({ success: false, result: 'System info retrieval failed.' });
        else resolve({ success: true, result: stdout });
      });
    });
  }
};
