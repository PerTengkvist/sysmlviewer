import type { ReactNode } from 'react'
import type { RealizationPrecision, SemanticElement } from '../../api'
import { RelatedElementName, relatedElementText } from './RelatedElementName'
import {
  hasRealizationInfo,
  type ElementRealization,
  type RealizationEntry,
  type RealizesEntry,
} from './realizationLinks'

type Semantic = Record<string, SemanticElement>

/** Element at the far end, in the same format as the Relations list. */
function RelatedLink({
  semantic,
  id,
  onOpenRelated,
}: {
  semantic: Semantic
  id: string
  onOpenRelated?: (id: string) => void
}) {
  const text = relatedElementText(semantic, id)
  const body = <RelatedElementName semantic={semantic} id={id} />
  if (onOpenRelated && semantic[id]) {
    return (
      <button
        type="button"
        className="link-button"
        data-related-id={id}
        title={`Open ${text}`}
        onClick={() => onOpenRelated(id)}
      >
        {body}
      </button>
    )
  }
  return <span data-related-id={id}>{body}</span>
}

function Badges({
  precision,
  viaInclude,
  viaUseCase = false,
}: {
  precision: RealizationPrecision
  viaInclude: boolean
  viaUseCase?: boolean
}) {
  return (
    <>
      {' '}
      <span className="realization-precision" data-precision={precision}>
        {precision}
      </span>
      {viaUseCase && (
        <>
          {' '}
          <span className="realization-via-include">via use case</span>
        </>
      )}
      {viaInclude && (
        <>
          {' '}
          <span className="realization-via-include">via include</span>
        </>
      )}
    </>
  )
}

function Section({
  title,
  kind,
  children,
}: {
  title: string
  kind: string
  children: ReactNode
}) {
  return (
    <div className="children relations-list realization-section" data-realization={kind}>
      <h3>{title}</h3>
      {children}
    </div>
  )
}

/**
 * Use case realization in Details: "Realized by" on a use case or a system step,
 * "Realizes" on a function step, flow, function, function node or logical part,
 * and the coverage findings of the element. Renders nothing without content.
 */
export function RealizationSections({
  info,
  semantic,
  onOpenRelated,
}: {
  info: ElementRealization
  semantic: Semantic
  onOpenRelated?: (id: string) => void
}) {
  if (!hasRealizationInfo(info)) return null
  const link = (id: string) => (
    <RelatedLink semantic={semantic} id={id} onOpenRelated={onOpenRelated} />
  )
  const entry = (e: RealizationEntry) => (
    <>
      {link(e.id)}
      <Badges precision={e.precision} viaInclude={e.viaInclude} />
    </>
  )
  const realizes = (items: RealizesEntry[]) => (
    <ul>
      {items.map((e) => (
        <li key={`${e.useCaseId}|${e.stepId ?? ''}`} data-use-case-id={e.useCaseId}>
          {e.stepId ? (
            <>
              {link(e.stepId)} <span aria-label="in">in</span> {link(e.useCaseId)}
            </>
          ) : (
            link(e.useCaseId)
          )}
          <Badges precision={e.precision} viaInclude={e.viaInclude} />
        </li>
      ))}
    </ul>
  )
  return (
    <>
      {info.realizedBy.length > 0 && (
        <Section title="Realized by" kind="realized-by">
          <ul>
            {info.realizedBy.map((g, i) => (
              <li key={g.function?.id ?? `loose-${i}`}>
                {g.function ? entry(g.function) : <span>Other function nodes</span>}
                {g.nodes.length > 0 && (
                  <ul>
                    {g.nodes.map((n) => (
                      <li key={n.id} data-node-id={n.id}>
                        {entry(n)}
                        {n.parts.length > 0 && (
                          <ul>
                            {n.parts.map((p) => (
                              <li key={p.id}>{entry(p)}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {info.performedBy && (
        <Section title="Performed by" kind="performed-by">
          <ul>
            <li>{link(info.performedBy)}</li>
          </ul>
        </Section>
      )}
      {info.stepRealizers.length > 0 && (
        <Section title="Realized by" kind="step-realized-by">
          <ul>
            {info.stepRealizers.map((r) => (
              <li key={r.stepId} data-step-id={r.stepId}>
                {link(r.stepId)}
                <Badges precision={r.precision} viaInclude={false} viaUseCase={r.viaUseCase} />
                {r.nodeIds.length > 0 && (
                  <>
                    {' '}
                    <span className="relation-stereotype">performed by</span>{' '}
                    {r.nodeIds.map((id, i) => (
                      <span key={id}>
                        {i > 0 && ', '}
                        {link(id)}
                      </span>
                    ))}
                  </>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {info.unrealized && (
        <Section title="Realized by" kind="unrealized">
          <p className="realization-unrealized">Not realized</p>
        </Section>
      )}
      {info.realizes.length > 0 && (
        <Section title="Realizes" kind="realizes">
          {realizes(info.realizes)}
        </Section>
      )}
      {info.realizesViaNode.length > 0 && (
        <Section title="Realizes (via function node)" kind="realizes-via-node">
          {realizes(info.realizesViaNode)}
        </Section>
      )}
      {info.findings.length > 0 && (
        <Section title="Realization warnings" kind="findings">
          <ul>
            {info.findings.map((f) => (
              <li key={`${f.code}|${f.message}`} className="realization-finding" data-code={f.code}>
                {f.message}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}
