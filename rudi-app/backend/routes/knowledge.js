import express from 'express';
import { ingestPDF, ingestImage } from '../ingest.js';
import { 
  addKnowledge, 
  listKnowledge, 
  deleteKnowledge 
} from '../knowledgeStore.js';
import { MODEL_CONFIG, listInstalledModels } from '../modelConfig.js';
import { Ollama } from 'ollama';

const router = express.Router();
const ollamaClient = new Ollama({ host: 'http://127.0.0.1:11434' });

/**
 * GET /api/knowledge
 * List all entries in the local knowledge base.
 */
router.get('/', async (req, res) => {
  const items = await listKnowledge();
  res.json({ items });
});

/**
 * DELETE /api/knowledge/:id
 * Remove an entry from the knowledge base.
 */
router.delete('/:id', async (req, res) => {
  await deleteKnowledge(req.params.id);
  res.json({ success: true });
});

/**
 * POST /api/ingest
 * Ingest a PDF, image, or text file into the knowledge base.
 */
router.post('/ingest', async (req, res) => {
  const { data, filename, type } = req.body;
  if (!data || !filename) {
    return res.status(400).json({ error: 'Missing document data or filename.' });
  }

  console.log(`[INGEST] Processing: ${filename} (type=${type || 'auto'})`);

  try {
    if (type === 'pdf' || filename.toLowerCase().endsWith('.pdf')) {
      const result = await ingestPDF(data, filename);
      res.json({ success: true, ...result });
    } else if (type === 'image' || /\.(png|jpg|jpeg|gif|webp)$/i.test(filename)) {
      // Resolve vision model
      const models = await listInstalledModels(ollamaClient);
      const visionModel = models.includes(MODEL_CONFIG.vision) ? MODEL_CONFIG.vision : models[0];
      
      const result = await ingestImage(data, filename, ollamaClient, visionModel);
      res.json({ success: true, ...result });
    } else {
      // Standard text ingestion
      const entry = await addKnowledge({
        source: filename,
        type: 'text',
        content: Buffer.from(data, 'base64').toString('utf-8'),
      });
      res.json({ success: true, entry });
    }
  } catch (err) {
    console.error(`[INGEST] Failed: ${err.message}`);
    res.status(500).json({ error: 'Ingestion failed: ' + err.message });
  }
});

export default router;
