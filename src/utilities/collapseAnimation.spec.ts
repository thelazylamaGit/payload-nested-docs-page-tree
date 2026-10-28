import { describe, expect, it } from 'vitest'

import {
  createRenderedRows,
  DEFAULT_COLLAPSE_ANIMATION_DURATION_MS,
  DEFAULT_COLLAPSE_ANIMATION_EASING,
  type PageTreeRenderedRow,
  reconcileRenderedRows,
  resolveCollapseAnimationConfig,
  settleRenderedRows,
} from './collapseAnimation.js'
import { buildPageTreeDocs, getVisibleTreeDocs } from './pageTree.js'

// home
// about
//   team
//     alice
//   history
// blog
//   post-1
// contact
const tree = buildPageTreeDocs([
  { id: 'home', parent: null },
  { id: 'about', parent: null },
  { id: 'team', parent: 'about' },
  { id: 'alice', parent: 'team' },
  { id: 'history', parent: 'about' },
  { id: 'blog', parent: null },
  { id: 'post-1', parent: 'blog' },
  { id: 'contact', parent: null },
])
const knownIDs = new Set(tree.map((doc) => doc.__pageTreeID))

function view(collapsed: string[], limit = tree.length, page = 1) {
  const visibleDocs = getVisibleTreeDocs(tree, new Set(collapsed))
  const start = (page - 1) * limit

  return {
    pageIDs: visibleDocs.slice(start, start + limit).map((doc) => doc.__pageTreeID),
    visibleIDs: new Set(visibleDocs.map((doc) => doc.__pageTreeID)),
  }
}

function toggle(args: {
  from: { rows: PageTreeRenderedRow[]; visibleIDs: ReadonlySet<string> }
  seq: number
  to: ReturnType<typeof view>
}) {
  const rows = reconcileRenderedRows({
    knownIDs,
    pageIDs: args.to.pageIDs,
    previousRows: args.from.rows,
    previousVisibleIDs: args.from.visibleIDs,
    seq: args.seq,
    visibleIDs: args.to.visibleIDs,
  })

  return { rows, visibleIDs: args.to.visibleIDs }
}

function initial(collapsed: string[], limit?: number) {
  const current = view(collapsed, limit)

  return { rows: createRenderedRows(current.pageIDs), visibleIDs: current.visibleIDs }
}

function describeRows(rows: PageTreeRenderedRow[]): string[] {
  return rows.map((row) => (row.anim ? `${row.id}:${row.anim}` : row.id))
}

describe('resolveCollapseAnimationConfig', () => {
  it('enables a snappy decelerating default when unset or true', () => {
    const defaults = {
      durationMs: DEFAULT_COLLAPSE_ANIMATION_DURATION_MS,
      easing: DEFAULT_COLLAPSE_ANIMATION_EASING,
      enabled: true,
    }

    expect(resolveCollapseAnimationConfig(undefined)).toEqual(defaults)
    expect(resolveCollapseAnimationConfig(true)).toEqual(defaults)
  })

  it('accepts a custom duration and easing', () => {
    expect(resolveCollapseAnimationConfig({ durationMs: 180.4, easing: ' ease-in-out ' })).toEqual({
      durationMs: 180,
      easing: 'ease-in-out',
      enabled: true,
    })
  })

  it('disables with false or a zero duration and ignores invalid values', () => {
    expect(resolveCollapseAnimationConfig(false).enabled).toBe(false)
    expect(resolveCollapseAnimationConfig({ durationMs: 0 }).enabled).toBe(false)
    expect(resolveCollapseAnimationConfig({ durationMs: -5 }).durationMs).toBe(160)
    expect(resolveCollapseAnimationConfig({ durationMs: Number.NaN }).durationMs).toBe(160)
    expect(resolveCollapseAnimationConfig({ easing: '' }).easing).toBe(DEFAULT_COLLAPSE_ANIMATION_EASING)
  })
})

