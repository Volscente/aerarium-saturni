import { test, expect } from '@playwright/test'

test.describe('mobile LaTeX overflow regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/codex/fundamentals/mathematics')
    await page.waitForLoadState('networkidle')
  })

  test('no horizontal overflow at 375 px viewport', async ({ page }) => {
    // Confirm the page does not cause horizontal scrolling
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(hasOverflow).toBe(false)
  })

  test('all .katex-display elements are wrapped in overflow-x-auto containers', async ({ page }) => {
    const unwrapped = await page.evaluate(() => {
      const displays = document.querySelectorAll('.katex-display')
      return Array.from(displays).filter((el) => {
        const parent = el.parentElement
        return !parent?.classList.contains('overflow-x-auto')
      }).length
    })
    expect(unwrapped).toBe(0)
  })

  test('visual snapshot — Black-Scholes page at 375 px', async ({ page }) => {
    // Baseline snapshots are generated on Linux CI via the update-snapshots job.
    // macOS dev runs will show expected diff warnings — this is acceptable.
    await expect(page).toHaveScreenshot('fundamentals-mathematics-mobile.png', {
      fullPage: true,
    })
  })
})
