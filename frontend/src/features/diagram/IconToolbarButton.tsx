import type { ToolbarIconRef } from './iconRef'
import { iconmindCdnUrl } from './iconRef'

type Props = {
  icon: ToolbarIconRef
  title: string
  onClick: () => void
  disabled?: boolean
  /** Overrides title/aria when set (e.g. Copy busy/ok/err). */
  statusLabel?: string
}

/** Icon-only toolbar button; hint text lives in title + aria-label. */
export function IconToolbarButton({
  icon,
  title,
  onClick,
  disabled,
  statusLabel,
}: Props) {
  const label = statusLabel || title
  return (
    <button
      type="button"
      className="icon-toolbar-btn"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <img src={iconmindCdnUrl(icon)} alt="" className="icon-toolbar-btn__img" />
    </button>
  )
}
