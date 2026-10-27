/**
 * tools.js — schemas for the built-in tools the sidecar can run.
 *
 * These only describe the tools to the model. Execution still goes through the
 * renderer → desktopAPI.executeTool → sidecar, whose approval gate and whitelist
 * (sidecar/policy.ts, sidecar/security.ts) decide what actually runs.
 *
 * Every name here must be in the sidecar whitelist and handled in
 * sidecar/handlers/toolHandler.ts. Parameter names match what that handler reads.
 */

const str = (description) => ({ type: 'string', description });

const PATH = str('Path relative to the active workspace root. Use forward slashes.');

function tool(name, description, properties = {}, required = []) {
  return {
    name,
    description,
    parameters: { type: 'object', properties, required },
  };
}

export const TOOLS = [
  // ── System ───────────────────────────────────────────────────────────────
  tool('open_app', 'Launch a desktop application.', {
    app: str('Application to launch, e.g. "vscode", "terminal", "browser", "calculator", or an executable name.'),
  }, ['app']),
  tool('system_info', 'Get the OS name and total physical memory.'),
  tool('run_terminal', 'Run a PowerShell command in the workspace and return its output.', {
    command: str('The PowerShell command to run.'),
    cwd: str('Working directory relative to the workspace root. Defaults to the root.'),
  }, ['command']),
  tool('open_vscode', 'Open a folder in VS Code.', {
    path: str('Folder relative to the workspace root. Defaults to the root.'),
  }),
  tool('open_vscode_file', 'Open a file in VS Code.', { path: PATH }, ['path']),

  // ── Files ────────────────────────────────────────────────────────────────
  tool('read_file', 'Read a text file from the workspace.', { path: PATH }, ['path']),
  tool('list_dir', 'List the entries of a workspace directory.', {
    path: str('Directory relative to the workspace root. Defaults to the root.'),
  }),
  tool('create_file', 'Create or overwrite a file in the workspace with the given content.', {
    path: PATH,
    content: str('Full file content.'),
  }, ['path', 'content']),
  tool('write_code', 'Write source code to a file in the workspace, replacing its content.', {
    path: PATH,
    content: str('Full file content.'),
  }, ['path', 'content']),
  tool('delete_file', 'Delete a file from the workspace. Can be undone with undo_action.', { path: PATH }, ['path']),
  tool('undo_action', 'Undo the most recent file write or delete.'),

  // ── Network ──────────────────────────────────────────────────────────────
  tool('open_url', 'Open a URL in the default browser.', { url: str('Absolute http(s) URL.') }, ['url']),
  tool('search_web', 'Open a web search for a query in the default browser.', { query: str('Search query.') }, ['query']),

  // ── Git ──────────────────────────────────────────────────────────────────
  tool('git_status', 'Show the short git status of the workspace.'),
  tool('git_commit', 'Stage all changes in the workspace and commit them.', {
    message: str('Commit message.'),
  }, ['message']),
  tool('git_push', 'Push the current branch of the workspace repository.'),

  // ── Tasks ────────────────────────────────────────────────────────────────
  tool('list_tasks', 'List the user\'s tasks.'),
  tool('create_task', 'Create a task.', {
    text: str('What needs doing.'),
    priority: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Defaults to medium.' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags.' },
  }, ['text']),
  tool('complete_task', 'Mark a task as done.', { id: str('Task id from list_tasks.') }, ['id']),
  tool('delete_task', 'Delete a task.', { id: str('Task id from list_tasks.') }, ['id']),

  // ── Calendar ─────────────────────────────────────────────────────────────
  tool('read_calendar', 'List all calendar events.'),
  tool('upcoming_events', 'List upcoming calendar events.'),
  tool('add_event', 'Add a calendar event.', {
    title: str('Event title.'),
    start: str('Start time, ISO 8601.'),
    end: str('End time, ISO 8601.'),
    description: str('Optional details.'),
  }, ['title', 'start', 'end']),
  tool('remove_event', 'Remove a calendar event.', { id: str('Event id from read_calendar.') }, ['id']),
  tool('summarize', 'Produce a daily summary of tasks and events.'),

  // ── Meeting notes ────────────────────────────────────────────────────────
  tool('record_meeting_note', 'Save a meeting note.', {
    title: str('Note title.'),
    content: str('Note body.'),
    date: str('Meeting date, ISO 8601. Defaults to now.'),
  }, ['title', 'content']),
  tool('list_meeting_notes', 'List saved meeting notes.'),
  tool('delete_meeting_note', 'Delete a meeting note.', { id: str('Note id from list_meeting_notes.') }, ['id']),

  // ── Self ─────────────────────────────────────────────────────────────────
  tool('self_inspect', 'List Rudi\'s own source files for inspection.'),
  tool('self_improve', 'Rewrite one of Rudi\'s own source files.', {
    path: str('Path relative to Rudi\'s source root.'),
    content: str('Full new file content.'),
  }, ['path', 'content']),
  tool('self_changelog', 'Show the log of Rudi\'s self-modifications.'),

  // ── Memory & skills ──────────────────────────────────────────────────────
  tool('record_memory', 'Store a long-term memory, e.g. a lesson learned from a failure.', {
    content: str('What to remember.'),
    type: { type: 'string', enum: ['lesson', 'preference', 'pattern'], description: 'Defaults to lesson.' },
  }, ['content']),
  tool('list_memories', 'List stored long-term memories.'),
  tool('save_skill', 'Save a reusable step-by-step protocol under a name.', {
    name: str('Skill name.'),
    protocol: str('The protocol text.'),
  }, ['name', 'protocol']),
  tool('list_skills', 'List saved skills.'),
  tool('load_skill', 'Load a saved skill protocol by name.', { name: str('Skill name.') }, ['name']),
];

export const TOOL_NAMES = new Set(TOOLS.map(t => t.name));

/** Ollama's `tools` format (OpenAI-style function definitions). */
export function toOllamaTools(tools = TOOLS) {
  return tools.map(t => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

/** One line per tool, for the text-protocol prompt used by models without native tool calling. */
export function describeToolsAsText(tools = TOOLS) {
  return tools.map(t => {
    const params = Object.keys(t.parameters.properties);
    return `- ${t.name}(${params.join(', ')}): ${t.description}`;
  }).join('\n');
}
