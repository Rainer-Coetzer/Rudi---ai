import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// Routes
import voiceRouter from './routes/voice.js';
import knowledgeRouter from './routes/knowledge.js';
import systemRouter from './routes/system.js';
import chatRouter, { setSystemPrompt } from './routes/chat.js';

const app = express();
const PORT = 3001;
// Loopback only — the API holds the knowledge base and spends API credits.
const HOST = '127.0.0.1';

// Pages allowed to call the API: the Vite dev server and the Tauri webview.
const ALLOWED_ORIGINS = new Set(
  (process.env.RUDI_ALLOWED_ORIGINS ||
    'http://localhost:5173,http://127.0.0.1:5173,http://tauri.localhost,https://tauri.localhost,tauri://localhost')
    .split(',').map(o => o.trim()).filter(Boolean)
);
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);

// ─── System Prompt (J.A.R.V.I.S. Persona) ─────────────────────────────────────
const RUDI_SYSTEM_PROMPT = `You are Rudi — a proactive autonomous desktop assistant (J.A.R.V.I.S. archetype). Tone: Professional, technical, loyal. Address user as "Sir" or "Director".

CORE PROTOCOLS:
1. AUTONOMY: When assigned an objective, define a [GOAL] and execute steps via [STEP] without waiting for confirmation for safe ops.
2. CHAINING: Use relentless tool loops (list → read → analyze → write → verify).
3. SELF-CORRECTION: If a tool fails, analyze error and try a different approach. Record lessons via 'record_memory'.
4. LEARNING: Recall long-term memories provided in [CONTEXT].

RESPONSE FORMAT (Tools):
[GOAL] <objective>
[STEP] <intent>
\`\`\`json
{ "message": "...", "tool": "name", "params": {}, "requiresConfirmation": false }
\`\`\`

RESPONSE (Conversational): Sophisticated prose. No JSON. No markup.

ENVIRONMENT: Root: d:/Rudi - ai. Forward slashes. You can inspect/improve your own code.`;


setSystemPrompt(RUDI_SYSTEM_PROMPT);

// ─── Middleware ───────────────────────────────────────────────────────────────
// CORS alone only hides responses; requests from other sites would still run.
// Reject them outright, and check Host to stop DNS-rebinding pages.
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (!ALLOWED_HOSTS.has(req.get('host') || '')) {
    return res.status(403).json({ error: 'Forbidden host' });
  }
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    console.warn(`[SECURITY] Rejected request from origin ${origin}`);
    return res.status(403).json({ error: 'Forbidden origin' });
  }
  next();
});
app.use(cors({ origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.has(origin)) }));
app.use(express.json({ limit: '20mb' }));

// ─── Root Health ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ name: 'Rudi Agent API', status: 'online', version: '1.0.0' });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', systemRouter);
app.use('/api', voiceRouter);
app.use('/api', knowledgeRouter);
app.use('/api/chat', chatRouter);

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// ─── Server Start ─────────────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  console.log(`\n[RUDI AGENT] ══════════════════════════════════════`);
  console.log(`[RUDI AGENT] J.A.R.V.I.S. protocols active.`);
  console.log(`[RUDI AGENT] Listening on http://${HOST}:${PORT}`);
  console.log(`[RUDI AGENT] ══════════════════════════════════════\n`);
});
