import type { SemanticElement } from '../../api'
import { relatedElementLabel } from './elementRelations'

/** `use case def UC001 StartVehicle`: type (dimmed), short id and name of an element. */
export function relatedElementText(
  semantic: Record<string, SemanticElement>,
  id: string,
): string {
  const l = relatedElementLabel(semantic, id)
  return [l.type, l.shortId, l.name].filter(Boolean).join(' ')
}

/** The same label as markup, with the type in its own span. */
export function RelatedElementName({
  semantic,
  id,
}: {
  semantic: Record<string, SemanticElement>
  id: string
}) {
  const l = relatedElementLabel(semantic, id)
  return (
    <>
      {l.type && <span className="relation-element-type">{l.type}</span>}
      {l.type && ' '}
      {l.shortId ? `${l.shortId} ${l.name}` : l.name}
    </>
  )
}
