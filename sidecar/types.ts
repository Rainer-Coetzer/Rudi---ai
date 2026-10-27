/**
 * Arguments a tool or protocol request arrives with: untyped JSON from the model or
 * the shell. Each handler reads the fields it needs; the security gate and approval
 * policy have already checked the call by the time a handler sees it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary JSON, read field by field
export type ToolParams = Record<string, any>;
