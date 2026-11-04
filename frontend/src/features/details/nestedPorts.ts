import type { SemanticElement } from '../../api'

/** Direct nested port children of a port (hierarchical face). */
export function nestedPortsOf(
  port: SemanticElement | null | undefined,
  semantic: Record<string, SemanticElement>,
): SemanticElement[] {
  if (!port || port.kind !== 'port') return []
  return (port.children || [])
    .map((cid) => semantic[cid])
    .filter((c): c is SemanticElement => !!c && c.kind === 'port')
}
