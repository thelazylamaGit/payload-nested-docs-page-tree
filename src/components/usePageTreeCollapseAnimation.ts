'use client'

import React from 'react'

import type { PageTreeDoc } from '../utilities/pageTree.js'

import {
  createRenderedRows,
  type PageTreeRenderedRow,
  type PageTreeResolvedCollapseAnimation,
  reconcileRenderedRows,
  settleRenderedRows,
} from '../utilities/collapseAnimation.js'

export type PageTreeAnimatedDoc = { doc: PageTreeDoc } & Omit<PageTreeRenderedRow, 'id'>

type CollapseAnimationState = {
  pageKey: string
  rows: PageTreeRenderedRow[]
  toggleSeq: number
  visibleIDs: ReadonlySet<string>
}

function getRowIDs(docs: PageTreeDoc[]): string[] {
  return docs.map((doc) => doc.__pageTreeID)
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * Keeps rows hidden by a collapse rendered while they animate closed.
 * `pageDocs` and `visibleDocs` stay the source of truth for pagination and drag
 * and drop; the returned `docs` only add closing rows for rendering.
 */
export function usePageTreeCollapseAnimation(args: {
  config: PageTreeResolvedCollapseAnimation
  docsByID: ReadonlyMap<string, PageTreeDoc>
  pageDocs: PageTreeDoc[]
  visibleDocs: PageTreeDoc[]
}) {
  const { config, docsByID, pageDocs, visibleDocs } = args
  const [toggleSeq, setToggleSeq] = React.useState(0)
  const pageIDs = React.useMemo(() => getRowIDs(pageDocs), [pageDocs])
  const pageKey = React.useMemo(() => pageIDs.join('\0'), [pageIDs])
  const visibleIDs = React.useMemo(() => new Set(getRowIDs(visibleDocs)), [visibleDocs])
  const [state, setState] = React.useState<CollapseAnimationState>(() => ({
    pageKey,
    rows: createRenderedRows(pageIDs),
    toggleSeq,
    visibleIDs,
  }))
  let currentState = state

  // Adjusted during render so closing rows are never unmounted, even for one commit.
  if (state.toggleSeq !== toggleSeq) {
    currentState = {
      pageKey,
      rows: reconcileRenderedRows({
        knownIDs: docsByID,
        pageIDs,
        previousRows: state.rows,
        previousVisibleIDs: state.visibleIDs,
        seq: toggleSeq,
        visibleIDs,
      }),
      toggleSeq,
      visibleIDs,
    }
    setState(currentState)
  } else if (state.pageKey !== pageKey) {
    // Pagination, sorting, refreshes, and reduced-motion toggles never animate.
    currentState = { pageKey, rows: createRenderedRows(pageIDs), toggleSeq, visibleIDs }
    setState(currentState)
  } else if (state.visibleIDs !== visibleIDs) {
    currentState = { ...state, visibleIDs }
    setState(currentState)
  }

  const { rows } = currentState
  const isAnimating = rows.some((row) => row.anim !== undefined)
  const notifyToggle = React.useCallback(() => {
    if (config.enabled && !prefersReducedMotion()) {
      setToggleSeq((seq) => seq + 1)
    }
  }, [config.enabled])
  const settle = React.useCallback((seq: number) => {
    setState((previousState) => {
      const nextRows = settleRenderedRows(previousState.rows, seq)

      return nextRows === previousState.rows ? previousState : { ...previousState, rows: nextRows }
    })
  }, [])
  const animatedDocs = React.useMemo<PageTreeAnimatedDoc[]>(
    () =>
      rows.flatMap(({ id, ...row }) => {
        const doc = docsByID.get(id)

        return doc ? [{ ...row, doc }] : []
      }),
    [docsByID, rows],
  )
  const docs = React.useMemo(
    () => (isAnimating ? animatedDocs.map((row) => row.doc) : pageDocs),
    [animatedDocs, isAnimating, pageDocs],
  )

  return {
    animatedDocs,
    docs,
    notifyToggle,
    settle,
    toggleSeq: isAnimating ? toggleSeq : null,
  }
}
