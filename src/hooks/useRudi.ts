import { useState, useRef, useCallback, useEffect } from 'react';
import { formatRudiResponse, stripForSpeech } from '../utils/personality';
import { getPermissionLevel, validateTool, requiresConfirmation, type PermissionLevel } from '../utils/safety';
import { type AutonomyLevel } from '../utils/autonomy';
import { useVoice } from './useVoice';
import { useSpeechToText } from './useSpeechToText';
import { useAudioAnalyzer } from './useAudioAnalyzer';
import { useHealthMonitor } from './useHealthMonitor';
import { ENDPOINTS, UI_CONFIG } from '../utils/config';
import { safeParse } from '../utils/json';
import { errorMessage } from '../utils/errors';
import { splitToolCalls } from '../utils/toolCalls';
import { createChatStreamParser, type ChatStreamEvent, type HistoryEntry, type HistoryToolCall, type ToolMode } from '../utils/chatStream';

export const RudiState = {
  Idle:      'idle',
  Listening: 'listening',
  Thinking:  'thinking',
  Speaking:  'speaking',
  Executing: 'executing'
} as const;
export type RudiState = typeof RudiState[keyof typeof RudiState];

export interface ToolExecution {
  name: string;
  params: Record<string, unknown>;
  status: 'pending' | 'running' | 'success' | 'error' | 'blocked' | 'suggested';
  result?: string;
  level?: PermissionLevel;
  /** Id the model gave this call; its result goes back to the model under the same id. */
  callId?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'rudi';
  text: string;
  toolExecution?: ToolExecution;
  timestamp?: number;
}

export interface ActionSummary {
  id: string;
  timestamp: number;
  description: string;
  statusTag: 'SAFE' | 'BLOCKED' | 'CONFIRMED' | 'ERROR' | 'SUGGESTED';
}

export interface PendingTool {
  messageId: string;
  tool: ToolExecution;
  expiresAt: number;
}

export type Provider = 'ollama' | 'claude';

interface RequestedTool {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  requiresConfirmation?: boolean;
}

