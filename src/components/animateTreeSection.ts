import type { PageTreeRowAnimation } from '../utilities/collapseAnimation.js'

const EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'

/**
 * Opens or closes a run of table rows as one collapsible section.
 *
 * Table rows cannot share a wrapper, so the section is animated as a whole:
 * its rows are revealed by one clip edge, the rows below slide with it, and the
 * table container's height follows so content under the table moves too. All
 * animations share one timing, and closing plays the opening in reverse, so a
 * toggle mid-animation only needs `reverse()`. The section rows must be laid
 * out at full height when this is called.
 */
export function animateTreeSection(args: {
  anim: PageTreeRowAnimation
  container: HTMLElement
  durationMs: number
  sectionRows: HTMLTableRowElement[]
}): Animation[] {
  const { anim, container, durationMs, sectionRows } = args
  const firstRow = sectionRows[0]
  const lastRow = sectionRows.at(-1)

  if (!firstRow || !lastRow) {
    return []
  }

  const top = firstRow.getBoundingClientRect().top
  const sectionHeight = lastRow.getBoundingClientRect().bottom - top
  const containerHeight = container.getBoundingClientRect().height

  if (sectionHeight <= 0) {
    return []
  }

  const timing: KeyframeAnimationOptions = {
    direction: anim === 'opening' ? 'normal' : 'reverse',
    duration: durationMs,
    easing: EASING,
    fill: 'both',
  }
  const animations = sectionRows.map((row) => {
    const rect = row.getBoundingClientRect()
    const start = (rect.top - top) / sectionHeight
    const end = (rect.bottom - top) / sectionHeight
    const hidden = `inset(0 0 ${rect.height}px 0)`

    // The row stays hidden until the edge reaches it, then is uncovered top-down.
    return row.animate(
      [
        { clipPath: hidden, offset: 0 },
        { clipPath: hidden, offset: start },
        { clipPath: 'inset(0 0 0 0)', offset: end },
        { clipPath: 'inset(0 0 0 0)', offset: 1 },
      ],
      timing,
    )
  })
  let row = lastRow.nextElementSibling

  while (row) {
    animations.push(
      row.animate(
        [{ transform: `translateY(${-sectionHeight}px)` }, { transform: 'translateY(0)' }],
        timing,
      ),
    )
    row = row.nextElementSibling
  }

  animations.push(
    container.animate(
      [
        { height: `${containerHeight - sectionHeight}px`, overflow: 'clip' },
        { height: `${containerHeight}px`, overflow: 'clip' },
      ],
      timing,
    ),
  )

  return animations
}
