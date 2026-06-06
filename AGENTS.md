# AGENTS.md

## Project Vision

CLARVEX Team is a premium retail operations platform focused on store managers, assistant managers and sales associates.

The application must feel like a modern SaaS product comparable to Linear, Stripe Dashboard, Notion, Apple Business Manager and modern retail platforms.

Every screen must be mobile-first.

---

## Design System

### Visual Style

* Premium enterprise SaaS
* Modern glassmorphism
* Dark mode first
* Black background (#0A0A0A)
* Neon green accent (#00FF66)
* High contrast typography
* Clean spacing
* Minimal borders
* Smooth animations

### UX Rules

* Never create ugly admin panels.
* Avoid generic Bootstrap appearance.
* Every screen must look production ready.
* Every card must have hierarchy.
* Use loading states.
* Use empty states.
* Use hover states.
* Use subtle animations.

### Mobile Rules

* Mobile-first design.
* Must work perfectly on Android.
* Bottom navigation required.
* Large touch targets.
* Sticky actions when appropriate.

---

## Component Standards

Create reusable components:

* Button
* Card
* KPI Card
* Progress Card
* Activity Feed
* Status Badge
* User Avatar
* Notification Card
* Task Card

Never duplicate UI logic.

---

## Dashboard Standards

Manager dashboard must include:

* Store performance
* Team performance
* Pending tasks
* Critical alerts
* Daily plans
* Rankings

Associate dashboard must include:

* Daily target
* Daily sales
* KPI progress
* Schedule
* Daily plan
* Notifications

---

## Data Visualization

Use modern charts.

Preferred:

* Recharts

KPI cards must include:

* Trend
* Delta
* Progress
* Visual indicator

---

## Notifications

Design a complete notification system:

* Push notifications
* Read status
* Priority levels
* Notification center

---

## Code Quality

* TypeScript strict mode.
* No any types.
* Reusable hooks.
* Reusable services.
* Clean architecture.
* Server actions when possible.
* Prisma ORM.
* PostgreSQL.

---

## Future Features

Design architecture ready for:

* AI assistant
* Multi-store support
* Regional managers
* Retail analytics
* Performance reviews
* Commission calculations
* Attendance tracking
* Task automation

Always build with scalability in mind.
