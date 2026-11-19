import type { SemanticElement } from '../../../../api'

/** `UC006 Brake` when the use case has a short name, else just the name. */
export function useCaseLabel(el: Pick<SemanticElement, 'name' | 'shortId'>): string {
  return el.shortId ? `${el.shortId} ${el.name}` : el.name
}
