import { useState, useRef, useCallback, useEffect } from 'react';
import { formatRudiResponse, stripForSpeech } from '../utils/personality';
import { getPermissionLevel, validateTool, requiresConfirmation, type PermissionLevel } from '../utils/safety';
import { type AutonomyLevel } from '../utils/autonomy';
import { useVoice } from './useVoice';
import { useSpeechToText } from './useSpeechToText';
import { useAudioAnalyzer } from './useAudioAnalyzer';
import { useHealthMonitor } from './useHealthMonitor';
import { ENDPOINTS, UI_CONFIG } from '../utils/config';

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
  params: Record<string, any>;
  status: 'pending' | 'running' | 'success' | 'error' | 'blocked' | 'suggested';
  result?: string;
  level?: PermissionLevel;
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

export function useRudi() {
  const [state, setState]                           = useState<RudiState>(RudiState.Idle);
  const [messages, setMessages]                     = useState<ChatMessage[]>([]);
  const [autonomyLevel, setAutonomyLevel]           = useState<AutonomyLevel>('assist');
  const [devMode, setDevMode]                       = useState(false);
  const [recentActions, setRecentActions]           = useState<ActionSummary[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingTool | null>(null);
  const [globalToolStatus, setGlobalToolStatus]     = useState<'idle' | 'running' | 'success' | 'error' | 'blocked'>('idle');

  const { systemHealth } = useHealthMonitor();
  const { microphoneLevel, startAnalyzer, stopAnalyzer } = useAudioAnalyzer(state === RudiState.Listening);

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

  useEffect(() => {
    if (voiceEnabled) startSTT();
    else stopSTT();
  }, [voiceEnabled, startSTT, stopSTT]);

  const conversationHistory = useRef<{ role: string; content: string }[]>([]);
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

    if (window.electronAPI?.appendLog) {
      const category = statusTag === 'ERROR' ? 'errors' : 'activity';
      window.electronAPI.appendLog(category, 'TOOL', `[${statusTag}] ${desc}`);
    }
  };

  const checkRateLimit = (): boolean => {
    const now = Date.now();
    const recent = actionTimes.current.filter(t => now - t < 1000);
    if (recent.length >= 5) return false;
    actionTimes.current = [...recent, now];
    return true;
  };

  const executeToolCall = async (messageId: string, parsedTool: any) => {
    const toolExec: ToolExecution = {
      name:   parsedTool.tool,
      params: parsedTool.params || {},
      status: 'pending',
      level:  getPermissionLevel(parsedTool.tool),
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

    const isDangerous = toolExec.level === 'dangerous';
    const needsConfirm = isDangerous 
      || parsedTool.requiresConfirmation === true
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
    setTimeout(() => setGlobalToolStatus('idle'), 2500);
  };

  const runTool = async (messageId: string, tool: ToolExecution, wasConfirmed: boolean) => {
    setState(RudiState.Executing);
    setGlobalToolStatus('running');

    setMessages(prev => prev.map(msg =>
      msg.id === messageId && msg.toolExecution
        ? { ...msg, toolExecution: { ...msg.toolExecution, status: 'running' } }
        : msg
    ));

    try {
      let result = '';
      if (window.electronAPI) {
        const res = await window.electronAPI.executeTool(tool.name, tool.params);
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

      logAction(`${tool.name}`, wasConfirmed ? 'CONFIRMED' : 'SAFE');
      setGlobalToolStatus('success');

      if (result && result.length < 200) {
        speakText(`Operation successful, Sir. ${result}`);
      }

      setTimeout(() => {
        sendMessage(`[TOOL RESULT: ${tool.name}]\n${result}`, [], true);
      }, 1000);

    } catch (err: any) {
      setMessages(prev => prev.map(msg =>
        msg.id === messageId && msg.toolExecution
          ? { ...msg, toolExecution: { ...msg.toolExecution, status: 'error', result: err.message } }
          : msg
      ));
      logAction(`ERROR: ${tool.name} — ${err.message}`, 'ERROR');
      setGlobalToolStatus('error');
      speakText(`Apologies, Sir. The operation failed: ${err.message}`);

      setTimeout(() => {
        const errorPrompt = autonomyLevel === 'autonomous' 
          ? `[TOOL FAILURE: ${tool.name}]\nERROR: ${err.message}\n\n[SYSTEM: Sir, the operation failed. Please analyze what went wrong, explain the mistake to the Director, and record a "lesson" memory of this pattern before deciding on the next course of action.]`
          : `[TOOL RESULT: ${tool.name}]\nERROR: ${err.message}`;
          
        sendMessage(errorPrompt, [], true);
      }, 1000);
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
    if (!window.electronAPI) return;
    try {
      const res = await window.electronAPI.executeTool('undo_action', {});
      if (res.success) {
        logAction(`UNDO: ${res.result}`, 'SAFE');
        speakText(`Action undone. ${res.result}`);
      } else {
        logAction(`UNDO FAILED: ${res.result}`, 'ERROR');
      }
    } catch (err: any) {
      logAction(`UNDO ERROR: ${err.message}`, 'ERROR');
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
    if (!text.trim() && attachments.length === 0) return;
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
    conversationHistory.current.push({ role: 'user', content: contextText });

    setMessages(prev => (prev.length > UI_CONFIG.MAX_MESSAGES_UI ? prev.slice(-UI_CONFIG.PRUNE_SIZE_UI) : prev));

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let memories: string[] = [];
    let projectContext = '';
    if (window.electronAPI) {
      try {
        const memRes = await window.electronAPI.executeTool('list_memories', {});
        if (memRes.success) {
           const rawMems = JSON.parse(memRes.result);
           memories = rawMems.slice(-5).map((m: any) => `[RECALL: ${m.type.toUpperCase()}] ${m.content}`);
        }
        
        projectContext = await window.electronAPI.getProjectContext?.() || '';
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
          history: conversationHistory.current.slice(-UI_CONFIG.CONTEXT_WINDOW),
          autonomyLevel,
          memories,
          projectContext
        })
      });

      if (!response.ok || !response.body) throw new Error('Backend unreachable');

      setState(RudiState.Speaking);

      const reader      = response.body.getReader();
      const decoder     = new TextDecoder('utf-8');
      const rudiMsgId   = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: rudiMsgId, sender: 'rudi', text: '', timestamp: Date.now() }]);

      let accumulatedBuffer = '';
      let textContent       = '';
      let jsonContent       = '';
      let braceCount        = 0;
      let inJsonBlock       = false;
      let insideString      = false;
      let lastEscaped       = false;
      let lastProcessedIndex = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulatedBuffer += chunk;

        for (let i = lastProcessedIndex; i < accumulatedBuffer.length; i++) {
          const char = accumulatedBuffer[i];
          if (char === '`') continue; 
          if (char === '"' && !lastEscaped) insideString = !insideString;
          lastEscaped = (char === '\\' && !lastEscaped);

          if (!insideString) {
            if (char === '{') {
              if (braceCount === 0) inJsonBlock = true;
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0 && inJsonBlock) {
                jsonContent += char;
                inJsonBlock = false;
                continue;
              }
            }
          }

          if (inJsonBlock) {
            jsonContent += char;
          } else if (braceCount === 0 && !inJsonBlock) {
            textContent += char;
          }
        }
        lastProcessedIndex = accumulatedBuffer.length;

        if (textContent.trim()) {
          setMessages(prev => prev.map(msg =>
            msg.id === rudiMsgId ? { ...msg, text: formatRudiResponse(textContent) } : msg
          ));
        }
      }

      setState(RudiState.Idle);

      if (jsonContent) {
        try {
          const firstBrace = jsonContent.indexOf('{');
          const lastBrace  = jsonContent.lastIndexOf('}') + 1;
          const parsed     = JSON.parse(jsonContent.substring(firstBrace, lastBrace));

          if (parsed.message && !textContent.includes(parsed.message)) {
            textContent += '\n\n' + parsed.message;
            setMessages(prev => prev.map(msg =>
              msg.id === rudiMsgId ? { ...msg, text: formatRudiResponse(textContent) } : msg
            ));
          }

          if (parsed.tool) {
            executeToolCall(rudiMsgId, parsed);
          }

          conversationHistory.current.push({ role: 'assistant', content: textContent });
          speakText(stripForSpeech(parsed.message || textContent));

        } catch {
          const finalClean = accumulatedBuffer.replace(/[{}[\]]/g, '').trim();
          conversationHistory.current.push({ role: 'assistant', content: finalClean });
          setMessages(prev => prev.map(msg =>
            msg.id === rudiMsgId ? { ...msg, text: formatRudiResponse(finalClean) } : msg
          ));
          speakText(stripForSpeech(finalClean));
        }
      } else {
        conversationHistory.current.push({ role: 'assistant', content: textContent });
        speakText(stripForSpeech(textContent));
      }

    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setState(RudiState.Idle);
        return;
      }
      setState(RudiState.Idle);
      const errMsg = 'I cannot reach the backend, Sir. Check that the server is running.';
      setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'rudi', text: errMsg, timestamp: Date.now() }]);
      speakText(errMsg);
    }
  }, [state, autonomyLevel, speakText, startSTT, stopSTT, startAnalyzer, stopAnalyzer, stopAllSpeech, executeToolCall]);

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
  };
}
