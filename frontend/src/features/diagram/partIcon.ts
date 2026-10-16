/**
 * Part `_icon` attribute → Lucide allowlist for GeneralView headers.
 */
import type { LucideIcon } from 'lucide-react'
import {
  Battery,
  Car,
  CircuitBoard,
  Cog,
  Cpu,
  Disc,
  Fan,
  Gauge,
  HardDrive,
  Lightbulb,
  Lock,
  MonitorSpeaker,
  Radio,
  Zap,
} from 'lucide-react'
import type { SemanticElement } from '../../api'

export const PART_ICON_NAMES = [
  'battery',
  'cpu',
  'circuit-board',
  'cog',
  'car',
  'gauge',
  'zap',
  'hard-drive',
  'radio',
  'lightbulb',
  'lock',
  'disc',
  'fan',
  'monitor-speaker',
] as const

export type PartIconName = (typeof PART_ICON_NAMES)[number]

const ICON_BY_NAME: Record<PartIconName, LucideIcon> = {
  battery: Battery,
  cpu: Cpu,
  'circuit-board': CircuitBoard,
  cog: Cog,
  car: Car,
  gauge: Gauge,
  zap: Zap,
  'hard-drive': HardDrive,
  radio: Radio,
  lightbulb: Lightbulb,
  lock: Lock,
  disc: Disc,
  fan: Fan,
  'monitor-speaker': MonitorSpeaker,
}

export function stripIconQuotes(value: string): string {
  const v = value.trim()
  if (
    v.length >= 2 &&
    ((v[0] === '"' && v[v.length - 1] === '"') ||
      (v[0] === "'" && v[v.length - 1] === "'"))
  ) {
    return v.slice(1, -1).trim()
  }
  return v
}

export function isAllowedPartIcon(name: string): name is PartIconName {
  return (PART_ICON_NAMES as readonly string[]).includes(name)
}

/** Lucide component for an allowlisted icon name, else null. */
export function resolvePartIcon(name: string | null | undefined): LucideIcon | null {
  if (!name) return null
  const key = stripIconQuotes(name).toLowerCase()
  if (!isAllowedPartIcon(key)) return null
  return ICON_BY_NAME[key]
}

type IconAttrChild = {
  name: string
  kind?: string
  defaultValue?: string | null
}

function iconFromChildren(
  children: string[],
  semantic: Record<string, IconAttrChild | undefined>,
): string | null {
  for (const cid of children) {
    const child = semantic[cid]
    if (child?.kind === 'attribute' && child.name === '_icon') {
      const raw = child.defaultValue?.trim()
      if (!raw) return null
      const name = stripIconQuotes(raw)
      return name || null
    }
  }
  return null
}

/**
 * Read `_icon` from a part usage, falling back to its type definition
 * (same walk as attribute inheritance in buildStructureGraph).
 */
export function readPartIconName(
  semantic: Record<string, SemanticElement | undefined>,
  partId: string,
): string | null {
  const part = semantic[partId]
  if (!part) return null
  const direct = iconFromChildren(part.children || [], semantic)
  if (direct) return direct
  if (!part.typeRef) return null
  const typeDef = Object.values(semantic).find(
    (e) => e && e.kind === 'part' && e.name === part.typeRef && !e.typeRef,
  )
  if (!typeDef) return null
  return iconFromChildren(typeDef.children || [], semantic)
}
