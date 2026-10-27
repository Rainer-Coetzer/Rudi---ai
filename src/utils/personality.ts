/**
 * Rudi Personality Formatter
 * Cleans and formats Rudi's responses for display.
 * Personality is handled by the model's system prompt — we don't inject it here.
 */

/**
 * Formats Rudi's response text for display:
 * - Cleans up the GOAL/REASONING/ACTION labels for a cleaner presentation
 *
 * Tool-call JSON is already removed by splitToolCalls (utils/toolCalls.ts), which
 * leaves code and other braces intact — don't strip braces here.
 */
export function formatRudiResponse(text: string): string {
  if (!text) return text;

  let formatted = text

    .replace(/\[GOAL\]/g, '🎯 GOAL:')
    .replace(/\[REASONING\]/g, '💭 REASONING:')
    .replace(/\[TOOL SELECTED\]/g, '🔧 TOOL:')
    .replace(/\[ACTION\]/g, '▶ ACTION:');

  // Trim excessive whitespace / blank lines
  formatted = formatted.replace(/\n{3,}/g, '\n\n').trim();

  return formatted;
}

/**
 * Strips all formatting from text for TTS playback — clean speech only.
 */
export function stripForSpeech(text: string): string {
  return text
    .replace(/\[\[TOOL:[^\]]+\]\]/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/🎯 GOAL:|💭 REASONING:|🔧 TOOL:|▶ ACTION:/g, '')
    .replace(/\[GOAL\]|\[REASONING\]|\[TOOL SELECTED\]|\[ACTION\]/g, '')
    .replace(/[*_`#>]/g, '')
    .replace(/\{[\s\S]*?\}/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .trim();
}
