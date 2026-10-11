# Accessibility, i18n, theming & performance notes (Phase 6)

## How it was checked
Automated (kept outside the repo, easy to recreate): **axe-core** (WCAG 2.0/2.1 A+AA, best-practice, plus WCAG 2.2 target size) over storefront, account, checkout and every admin page, in **EN/AR × light/dark × 320–375px/1280px** → 0 violations; **Lighthouse** (mobile emulation, production build); **Playwright** keyboard/interaction checks; horizontal-overflow sweep across widths 320–1440 and 150–175 % text zoom. Manual visual review of RTL + dark screenshots. **Not done:** a real screen-reader pass (VoiceOver/NVDA), Safari/Firefox testing, user testing — do these before launch.

## Accessibility decisions
- Skip link → focuses `<main>` (`tabIndex=-1`); native `<dialog>` for drawers/filters (focus trapped, Esc closes, focus returns to the opener).
- Search is an ARIA 1.2 combobox/listbox (arrow keys, Enter, first Esc only closes the list). Sort `<select>`, quantity, rating (radio buttons), wishlist (toggle `aria-pressed`) all have accessible names.
- Colour tokens: `--gold-ink` (gold as text), `--gold-fg`, `--danger-solid` guarantee AA contrast in both themes; decorative star glyphs stay bright gold next to numeric ratings.
- Focus-visible outline on everything, reduced-motion media query disables all animation (content stays visible), headings never skip levels (visually hidden `h2` on listings), localized `<title>` on every page (private pages are `noindex`), forms re-fill typed values after errors and tie messages with `aria-describedby`/`role=alert`.
- Touch targets ≥ 24 px (WCAG 2.2) — e.g. the password show/hide button was enlarged.

## i18n / RTL
`/en` and `/ar` routes, `dir`/`lang` on `<html>`, logical Tailwind utilities (`ms-/me-/start-/end-`), drawers open from the reading-start side, carousel arrows and "→" arrows flip, numbers/currency via `Intl` (`ar-AE`), bidi-safe fragments (`<bdi dir=ltr>` for "4.3 / 5", `dir=ltr` for phone numbers and order numbers). Language switch keeps the page, query string and hash. Locale is remembered in a cookie. Dictionaries are checked by a test (same keys in both languages). The admin is English-only by design. Legal/policy pages are merchant-written (placeholders ship clearly marked).

## Theme
Light / dark / system with a `<head>` script that sets `data-theme` before first paint (no flash); preference stored in `localStorage`; all colours are tokens, so dark mode covers storefront and admin.

## States
`loading.tsx` skeletons only where the page can't 404/redirect (search, deals, new, cart) — a loading boundary above a `notFound()`/`redirect()` makes Next send HTTP 200 (soft 404) — so product/category/journal/account pages stream without one. Localized `error.tsx` with a support reference (digest), `global-error.tsx`, root and admin `not-found`, empty states for cart/wishlist/orders/search/reviews/dashboard.

## Performance (production build, Lighthouse mobile emulation, local machine)
Home ≈ 92–93 (EN/AR), product ≈ 94, category ≈ 83–90, login ≈ 96; Accessibility 100 and Best-practices 100 on all storefront pages; CLS 0; TBT 50–270 ms; simulated LCP ≈ 3.0–3.8 s (throttled mobile model, localhost — treat as a relative indicator, **re-measure on the real host**). Done: Arabic font trimmed to 2 weights and not preloaded (English pages no longer download it), Zod removed from client bundles, one shared IntersectionObserver for scroll reveals, `next/image` with `sizes` and a host allow-list, deliberate caching (home/ISR 60 s; stock, prices, carts and orders are never cached). Ideas not yet done: real product photos (LCP images) with `priority`, CDN, HTTP caching headers for static assets on your host, trimming Next/React runtime is not possible.