describe('reconcileRenderedRows', () => {
  it('keeps hidden descendants as closing rows right after their parent', () => {
    const next = toggle({ from: initial([]), seq: 1, to: view(['about']) })

    expect(describeRows(next.rows)).toEqual([
      'home',
      'about',
      'team:closing',
      'alice:closing',
      'history:closing',
      'blog',
      'post-1',
      'contact',
    ])
  })

  it('starts revealed descendants opening', () => {
    const next = toggle({ from: initial(['about']), seq: 1, to: view([]) })

    expect(describeRows(next.rows)).toEqual([
      'home',
      'about',
      'team:opening',
      'alice:opening',
      'history:opening',
      'blog',
      'post-1',
      'contact',
    ])
  })

  it('keeps nested collapsed state when expanding a parent', () => {
    const next = toggle({ from: initial(['about', 'team']), seq: 1, to: view(['team']) })

    expect(describeRows(next.rows)).toEqual([
      'home',
      'about',
      'team:opening',
      'history:opening',
      'blog',
      'post-1',
      'contact',
    ])
  })

  it('keeps persisting rows as the same objects', () => {
    const from = initial([])
    const next = toggle({ from, seq: 1, to: view(['blog']) })

    expect(next.rows[0]).toBe(from.rows[0])
    expect(next.rows.find((row) => row.id === 'contact')).toBe(
      from.rows.find((row) => row.id === 'contact'),
    )
  })

  it('reverses closing rows to opening in place without duplicates', () => {
    const collapsed = toggle({ from: initial([]), seq: 1, to: view(['about']) })
    const reopened = toggle({ from: collapsed, seq: 2, to: view([]) })

    expect(describeRows(reopened.rows)).toEqual([
      'home',
      'about',
      'team:opening',
      'alice:opening',
      'history:opening',
      'blog',
      'post-1',
      'contact',
    ])
    expect(reopened.rows.filter((row) => row.anim).every((row) => row.seq === 2)).toBe(true)
  })

  it('reverses opening rows to closing again on a rapid third toggle', () => {
    const closed = toggle({ from: initial([]), seq: 1, to: view(['about']) })
    const opened = toggle({ from: closed, seq: 2, to: view([]) })
    const closedAgain = toggle({ from: opened, seq: 3, to: view(['about']) })

    expect(describeRows(closedAgain.rows)).toEqual([
      'home',
      'about',
      'team:closing',
      'alice:closing',
      'history:closing',
      'blog',
      'post-1',
      'contact',
    ])
    expect(new Set(closedAgain.rows.map((row) => row.id)).size).toBe(closedAgain.rows.length)
  })

  it('keeps an ongoing close untouched when an unrelated parent toggles', () => {
    const aboutClosed = toggle({ from: initial([]), seq: 1, to: view(['about']) })
    const blogClosed = toggle({ from: aboutClosed, seq: 2, to: view(['about', 'blog']) })

    expect(describeRows(blogClosed.rows)).toEqual([
      'home',
      'about',
      'team:closing',
      'alice:closing',
      'history:closing',
      'blog',
      'post-1:closing',
      'contact',
    ])
    expect(blogClosed.rows.find((row) => row.id === 'team')?.seq).toBe(1)
    expect(blogClosed.rows.find((row) => row.id === 'post-1')?.seq).toBe(2)
  })

  it('keeps a nested closing row closing when its ancestor re-expands', () => {
    // Collapse team (alice closes), then about (team and history close), then
    // re-expand about: team and history reopen, alice keeps closing under team.
    const teamClosed = toggle({ from: initial([]), seq: 1, to: view(['team']) })
    const aboutClosed = toggle({ from: teamClosed, seq: 2, to: view(['team', 'about']) })
    const aboutOpened = toggle({ from: aboutClosed, seq: 3, to: view(['team']) })

    expect(describeRows(aboutOpened.rows)).toEqual([
      'home',
      'about',
      'team:opening',
      'alice:closing',
      'history:opening',
      'blog',
      'post-1',
      'contact',
    ])
    expect(aboutOpened.rows.find((row) => row.id === 'alice')?.seq).toBe(1)
  })

  it('drops closing rows that were deleted', () => {
    const rows = reconcileRenderedRows({
      knownIDs: new Set(['about', 'home']),
      pageIDs: ['home', 'about'],
      previousRows: createRenderedRows(['home', 'about', 'team']),
      previousVisibleIDs: new Set(['about', 'home', 'team']),
      seq: 1,
      visibleIDs: new Set(['about', 'home']),
    })

    expect(describeRows(rows)).toEqual(['home', 'about'])
  })

  describe('pagination boundaries', () => {
    it('does not count closing rows toward the page and does not animate pulled-up rows', () => {
      // Page 1 of 4 rows: home, about, team, alice. Collapsing about pulls
      // blog, post-1 and contact up from page 2.
      const next = toggle({ from: initial([], 4), seq: 1, to: view(['about'], 4) })

      expect(view(['about'], 4).pageIDs).toEqual(['home', 'about', 'blog', 'post-1'])
      expect(describeRows(next.rows)).toEqual([
        'home',
        'about',
        'team:closing',
        'alice:closing',
        'blog',
        'post-1',
      ])
      expect(next.rows.filter((row) => row.anim !== 'closing')).toHaveLength(4)
    })

    it('drops rows pushed to the next page without animating them', () => {
      const next = toggle({ from: initial(['about'], 4), seq: 1, to: view([], 4) })

      // blog and post-1 move to page 2 immediately; they are still visible.
      expect(describeRows(next.rows)).toEqual(['home', 'about', 'team:opening', 'alice:opening'])
    })

    it('only animates revealed rows that land on the current page', () => {
      const next = toggle({ from: initial(['about'], 3), seq: 1, to: view([], 3) })

      expect(describeRows(next.rows)).toEqual(['home', 'about', 'team:opening'])
    })

    it('does not animate a toggle whose children fall on the next page', () => {
      // blog is the last row of page 2, so its child lands on page 3.
      const from = {
        rows: createRenderedRows(view(['blog'], 3, 2).pageIDs),
        visibleIDs: view(['blog'], 3).visibleIDs,
      }
      const to = view([], 3, 2)
      const next = toggle({ from, seq: 1, to })

      expect(to.pageIDs).toEqual(['alice', 'history', 'blog'])
      expect(describeRows(next.rows)).toEqual(['alice', 'history', 'blog'])
    })
  })
})

describe('settleRenderedRows', () => {
  const rows: PageTreeRenderedRow[] = [
    { id: 'parent' },
    { id: 'old-close', anim: 'closing', seq: 1 },
    { id: 'old-open', anim: 'opening', seq: 1 },
    { id: 'new-close', anim: 'closing', seq: 2 },
  ]

  it('removes closing rows and clears opening rows up to a toggle', () => {
    expect(settleRenderedRows(rows, 1)).toEqual([
      { id: 'parent' },
      { id: 'old-open' },
      { id: 'new-close', anim: 'closing', seq: 2 },
    ])
    expect(settleRenderedRows(rows, 2)).toEqual([{ id: 'parent' }, { id: 'old-open' }])
  })

  it('returns the same array when nothing is animating', () => {
    const settled = createRenderedRows(['a', 'b'])

    expect(settleRenderedRows(settled, 99)).toBe(settled)
  })
})
