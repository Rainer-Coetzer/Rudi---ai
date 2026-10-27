export default {
  name: 'undo_action',
  description: 'Undo the last file or git operation performed by Rudi.',
  parameters: { type: 'object', properties: {} },
  permission: 'safe',
  autonomy: 'assist',

  // ctx is injected by ToolsManager — plugins are loaded unbundled, so they can't import sidecar modules.
  execute: async (_params, ctx) => {
    return await ctx.undoLastAction();
  }
};
