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
app.use(cors());
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
app.listen(PORT, () => {
  console.log(`\n[RUDI AGENT] ══════════════════════════════════════`);
  console.log(`[RUDI AGENT] J.A.R.V.I.S. protocols active.`);
  console.log(`[RUDI AGENT] Listening on http://localhost:${PORT}`);
  console.log(`[RUDI AGENT] ══════════════════════════════════════\n`);
});