export function useRudi() {
  const [state, setState]                           = useState<RudiState>(RudiState.Idle);
  const [messages, setMessages]                     = useState<ChatMessage[]>([]);
  const [autonomyLevel, setAutonomyLevel]           = useState<AutonomyLevel>('assist');
  const [devMode, setDevMode]                       = useState(false);
  const [recentActions, setRecentActions]           = useState<ActionSummary[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingTool | null>(null);
  const [globalToolStatus, setGlobalToolStatus]     = useState<'idle' | 'running' | 'success' | 'error' | 'blocked'>('idle');
  const [provider, setProvider]                     = useState<Provider>(
    () => (localStorage.getItem('rudi_provider') as Provider) ?? 'ollama'
  );

  const { systemHealth } = useHealthMonitor();
  const { microphoneLevel, startAnalyzer, stopAnalyzer } = useAudioAnalyzer();

  const {
    voiceEnabled, setVoiceEnabled,
    isSpeaking, audioLevel,
    volume, setVolume,
    speakText, stopAllSpeech
  } = useVoice();

  const { startSTT, stopSTT } = useSpeechToText((text) => {
    if (text === '[WAKE_WORD_ONLY]') {
      speakText('At your service, Sir.');
      if (state !== RudiState.Listening) startListening();
    } else {
      sendMessage(text);
    }
  });

  // The sidecar's approval gate enforces the level; keep it in sync with the UI.
  useEffect(() => {
    window.desktopAPI?.setAutonomyLevel?.(autonomyLevel).catch(err =>
      console.error('[AUTONOMY] Failed to sync level to desktop shell:', err));
  }, [autonomyLevel]);

  useEffect(() => {
    if (voiceEnabled) startSTT();
    else stopSTT();
  }, [voiceEnabled, startSTT, stopSTT]);

  const conversationHistory = useRef<HistoryEntry[]>([]);
  const actionTimes         = useRef<number[]>([]);
  const abortControllerRef  = useRef<AbortController | null>(null);

  const startListening = async () => {
    const success = await startAnalyzer();
    if (success) {
      setState(RudiState.Listening);
      startSTT();
    }
  };

  const stopListening = () => {
    stopAnalyzer();
    setState(RudiState.Idle);
    stopAllSpeech();
  };

  const logAction = (desc: string, statusTag: ActionSummary['statusTag']) => {
    const entry: ActionSummary = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      description: desc,
      statusTag,
    };
    setRecentActions(prev => [entry, ...prev].slice(0, 100));

    if (window.desktopAPI?.appendLog) {
      const category = statusTag === 'ERROR' ? 'errors' : 'activity';
      window.desktopAPI.appendLog(category, 'TOOL', `[${statusTag}] ${desc}`);
    }
  };

  const checkRateLimit = (): boolean => {
    const now = Date.now();
    const recent = actionTimes.current.filter(t => now - t < 1000);
    if (recent.length >= 5) return false;
    actionTimes.current = [...recent, now];
    return true;
  };

  /** Adds a tool's outcome to the history; it reaches the model with the next request. */
  const recordToolResult = (tool: ToolExecution, content: string, isError: boolean) => {
    if (!tool.callId) return;
    conversationHistory.current.push({ role: 'tool', toolCallId: tool.callId, name: tool.name, content, isError });
  };

  /** Records the result and asks the model to continue from it. */
  const sendToolResult = (tool: ToolExecution, content: string, isError: boolean) => {
    recordToolResult(tool, content, isError);
    setTimeout(() => sendMessage('', [], true), 1000);
  };

  const executeToolCall = async (messageId: string, parsedTool: RequestedTool) => {
    const toolExec: ToolExecution = {
      name:   parsedTool.tool,
      params: parsedTool.params || {},
      status: 'pending',
      level:  getPermissionLevel(parsedTool.tool),
      callId: parsedTool.id,
    };

    setMessages(prev => prev.map(msg =>
      msg.id === messageId ? { ...msg, toolExecution: toolExec } : msg
    ));

    if (autonomyLevel === 'observe') {
      setMessages(prev => prev.map(msg =>
        msg.id === messageId && msg.toolExecution
          ? { ...msg, toolExecution: { ...msg.toolExecution, status: 'suggested', result: 'Suggested (Observe Mode — awaiting your approval)' } }
          : msg
      ));
      logAction(`SUGGESTED: ${toolExec.name}`, 'SUGGESTED');
      recordToolResult(toolExec, 'Not executed: observe mode only suggests actions.', true);
      return;
    }

    if (!checkRateLimit()) {
      blockTool(messageId, toolExec, 'Action throttled. Please slow down, Sir.');
      return;
    }

    const validation = validateTool(toolExec.name, toolExec.params);
    if (!validation.valid) {
      blockTool(messageId, toolExec, validation.reason || 'Action blocked by safety protocols.');
      return;
    }

    const modelAskedToConfirm = parsedTool.requiresConfirmation === true;

    // Desktop: the sidecar decides and shows a native approval dialog when needed.
    if (window.desktopAPI) {
      await runTool(messageId, toolExec, modelAskedToConfirm);
      return;
    }

    // Browser preview only (execution is simulated): approximate the same policy in-page.
    const isDangerous = toolExec.level === 'dangerous';
    const needsConfirm = isDangerous
      || modelAskedToConfirm
      || requiresConfirmation(toolExec.name, autonomyLevel);

    if (needsConfirm) {
      setPendingConfirmation({ 
        messageId, 
        tool: { ...toolExec, status: isDangerous ? 'blocked' : 'pending' }, 
        expiresAt: Date.now() + (isDangerous ? 30000 : 15000) 
      });
      return;
    }

    await runTool(messageId, toolExec, false);
  };

  const blockTool = (messageId: string, tool: ToolExecution, reason: string) => {
    setGlobalToolStatus('blocked');
    setMessages(prev => prev.map(msg =>
      msg.id === messageId && msg.toolExecution
        ? { ...msg, toolExecution: { ...msg.toolExecution, status: 'blocked', result: reason } }
        : msg
    ));
    logAction(`BLOCKED: ${tool.name}`, 'BLOCKED');
    recordToolResult(tool, `Blocked: ${reason}`, true);
    setTimeout(() => setGlobalToolStatus('idle'), 2500);
  };

  const runTool = async (messageId: string, tool: ToolExecution, confirm: boolean) => {
    setState(RudiState.Executing);
    setGlobalToolStatus('running');

    setMessages(prev => prev.map(msg =>
      msg.id === messageId && msg.toolExecution
        ? { ...msg, toolExecution: { ...msg.toolExecution, status: 'running' } }
        : msg
    ));

    try {
      let result = '';
      if (window.desktopAPI) {
        const res = await window.desktopAPI.executeTool(tool.name, tool.params, { confirm });
        if (res.blocked) {
          blockTool(messageId, tool, res.result);
          setState(RudiState.Idle);
          return;
        }
        if (!res.success) throw new Error(res.result);
        result = res.result;
      } else {
        await new Promise(r => setTimeout(r, 1200));
        result = `[Browser Mode] Simulated execution of ${tool.name}.`;
      }

      setMessages(prev => prev.map(msg =>
        msg.id === messageId && msg.toolExecution
          ? { ...msg, toolExecution: { ...msg.toolExecution, status: 'success', result } }
          : msg
      ));

      logAction(`${tool.name}`, confirm ? 'CONFIRMED' : 'SAFE');
      setGlobalToolStatus('success');

      if (result && result.length < 200) {
        speakText(`Operation successful, Sir. ${result}`);
      }

      sendToolResult(tool, result, false);

    } catch (err) {
      setMessages(prev => prev.map(msg =>
        msg.id === messageId && msg.toolExecution
          ? { ...msg, toolExecution: { ...msg.toolExecution, status: 'error', result: errorMessage(err) } }
          : msg
      ));
      logAction(`ERROR: ${tool.name} — ${errorMessage(err)}`, 'ERROR');
      setGlobalToolStatus('error');
      speakText(`Apologies, Sir. The operation failed: ${errorMessage(err)}`);

      const errorResult = autonomyLevel === 'autonomous'
        ? `${errorMessage(err)}\n\n[SYSTEM: Sir, the operation failed. Please analyze what went wrong, explain the mistake to the Director, and record a "lesson" memory of this pattern before deciding on the next course of action.]`
        : errorMessage(err);
      sendToolResult(tool, errorResult, true);
    }

    setTimeout(() => {
      setGlobalToolStatus('idle');
      setState(RudiState.Idle);
    }, 2500);
  };

  const confirmPendingTool = (approve: boolean) => {
    if (!pendingConfirmation) return;
    const { messageId, tool } = pendingConfirmation;
    setPendingConfirmation(null);
    if (approve) runTool(messageId, tool, true);
    else blockTool(messageId, tool, 'Execution declined by user.');
  };

  const onToolSelect = (toolName: string, prompt?: string) => {
    sendMessage(prompt || `Execute tool: ${toolName}`);
  };

  const undoLastAction = async () => {
    if (!window.desktopAPI) return;
    try {
      const res = await window.desktopAPI.executeTool('undo_action', {});
      if (res.success) {
        logAction(`UNDO: ${res.result}`, 'SAFE');
        speakText(`Action undone. ${res.result}`);
      } else {
        logAction(`UNDO FAILED: ${res.result}`, 'ERROR');
      }
    } catch (err) {
      logAction(`UNDO ERROR: ${errorMessage(err)}`, 'ERROR');
    }
  };

  const toggleListening = () => {
    if (state === RudiState.Listening) stopListening();
    else startListening();
  };

  const sendMessage = useCallback(async (
    text: string,
    attachments: { name: string; type: string; data: string }[] = [],
    isAutonomous = false
  ) => {
    // An autonomous call with no text continues the conversation after a tool result.
    const isContinuation = isAutonomous && !text.trim() && attachments.length === 0;
    if (!isContinuation && !text.trim() && attachments.length === 0) return;
    if (state === RudiState.Listening) stopListening();

    if (!isAutonomous) {
      const userMessage: ChatMessage = {
        id: Date.now().toString(), sender: 'user', text, timestamp: Date.now()
      };
      setMessages(prev => [...prev, userMessage]);
    }
    setState(RudiState.Thinking);

    let contextText = text;
    if (attachments.length > 0) {
      const attachInfo = attachments.map(a => `[Attached ${a.type}: ${a.name}]`).join(' ');
      contextText = `${attachInfo}\n${text}`;
    }

    if (conversationHistory.current.length > UI_CONFIG.MAX_HISTORY_CONTEXT) {
      conversationHistory.current = conversationHistory.current.slice(-(UI_CONFIG.MAX_HISTORY_CONTEXT - 100));
    }
    // The backend appends `message` itself, so send the history from before this turn.
    const priorHistory = conversationHistory.current.slice(-UI_CONFIG.CONTEXT_WINDOW);
    if (!isContinuation) conversationHistory.current.push({ role: 'user', content: contextText });

    setMessages(prev => (prev.length > UI_CONFIG.MAX_MESSAGES_UI ? prev.slice(-UI_CONFIG.PRUNE_SIZE_UI) : prev));

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let memories: string[] = [];
    let projectContext = '';
    if (window.desktopAPI) {
      try {
        const memRes = await window.desktopAPI.executeTool('list_memories', {});
        if (memRes.success) {
          const rawMems = safeParse<{ type: string; content: string }[]>(memRes.result);
          if (Array.isArray(rawMems)) {
            memories = rawMems.slice(-5).map(m => `[RECALL: ${m.type.toUpperCase()}] ${m.content}`);
          }
        }
        
        projectContext = await window.desktopAPI.getProjectContext?.() || '';
      } catch (err) {
        console.warn('Metadata recall failed:', err);
      }
    }

    try {
      const response = await fetch(ENDPOINTS.CHAT, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          attachments,
          history: priorHistory,
          autonomyLevel,
          memories,
          projectContext,
          provider,
        })
      });

      if (!response.ok || !response.body) throw new Error('Backend unreachable');

      setState(RudiState.Speaking);

      const reader      = response.body.getReader();
      const decoder     = new TextDecoder('utf-8');
      const rudiMsgId   = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: rudiMsgId, sender: 'rudi', text: '', timestamp: Date.now() }]);

      // NDJSON events (see utils/chatStream.ts). A plain-text body is an older backend.
      const isEventStream = (response.headers.get('content-type') || '').includes('ndjson');
      const parser        = createChatStreamParser();
      let toolMode: ToolMode = isEventStream ? 'native' : 'text';
      let rawText         = '';
      let shownText       = '';
      const nativeCalls: HistoryToolCall[] = [];

      const handleEvent = (event: ChatStreamEvent) => {
        switch (event.type) {
          case 'start':     toolMode = event.toolMode; break;
          case 'text':      rawText += event.delta; break;
          case 'tool_call': nativeCalls.push({ id: event.id, name: event.name, params: event.params }); break;
          case 'error':     rawText += (rawText ? '\n\n' : '') + event.message; break;
        }
      };
      const consume = (chunk: string, final = false) => {
        if (isEventStream) {
          parser.push(chunk).forEach(handleEvent);
          if (final) parser.flush().forEach(handleEvent);
        } else {
          rawText += chunk;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        consume(decoder.decode(value, { stream: true }));

        // Text-mode models put tool JSON in the text; hide it while it streams.
        const text = toolMode === 'text' ? splitToolCalls(rawText, false).text : rawText.trim();
        if (text && text !== shownText) {
          shownText = text;
          setMessages(prev => prev.map(msg =>
            msg.id === rudiMsgId ? { ...msg, text: formatRudiResponse(text) } : msg
          ));
        }
      }
      consume(decoder.decode(), true);

      setState(RudiState.Idle);

      let textContent: string;
      let toolCall: RequestedTool | undefined;
      let historyCalls: HistoryToolCall[] = [];

      if (toolMode === 'native') {
        textContent = rawText.trim();
        historyCalls = nativeCalls;
        // One tool per turn; the backend reports any others to the model as not executed.
        const [first] = nativeCalls;
        if (first) toolCall = { id: first.id, tool: first.name, params: first.params };
      } else {
        const { text: finalText, calls } = splitToolCalls(rawText, true);
        textContent = finalText;
        for (const call of calls) {
          if (call.message && !textContent.includes(call.message)) {
            textContent = textContent ? `${textContent}\n\n${call.message}` : call.message;
          }
        }
        const legacy = calls.find(c => c.tool);
        if (legacy?.tool) {
          toolCall = {
            id: `text_${Date.now().toString(36)}`,
            tool: legacy.tool,
            params: legacy.params || {},
            requiresConfirmation: legacy.requiresConfirmation,
          };
          historyCalls = [{ id: toolCall.id, name: toolCall.tool, params: toolCall.params }];
        }
      }

      setMessages(prev => prev.map(msg =>
        msg.id === rudiMsgId ? { ...msg, text: formatRudiResponse(textContent) } : msg
      ));
      conversationHistory.current.push({
        role: 'assistant',
        content: textContent,
        ...(historyCalls.length ? { toolCalls: historyCalls } : {}),
      });

      if (toolCall) executeToolCall(rudiMsgId, toolCall);
      speakText(stripForSpeech(textContent));

    } catch (err) {
      if ((err as { name?: string } | null)?.name === 'AbortError') {
        setState(RudiState.Idle);
        return;
      }
      setState(RudiState.Idle);
      const errMsg = 'I cannot reach the backend, Sir. Check that the server is running.';
      setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'rudi', text: errMsg, timestamp: Date.now() }]);
      speakText(errMsg);
    }
  }, [state, autonomyLevel, provider, speakText, startSTT, stopSTT, startAnalyzer, stopAnalyzer, stopAllSpeech, executeToolCall]);

  const cancelCurrentTask = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stopAllSpeech();
    setState(RudiState.Idle);
    setMessages(prev => [
      ...prev,
      { id: Date.now().toString(), sender: 'rudi', text: '_(Task cancelled by Sir.)_', timestamp: Date.now() }
    ]);
    logAction('Task cancelled by Sir.', 'BLOCKED');
  }, [stopAllSpeech]);

  const clearChat = useCallback(() => {
    setMessages([]);
    conversationHistory.current = [];
    stopAllSpeech();
    setState(RudiState.Idle);
  }, [stopAllSpeech]);

  return {
    state,
    messages,
    microphoneLevel,
    autonomyLevel, setAutonomyLevel,
    devMode, setDevMode,
    globalToolStatus,
    recentActions,
    pendingConfirmation, confirmPendingTool,
    toggleListening,
    undoLastAction,
    cancelCurrentTask,
    clearChat,
    sendMessage,
    onToolSelect,
    systemHealth,
    voiceEnabled, setVoiceEnabled,
    isSpeaking, audioLevel,
    volume, setVolume,
    provider,
    setProvider: (p: Provider) => {
      localStorage.setItem('rudi_provider', p);
      setProvider(p);
    },
  };
}
