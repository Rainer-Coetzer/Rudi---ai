/**
 * Rudi Personality Formatter
 * Cleans and formats Rudi's responses for display.
 * Personality is handled by the model's system prompt — we don't inject it here.
 */

/**
 * Formats Rudi's response text for display:
 * - Strips JSON tool blocks from visible text
 * - Converts basic markdown to readable form for the chat panel
 * - Cleans up the GOAL/REASONING/ACTION labels for a cleaner presentation
 */
export function formatRudiResponse(text: string): string {
  if (!text) return text;

  let formatted = text;

  // Remove raw JSON tool blocks from display (they are handled by the tool executor)
  // Match JSON blocks that contain "tool" or "action" keys
  formatted = formatted.replace(/\{[\s\S]*?"tool"\s*:[\s\S]*?\}/g, '').trim();
  formatted = formatted.replace(/\{[\s\S]*?"action"\s*:[\s\S]*?\}/g, '').trim();

  
  formatted = formatted
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
