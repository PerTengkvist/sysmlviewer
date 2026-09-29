import { toPng } from 'html-to-image'

const SKIP_CLASS = [
  'react-flow__minimap',
  'react-flow__controls',
  'react-flow__panel',
  'react-flow__attribution',
  'react-flow__background',
  'diagram-canvas-header',
  'tool-banner',
  'diagram-mode-badge',
  'diagram-paper-frame',
  'diagram-title-block',
]

function shouldIncludeNode(domNode: HTMLElement): boolean {
  if (!(domNode instanceof HTMLElement)) return true
  for (const cls of SKIP_CLASS) {
    if (domNode.classList?.contains(cls)) return false
  }
  return true
}

/** Wait for the next animation frame(s) so layout/paint can settle. */
export function waitFrames(count = 2): Promise<void> {
  return new Promise((resolve) => {
    const step = (n: number) => {
      if (n <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(() => step(n - 1))
    }
    step(count)
  })
}

/**
 * Rasterize a diagram DOM node to a PNG blob with a solid white background.
 * Caller should ensure light-theme styles are applied before calling.
 */
export async function diagramElementToPngBlob(
  element: HTMLElement,
): Promise<Blob> {
  const dataUrl = await toPng(element, {
    backgroundColor: '#ffffff',
    pixelRatio: Math.min(2, window.devicePixelRatio || 1),
    cacheBust: true,
    filter: shouldIncludeNode,
    style: {
      // Ensure CSS variables resolve to light palette on the clone root.
      // Inline node/edge colors must already be light (caller responsibility).
    },
  })
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  if (!blob || blob.size === 0) {
    throw new Error('Empty image')
  }
  return blob
}

export async function writeImageBlobToClipboard(blob: Blob): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard image copy is not supported in this browser')
  }
  await navigator.clipboard.write([
    new ClipboardItem({ [blob.type || 'image/png']: blob }),
  ])
}
