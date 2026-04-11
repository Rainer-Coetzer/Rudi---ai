import { undoLastAction } from '../undo.js';

export default {
  name: 'undo_action',
  description: 'Undo the last file or git operation performed by Rudi.',
  parameters: { type: 'object', properties: {} },
  permission: 'safe',
  autonomy: 'assist',
  
  execute: async () => {
    return await undoLastAction();
  }
};
