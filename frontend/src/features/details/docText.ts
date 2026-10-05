import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'

/** Markdown plugins for the Documentation panel: GFM plus newline = end of line. */
export const documentationRemarkPlugins = [remarkGfm, remarkBreaks]

/**
 * Interpret a literal `\n` escape as a newline.
 * Real newline characters are left unchanged so the markdown renderer can
 * treat them as end-of-line.
 */
export function interpretDocNewlines(text: string): string {
  return text.replace(/\\n/g, '\n')
}
