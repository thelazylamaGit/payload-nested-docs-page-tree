import type { NestedDocsPageTreePluginCollapseAnimationConfig } from '../types.js'

export const DEFAULT_COLLAPSE_ANIMATION_DURATION_MS = 200

export type PageTreeResolvedCollapseAnimation = {
  durationMs: number
  enabled: boolean
}

export type PageTreeRowAnimation = 'closing' | 'opening'

export type PageTreeRenderedRow = {
  anim?: PageTreeRowAnimation
  id: string
  /** Toggle that started the current animation. */
  seq?: number
}

export function resolveCollapseAnimationConfig(
  value: NestedDocsPageTreePluginCollapseAnimationConfig | undefined,
): PageTreeResolvedCollapseAnimation {
  if (value === false) {
    return { durationMs: DEFAULT_COLLAPSE_ANIMATION_DURATION_MS, enabled: false }
  }

  const durationMs =
    typeof value === 'object' &&
    value !== null &&
    typeof value.durationMs === 'number' &&
    Number.isFinite(value.durationMs) &&
    value.durationMs >= 0
      ? Math.round(value.durationMs)
      : DEFAULT_COLLAPSE_ANIMATION_DURATION_MS

  return { durationMs, enabled: durationMs > 0 }
}

export function createRenderedRows(pageIDs: readonly string[]): PageTreeRenderedRow[] {
  return pageIDs.map((id) => ({ id }))
}

/**
 * Merges the rows rendered before a toggle with the new page of visible rows.
 *
 * Rows newly hidden by a collapsed ancestor stay rendered as `closing` after the
 * row that preceded them, and rows revealed by an expand start `opening`. Rows
 * that were mid-animation reverse in place. Rows that
 * only crossed a page boundary are added or dropped without animation, so
 * closing rows never count toward pagination.
 */
export function reconcileRenderedRows(args: {
  knownIDs: { has: (id: string) => boolean }
  pageIDs: readonly string[]
  previousRows: readonly PageTreeRenderedRow[]
  previousVisibleIDs: ReadonlySet<string>
  seq: number
  visibleIDs: ReadonlySet<string>
}): PageTreeRenderedRow[] {
  const { knownIDs, pageIDs, previousRows, previousVisibleIDs, seq, visibleIDs } = args
  const pageIDSet = new Set(pageIDs)
  const previousRowsByID = new Map(previousRows.map((row) => [row.id, row]))
  const closingRowsByAnchorID = new Map<null | string, PageTreeRenderedRow[]>()
  let anchorID: null | string = null

  for (const row of previousRows) {
    if (pageIDSet.has(row.id)) {
      anchorID = row.id
      continue
    }

    // Rows still visible were paged out, and unknown rows were deleted.
    if (visibleIDs.has(row.id) || !knownIDs.has(row.id)) {
      continue
    }

    const anchoredRows = closingRowsByAnchorID.get(anchorID) ?? []

    anchoredRows.push(row.anim === 'closing' ? row : { id: row.id, anim: 'closing', seq })
    closingRowsByAnchorID.set(anchorID, anchoredRows)
  }

  const nextRows: PageTreeRenderedRow[] = [...(closingRowsByAnchorID.get(null) ?? [])]

  for (const id of pageIDs) {
    const previousRow = previousRowsByID.get(id)

    if (previousRow?.anim === 'closing') {
      nextRows.push({ id, anim: 'opening', seq })
    } else if (previousRow) {
      nextRows.push(previousRow)
    } else if (!previousVisibleIDs.has(id)) {
      nextRows.push({ id, anim: 'opening', seq })
    } else {
      nextRows.push({ id })
    }

    nextRows.push(...(closingRowsByAnchorID.get(id) ?? []))
  }

  return nextRows
}

/**
 * Finishes every animation started at or before `seq`: closing rows are
 * removed and opening rows become plain rows. Returns the same array when
 * nothing changed.
 */
export function settleRenderedRows(
  rows: PageTreeRenderedRow[],
  seq: number,
): PageTreeRenderedRow[] {
  const isSettling = (row: PageTreeRenderedRow) => row.seq !== undefined && row.seq <= seq

  if (!rows.some(isSettling)) {
    return rows
  }

  return rows.flatMap((row) => {
    if (!isSettling(row)) {
      return [row]
    }

    return row.anim === 'closing' ? [] : [{ id: row.id }]
  })
}
