# UAE E-Commerce Platform — Claude Code Master Prompt

## How to use this file

1. Create an empty project folder and open it in Claude Code.
2. Paste the **Execution Instructions** section below into Claude Code, or tell Claude to read this file.
3. Let Claude complete one phase at a time. Review and test each phase before proceeding.
4. Do not paste the entire prompt repeatedly. Keep this file in the repository as `PROJECT_SPEC.md`.

---`

# Execution Instructions

You are a senior full-stack engineer and pragmatic software architect. Build a polished, production-oriented multi-category e-commerce platform for the United Arab Emirates (UAE), including the storefront and a complete admin dashboard.

**Work efficiently and minimize token/credit usage.** First inspect the repository and existing code. Reuse what is already working. Do not regenerate files unnecessarily, do not produce huge explanations, and do not build every feature in one giant response. Create a concise implementation plan, then implement in small, testable phases. Keep `PROJECT_SPEC.md` as the source of truth and maintain a short `IMPLEMENTATION_STATUS.md` with completed work, current phase, known issues, and next steps.

Do not stop after producing mockups or a plan: implement the actual application. Do not claim a feature works unless it has been implemented and tested. If credentials or merchant accounts are unavailable, build the integration boundary, configuration, test mode, and clear setup instructions without faking successful live transactions.

## 1. Product goals

Create a trustworthy, modern, fast, user-friendly UAE shopping experience. The platform must support multiple product categories, product discovery, deals, product reviews, customer accounts, a reliable cart and checkout, payment integrations, order management, inventory, content publishing, and SEO.

The project must be maintainable and suitable for deployment. Avoid overengineering and unnecessary microservices. Use a modular monolith with clear domain boundaries.

## 2. Required technology

- Next.js with App Router, using the stable version compatible with the repository.
- TypeScript in strict mode.
- React Server Components by default; use Client Components only for interactions that need them.
- MongoDB with Mongoose or the official MongoDB driver. Choose one approach and use it consistently.
- Tailwind CSS and a small, consistent component system (shadcn/ui is acceptable if it fits the project).
- Zod for validating inputs and environment variables.
- React Hook Form for complex forms where useful.
- A maintained authentication solution compatible with the selected Next.js version. Secure sessions and server-side authorization are required.
- Use a maintained image storage provider or object storage abstraction for product images. Do not store large image files directly in MongoDB.
- Automated tests for core business rules, API/service functions, checkout totals, delivery fees, CSV validation, and permissions.
- ESLint and formatting tools; provide type-check, lint, test, and production build scripts.

Before adding a dependency, check whether the project already has a suitable one. Avoid unnecessary libraries.

## 3. UAE storefront experience

### Design direction
Build a distinctive, premium, modern retail design suitable for UAE shoppers. Use a restrained palette such as warm white, charcoal, deep emerald/teal, and a tasteful sand/gold accent. These are starting suggestions, not a requirement to imitate another retailer. Use accessible contrast, clear typography, generous spacing, high-quality product photography, subtle motion, and consistent design tokens.

The storefront should feel polished on mobile first and scale cleanly to tablet and desktop. Add skeletons, empty states, error states, loading feedback, toasts, accessible dialogs, and useful form validation. Avoid excessive gradients, excessive animation, cramped cards, and generic-looking template layouts. Respect reduced-motion preferences.

### Pages
- Home page with promotional hero/banner, category shortcuts, active deals, featured products, popular products, most-viewed products, new arrivals, and editorial/article sections.
- Category landing pages and nested category navigation.
- Product listing pages with pagination or carefully implemented infinite loading.
- Product detail page with gallery, price, discount, stock status, variants, quantity, delivery information, product description/specifications, ratings, reviews, related products, and add-to-cart.
- Search results page with query, suggestions if feasible, filters, sorting, pagination, and no-results state.
- Deals page with valid promotions and expiry information.
- Featured, popular, new-arrival, and most-viewed product collections.
- Wishlist/favourites.
- Cart and checkout.
- Sign in, sign up, password reset, account profile, saved addresses, order history, order detail, and tracking.
- CMS article/blog index, article detail, and relevant category/brand landing pages if brands are supported.
- Contact, About, FAQ, shipping/delivery policy, returns/refunds policy, privacy policy, terms, and payment/help pages.
- Custom 404 and useful error states.

### Product discovery and filters
Support search by product name, description, SKU, and category as appropriate. Add filters based on the category's available attributes, including price range, category, brand, rating, availability, discount, and variant attributes where applicable. Filters must be data-driven, validated on the server, reflected in shareable URL query parameters, and usable on mobile. Provide sorting by relevance, price low/high, newest, rating, and popularity. Do not load the entire product catalogue into the browser.

For large catalogues, use appropriate MongoDB indexes and efficient pagination. Use MongoDB text search initially where suitable; isolate search behind a service interface so a dedicated search engine can be added later if needed.

### Views, popularity, and recommendations
Record product views without allowing trivial refreshes or bots to inflate counts excessively. Keep view-event writes efficient and privacy-conscious. Define how “popular” and “most viewed” are calculated and make the period configurable where useful. Do not expose private customer information in analytics.

## 4. Internationalization and themes

- Support English (`en`) and Arabic (`ar`) from the start.
- Implement a real locale strategy, translated navigation/content labels, locale-aware formatting, and Arabic right-to-left layout. Switching languages must update direction and layout correctly, not just translate the header.
- Use a maintained i18n library compatible with the selected Next.js version.
- Use `Intl.NumberFormat` with UAE Dirham (AED) for currency display.
- Keep dates and number formatting locale-aware.
- Store theme preference using an accessible light/dark/system theme control; prevent a theme flash where feasible.
- Make layout, menus, product cards, tables, forms, filters, dialogs, and checkout work in both RTL and LTR.
- Seed a small, clearly labelled sample set of English and Arabic content. Do not machine-generate misleading translations for legal policies; leave reviewed copy configurable.

## 5. Customer accounts and security

Implement secure registration/sign-in, sign-out, password reset, session management, profile editing, saved addresses, and order history. Choose a suitable authentication approach and explain its configuration briefly in the README.

Requirements:
- Hash passwords with a modern password-hashing algorithm if passwords are stored locally.
- Validate and authorize every protected server action/API route.
- Enforce roles and permissions on the server, never only by hiding UI controls.
- Protect admin routes and sensitive actions.
- Validate inputs server-side with Zod; treat all browser input as untrusted.
- Add rate limits or a configurable rate-limiting interface for authentication, review submissions, coupon attempts, and checkout.
- Use secure cookies and CSRF protection where applicable to the chosen auth approach.
- Do not expose secrets, database credentials, payment secrets, internal error details, or private customer data to the client.
- Avoid logging passwords, tokens, full payment data, or unnecessary personal information.
- Use least-privilege database credentials and production-safe environment configuration.
- Add basic audit logging for sensitive admin actions.
- Do not store card numbers or CVV. Payment details must be handled by the payment provider's approved components/hosted checkout.

## 6. Cart, checkout, addresses, and orders

The cart must be robust, not just a visual demo:
- Add, remove, and change quantities.
- Handle unavailable products, changed prices, stock limits, and product variants.
- Persist guest carts appropriately and merge with a customer cart after sign-in without duplicating items.
- Keep cart state consistent across refreshes and devices for authenticated customers where practical.
- Recalculate price, discount, tax (if applicable), delivery fee, and final total on the server at checkout. Never trust totals sent by the browser.
- Prevent ordering quantities greater than available stock.
- Make checkout idempotent so repeated submissions do not create duplicate orders.
- Provide clear validation and recovery if payment or order creation fails.

Addresses should support UAE-specific fields: recipient name, phone, emirate, area/community, building/villa, apartment/unit, street, optional landmark, and delivery instructions. Validate phone and address fields sensibly without assuming every legitimate UAE address has the same format. Let customers save multiple addresses and choose a default.

Use an explicit order lifecycle, for example: pending payment, confirmed, processing, packed, shipped/out for delivery, delivered, cancelled, refund pending, refunded. Only allow valid state transitions. Save an order snapshot of product title/SKU/variant/price, discounts, delivery fee, and address so historical orders remain correct if catalogue data changes. Stock reservation/decrement and order creation must be designed to avoid overselling and duplicate processing.

Include order confirmation and status notification interfaces. If email/SMS provider credentials are absent, implement a provider abstraction, local development logging, and setup documentation rather than pretending messages were sent.

## 7. Payments

Support these methods through a provider abstraction:
- Credit/debit card.
- Apple Pay, where supported by the chosen gateway, merchant account, domain, device/browser, and UAE configuration.
- Google Pay, where supported by the chosen gateway and merchant setup.
- Cash on Delivery (COD).

Do not assume Apple Pay or Google Pay can be activated simply by adding a button. Select a payment gateway with documented UAE availability and support for the required methods. If the merchant has not selected a gateway, implement a clean adapter interface and recommend a configurable integration path; do not hard-code provider-specific logic throughout the application.

Payment requirements:
- Use hosted checkout or provider-approved tokenized/payment components.
- Verify payment status on the server using signed webhooks or the provider's server API.
- Verify webhook signatures and make webhook processing idempotent.
- Never mark an order paid solely because the browser redirects to a success page.
- Store provider transaction references and status, not raw card data.
- Handle pending, success, failure, cancellation, refunds, and webhook retries.
- COD orders should have a distinct payment state and admin controls.
- Add test/sandbox mode and document exactly which environment variables and merchant steps are required.
- Do not fake live payment success in production. Any development mock must be disabled by default in production and visibly labelled as test-only.

Tax/VAT treatment must be configurable and confirmed against the merchant's actual business setup. Do not hard-code legal or tax assumptions. Make currency, tax rules, and rounding rules explicit.

## 8. Delivery and promotions

Admin-configurable delivery rules:
- Base delivery fee.
- Free delivery above a configurable order subtotal.
- Different fees by emirate/area or delivery zone.
- Optional COD fee if the business chooses to use one.
- Minimum order value.
- Estimated delivery text or ranges.
- Enable/disable delivery zones and methods.
- Configurable returns/refund policy text.

Make the calculation order explicit: eligible item subtotal, item discounts, coupon discount, tax treatment, delivery fee, any configured COD fee, and final payable total. Validate coupon eligibility and dates on the server. Prevent stacking rules unless explicitly allowed. Show customers a transparent fee breakdown before they place an order.

Promotions should support percentage/fixed discounts, start/end dates, active status, usage limits, per-customer limits, minimum subtotal, applicable products/categories, and exclusions. Product sale prices and deal badges must be derived from valid rules rather than arbitrary frontend values.

## 9. Reviews and ratings

- Customers may review only eligible purchased products if the store chooses verified-purchase reviews.
- Store rating, review text, timestamps, moderation status, and verified-purchase status.
- Prevent duplicate reviews per customer/product unless editing is supported.
- Validate length and sanitize/render text safely.
- Add report/flag, approve, reject, hide, and moderation workflows in admin.
- Calculate average rating and count reliably; avoid trusting client-submitted ratings.
- Show rating distribution and helpful review sorting where useful.
- Provide a seeded example only in development; never create fake reviews for a live store.

## 10. Admin dashboard

Create a separate, protected admin experience with a consistent navigation system and responsive layout. Include role-based access such as Owner/Admin, Catalogue Manager, Order/Operations Manager, and Content Editor. Keep the first version practical; use permissions rather than complex enterprise RBAC unless needed.

### Dashboard and reports
- Sales/orders summary, order status overview, low-stock alerts, best-selling products, popular products, and recent activity.
- Date-range filters and clear definitions for metrics.
- Handle empty datasets gracefully.
- Do not expose private customer data unnecessarily.

### Product management
- Create, edit, archive, publish/unpublish, and delete products with safe confirmation.
- Fields: name, slug, SKU, description, specifications, category/subcategory, brand (optional), images, variants, price, sale price, stock, low-stock threshold, weight/dimensions if needed, tags, attributes, SEO metadata, status, and featured flag.
- Validate unique slugs/SKUs, price ranges, image formats, variant combinations, and inventory.
- Support draft/published states, image ordering, alt text, and bulk actions.
- Track stock adjustments with reason, quantity change, actor, and timestamp.

### Category and attribute management
- CRUD for categories/subcategories, category images, descriptions, SEO fields, ordering, active status, and parent-child relationships.
- Support category-specific attributes so filters are relevant to each product type.
- Prevent circular category relationships and unsafe deletion of categories with active products.
- Allow CSV category import with validation and a downloadable error report.

### CSV product import/export
- Admin can download a sample CSV template, upload CSV, preview rows, validate them, map supported columns if practical, see row-level errors, and confirm import.
- Support bulk create/update using a stable identifier such as SKU.
- Never silently skip invalid rows or overwrite fields unexpectedly.
- Provide a summary: created, updated, skipped, failed, plus a downloadable error CSV.
- Handle large files in bounded batches with size/row limits and progress feedback.
- Validate category references, image URLs, prices, stock, slugs, and required fields.
- Provide product and category CSV export.
- Document exact column names, formats, and example CSVs in `/docs`.
- Use safe parsing and never execute spreadsheet formulas. Protect exports from CSV formula injection.

### Orders and operations
- Search/filter orders by order number, date, status, payment status, and customer.
- View order snapshot, address, fee breakdown, payment references, and order timeline.
- Update valid order statuses with audit trail.
- Manage cancellation/refund workflows and stock-restoration rules.
- Do not claim a refund was processed unless the payment provider confirms it.

### Other admin modules
- Inventory and low-stock alerts.
- Reviews and reports moderation.
- Deals/coupons/promotion rules.
- Delivery zones, delivery fees, free-delivery threshold, and COD configuration.
- Articles/blog: drafts, publish scheduling if feasible, categories, cover image, slug, author, and SEO fields.
- Homepage content: hero banners, category order, featured collections, and active campaigns.
- Customer lookup and account status with privacy controls.
- Admin user/role management.
- Store settings: store name, support contacts, logo, locales, currency, tax configuration, payment provider settings references, and policies.
- Audit log for important changes.

Never store secret payment keys as ordinary editable text visible to every admin. Use server environment variables or a secure secret-management mechanism.

## 11. SEO, performance, and accessibility

SEO:
- Unique title, meta description, canonical URL, Open Graph metadata, and social image where appropriate.
- Server-rendered product/category/article content where beneficial.
- Product, BreadcrumbList, Organization, and Article structured data only when accurate and consistent with visible page content.
- XML sitemap(s), robots.txt, canonical URLs, sensible pagination rules, and redirect support for changed slugs.
- Localized metadata and hreflang/canonical strategy for English and Arabic.
- Human-readable URLs and editable slugs.
- Avoid indexing admin, account, cart, checkout, internal search parameter combinations, and private pages.
- Do not invent reviews, prices, stock, shipping promises, or structured-data claims.

Performance:
- Optimize images with the framework's image solution and a sensible remote-image allowlist.
- Use caching/revalidation deliberately; inventory, prices, cart, and order states must not be served from unsafe stale caches.
- Avoid unnecessary client-side JavaScript and repeated database queries.
- Add indexes based on real query patterns and explain how to inspect query performance.
- Use pagination, projections, and bounded results.
- Target strong Core Web Vitals but measure rather than claim scores without tests.
- Add loading/error boundaries where appropriate.

Accessibility:
- Semantic HTML, keyboard navigation, visible focus, accessible labels, dialog focus management, contrast, and reduced motion.
- Ensure RTL and theme changes do not break keyboard or screen-reader use.

## 12. MongoDB data model

Design and document a sensible schema before implementing. Likely collections:
- users
- addresses (embedded or separate based on access patterns)
- categories
- products
- carts
- orders
- reviews
- coupons/promotions
- deliveryZones/settings
- articles
- productViewEvents or aggregated view metrics
- inventoryMovements
- paymentTransactions or payment references
- adminAuditLogs
- homepage/StoreSettings as appropriate

Use timestamps, schema validation, indexes, and unique constraints where appropriate. Define relationships and deletion/archive behavior. Avoid unbounded embedded arrays. Store historical order snapshots. Use transactions only where supported by the deployment topology and where they materially protect consistency; document MongoDB Atlas/replica-set requirements. If a workflow cannot rely on a transaction, implement a safe compensating/idempotent strategy.

## 13. Architecture and code quality

Keep a clear structure, for example:
- `app/` for routes, layouts, and route handlers
- `components/` for shared UI
- `features/` for catalogue, cart, checkout, orders, reviews, admin, and content
- `lib/` for database, auth, validation, payments, storage, i18n, and utilities
- `models/` or `server/db/` for schemas and data access
- `messages/` for locale dictionaries
- `scripts/` for seed and maintenance scripts
- `tests/` for unit/integration tests
- `docs/` for CSV templates, architecture notes, deployment, and operations

Adapt to the existing repository rather than forcing this exact structure. Keep server-only modules separate from client code. Use service/repository boundaries for business-critical areas, but avoid abstraction for its own sake. No massive single-file components. No placeholder buttons that do nothing. No hard-coded secret values. No duplicated business logic between UI and server.

## 14. Environment and deployment

Provide `.env.example` with variable names and safe placeholders only. Never commit real credentials.

Document configuration for:
- MongoDB connection string and database name.
- Authentication/session secrets and allowed site URL.
- Payment provider public configuration and server secrets.
- Payment webhook secret.
- Product image/object storage.
- Email provider, if used.
- Rate limiting, if an external service is selected.
- Store locale/currency and relevant feature flags.

Deployment should be suitable for a Next.js hosting provider such as Vercel and MongoDB Atlas, while avoiding provider lock-in where reasonable. Include:
- Local development instructions.
- Database/index setup and seed instructions.
- Separate development/staging and production environment variables/databases.
- Migration/schema-change approach.
- Build, type-check, lint, and test commands.
- Production deployment checklist, backups, monitoring/logging, error reporting, and rollback guidance.
- Secure handling of webhook URLs and secrets.
- A clear statement of which integrations require merchant/provider accounts.

## 15. Seed data and demo experience

Create a development-only seed script with realistic sample categories, products, variants, a few deals, delivery zones, articles, and test users/admin roles. Use clearly identified demo data and no fake customer reviews in production. Never run destructive seeding automatically on production. Document how to reset only a local development database safely.

Suggested example categories: Electronics, Mobiles & Accessories, Fashion, Beauty, Home & Kitchen, Grocery, Sports & Outdoors, Baby & Kids, and Automotive. Make categories editable rather than hard-coded into the whole application.

## 16. Testing and acceptance criteria

Write and run tests for:
- Cart quantity changes and merging.
- Server-side total calculation and rounding.
- Coupon eligibility and stacking rules.
- Free delivery threshold and delivery-zone fees.
- Stock validation, reservation/decrement, and order idempotency.
- Payment webhook signature validation and duplicate webhook events.
- Valid and invalid order status transitions.
- Review permissions and moderation.
- CSV import validation, duplicate SKU handling, partial failures, and formula-injection protection.
- Admin authorization and role restrictions.
- Locale switching and RTL layout at least through key-page checks.
- Product filters/sorting and SEO metadata for representative routes.

Before declaring a phase done, run the relevant tests plus type-check/lint as configured. Fix regressions rather than hiding or disabling tests.

## 17. Required working method — credit-efficient

Follow these phases in order. At the beginning of each phase, inspect current implementation and do not redo completed work.

**Phase 0 — Inspect and plan**
- Inspect repository, package manager, scripts, existing routes/components, and current dependencies.
- Summarize architecture and missing pieces in at most 10 bullets.
- Create a short phase checklist in `IMPLEMENTATION_STATUS.md`.
- Ask a question only if an important business decision blocks safe implementation. Otherwise use sensible documented defaults.

**Phase 1 — Foundation**
- Configure Next.js, TypeScript, styling, linting, shared design tokens, app shell, navigation, footer, responsive layout, and accessible component primitives.
- Add environment validation, MongoDB connection reuse, error handling, and initial documentation.

**Phase 2 — Data and catalogue**
- Implement schemas/indexes, category and product services, development seed data, listing/detail pages, search, filtering, sorting, pagination, image handling, and SEO basics.

**Phase 3 — Identity and shopping**
- Implement authentication, profile, addresses, wishlist, guest/authenticated cart persistence, and robust server-side cart validation.

**Phase 4 — Checkout and orders**
- Implement delivery calculation, discounts, checkout, order snapshots, stock consistency, order lifecycle, COD, and payment-provider abstraction.
- Integrate real payment methods only when gateway choice and credentials are available.

**Phase 5 — Admin**
- Implement protected admin layout, roles, dashboard, product/category CRUD, inventory, orders, reviews, promotions, delivery settings, CSV imports/exports, articles, and store settings.

**Phase 6 — i18n, theme, and polish**
- Complete English/Arabic translations, RTL/LTR behavior, light/dark/system theme, accessibility, responsive edge cases, empty/loading/error states, and UX refinement.

**Phase 7 — Hardening and deployment**
- Run tests, type-check, lint, production build, and fix issues.
- Verify security-sensitive flows, webhook idempotency, permissions, caching, indexes, metadata, sitemap, and robots rules.
- Finish README, `.env.example`, CSV docs/templates, deployment instructions, and `IMPLEMENTATION_STATUS.md`.

At the end of each phase:
1. Give a brief summary of files/features changed.
2. List exact commands run and their outcomes.
3. List blockers that require credentials or a business decision.
4. Update `IMPLEMENTATION_STATUS.md`.
5. Stop at a sensible checkpoint instead of starting the next large phase without reviewing the result.

If the context window is running low, update `IMPLEMENTATION_STATUS.md` with exact next steps, then stop. On continuation, read the status file and inspect the relevant code before proceeding. Do not repeat the whole project specification in responses.

## 18. Final definition of done

The project is not done until:
- The storefront and admin run locally.
- Core product discovery, cart, addresses, delivery calculation, order creation, and COD flow work end-to-end.
- Real payment methods are integrated and verified where credentials and merchant setup are available; otherwise their adapter, sandbox instructions, and blockers are clearly documented.
- Admin can manage products, categories, inventory, orders, reviews, deals, delivery rules, and articles.
- CSV product/category import has validation, preview, error reporting, and export.
- English/Arabic and RTL/LTR work on key journeys; theme switching works.
- SEO basics, accessibility, tests, and production configuration are in place.
- Type-check, lint, tests, and production build pass, or any remaining failure is explicitly documented with evidence.
- README and `.env.example` explain setup without exposing secrets.

**Start with Phase 0 now. Inspect the repository first, then implement Phase 1. Do not merely return a plan.**
