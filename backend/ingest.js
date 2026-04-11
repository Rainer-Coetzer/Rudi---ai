import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { addKnowledge } from './knowledgeStore.js';

/**
 * PDF Ingestion using pdfjs-dist (Mozilla PDF.js)
 * Extracts full text from each page and stores as knowledge chunks.
 */
export async function ingestPDF(base64Data, filename) {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const uint8 = new Uint8Array(buffer);

    const doc = await getDocument({ data: uint8, stopOnErrors: false }).promise;
    const totalPages = doc.numPages;
    const chunks = [];

    for (let i = 1; i <= totalPages; i++) {
      try {
        const page = await doc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map(item => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (pageText.length > 30) {
          chunks.push({ page: i, text: pageText });
        }
      } catch (pageErr) {
        console.warn(`[INGEST] Failed to parse PDF page ${i}:`, pageErr);
      }
    }

    if (chunks.length === 0) throw new Error('No extractable text found in PDF.');

    const entries = [];
    for (const chunk of chunks) {
      const entry = await addKnowledge({
        source: `${filename} (page ${chunk.page}/${totalPages})`,
        type: 'pdf',
        content: chunk.text,
      });
      entries.push(entry);
    }

    return { success: true, pages: totalPages, chunks: entries.length, filename };
  } catch (err) {
    console.error(`[INGEST] PDF Failure (${filename}):`, err);
    return { success: false, error: err.message, filename };
  }
}

/**
 * Image Ingestion — delegates to vision model for description
 */
export async function ingestImage(base64Data, filename, ollamaClient, visionModel) {
  try {
    const response = await ollamaClient.generate({
      model: visionModel,
      prompt: 'Describe this image in detail. Extract any text, code, diagrams, UI layouts, or data visible. Be thorough.',
      images: [base64Data],
      stream: false,
    });

    const entry = await addKnowledge({
      source: filename,
      type: 'image',
      content: response.response,
    });

    return { success: true, filename, entry };
  } catch (err) {
    console.error(`[INGEST] Vision Failure (${filename}):`, err);
    return { success: false, error: err.message, filename };
  }
}
