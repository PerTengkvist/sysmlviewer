/** Whether the dashed label leader (anchor line) should be drawn. */
export function shouldShowLabelLeader(
  altHeld: boolean,
  offset: { x: number; y: number } | null | undefined,
  threshold = 0.5,
): boolean {
  if (!altHeld) return false
  const x = offset?.x ?? 0
  const y = offset?.y ?? 0
  return Math.hypot(x, y) > threshold
}
