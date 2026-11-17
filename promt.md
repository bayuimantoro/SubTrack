# PROJECT: SUBTRACK — Subscription Management Dashboard

You are working as a senior full-stack engineer, UI/UX designer, software architect, and QA engineer.

Build a polished, production-minded subscription tracking web application called **SubTrack**.

## 1. Product Vision

SubTrack helps users manage all their recurring subscriptions in one place.

Users often forget:
- Which applications and websites they subscribe to.
- How much each subscription costs.
- When the next payment is due.
- Which subscriptions are still active.
- How much they spend monthly and annually.

The goal is to eliminate the need to open multiple applications or websites just to check subscription details.

Product tagline: **All subscriptions. One dashboard. Zero surprises.**

## 2. Mandatory Agent and Skill Usage

Before implementation:

1. Use Superpowers brainstorming to analyze the requirements and identify missing decisions.
2. Use Superpowers writing-plans to create an implementation plan.
3. Use ECC architecture and coding-standards skills to establish project structure and conventions.
4. Use UI/UX Pro Max to generate a consistent design system and interface guidelines.
5. Use relevant ECC specialist agents for code review, security, database design, and debugging.
6. Use Superpowers TDD where appropriate.

Do not merely claim these skills or agents were used. Only use those actually available in the Antigravity runtime.

Avoid unnecessary parallel agents and duplicated work.

## 3. Recommended Technology Stack

Use:
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Supabase
- PostgreSQL
- Recharts
- Lucide Icons

Before selecting dependencies, inspect the existing environment and installed packages.

If the workspace already contains a project, inspect it before changing anything. Do not overwrite an existing project or delete existing files.

If the workspace is empty, initialize the project cleanly.

## 4. Design Direction

Create a premium, modern SaaS dashboard.

Visual characteristics:
- Dark mode as the default appearance.
- Clean, minimal, sophisticated interface.
- Excellent typography and spacing.
- Subtle borders and shadows.
- Carefully designed hover and transition states.
- Responsive layout for desktop, tablet, and mobile.
- Consistent iconography.
- Avoid excessive gradients, excessive glassmorphism, and unnecessary decoration.

Use UI/UX Pro Max recommendations rather than inventing arbitrary design rules.

The interface must look like a real commercial SaaS product, not a generic admin template.

## 5. Main Application Pages

### A. Dashboard

Display:
- Total active subscriptions.
- Total monthly recurring expenses.
- Estimated annual subscription expenses.
- Upcoming payments.
- Recently added subscriptions.
- Monthly spending chart.
- Spending by category.
- Quick action to add a subscription.

Use Indonesian Rupiah (IDR) as the initial default currency.

### B. My Subscriptions

Display subscriptions in a searchable and filterable list or card layout.

Each subscription must contain:
- Service name.
- Service logo or fallback icon.
- Category.
- Price.
- Currency.
- Billing interval.
- Start date.
- Next billing date.
- Payment method (optional).
- Website URL (optional).
- Notes (optional).
- Status: Active, Paused, or Cancelled.

Support:
- Add subscription.
- Edit subscription.
- Delete subscription with confirmation.
- Search by service name.
- Filter by category and status.
- Sort by price and next billing date.

### C. Subscription Details

Show:
- Full subscription information.
- Billing history.
- Next payment date.
- Total amount spent.
- Edit and delete actions.

### D. Calendar

Create a monthly calendar showing upcoming subscription renewals.

Features:
- Distinguish payment dates visually.
- Display subscription name and price.
- Navigate between months.
- Show upcoming payments in a separate list.

### E. Analytics

Display:
- Monthly spending trends.
- Annual spending estimates.
- Category breakdown.
- Most expensive subscriptions.
- Spending comparisons between months.

Use accurate calculations based on billing intervals.

### F. Notifications

Provide configurable reminder preferences:
- 7 days before payment.
- 3 days before payment.
- 1 day before payment.
- On the payment date.

Do not claim that browser notifications or background reminders work unless actually implemented and tested.

### G. Settings

Include:
- Currency preferences.
- Appearance preferences.
- Notification preferences.
- Account settings.

## 6. Subscription Calculation Engine

This is a critical feature.

Support billing intervals:
- Weekly.
- Monthly.
- Quarterly.
- Semi-annually.
- Annually.
- Custom interval.

Automatically calculate the next billing date.

Important:
- Handle months with different numbers of days.
- Handle leap years.
- Avoid incorrect date calculations.
- Preserve the intended billing day when possible.
- Do not treat cancelled subscriptions as future recurring expenses.
- Paused subscriptions must not be counted as upcoming payments unless explicitly configured.

Normalize billing amounts when calculating monthly and annual spending.

Clearly distinguish actual spending from estimated future expenses.

## 7. Database Design

Create a clean relational schema in PostgreSQL.

Suggested entities:
- profiles
- subscriptions
- billing_history
- notification_preferences

Requirements:
- UUID primary keys.
- Proper foreign keys.
- Created and updated timestamps.
- Appropriate indexes.
- User-level data isolation.
- Supabase Row Level Security policies.

Never expose Supabase service-role credentials in frontend code.

Use environment variables for configuration.

If Supabase credentials are unavailable, implement a working local development mode with realistic sample data and a clearly separated data-access layer.

Do not fabricate a successful Supabase connection.

## 8. Functional Requirements

Every visible button must perform a meaningful action.

Do not create decorative buttons that do nothing.

Implement:
- Working CRUD operations.
- Form validation.
- Confirmation dialogs.
- Search and filtering.
- Responsive navigation.
- Loading states.
- Empty states.
- Error states.
- Toast notifications.
- Accurate dashboard calculations.

Persist data using the selected backend or local development storage.

Do not rely on temporary in-memory state for features that are expected to persist.

## 9. Development Workflow

Work in stages.

**Stage 1 — Discovery and Planning**
- Inspect workspace.
- Identify available skills and agents.
- Review UI/UX Pro Max guidelines.
- Define architecture.
- Define database schema.
- Produce an implementation plan.

**Stage 2 — Foundation**
- Initialize project.
- Configure dependencies.
- Establish design tokens.
- Create reusable components.
- Implement application layout and navigation.

**Stage 3 — Core Features**
- Dashboard.
- Subscription CRUD.
- Billing calculation engine.
- Search and filters.
- Calendar.

**Stage 4 — Advanced Features**
- Analytics.
- Notifications.
- Settings.
- Supabase integration when credentials are available.

**Stage 5 — Quality Assurance**
- Run TypeScript checks.
- Run linting.
- Run available tests.
- Verify billing calculations.
- Check responsive layouts.
- Review accessibility.
- Perform security review.

Do not skip stages without a documented reason.

## 10. Engineering Rules

- Use clean, modular architecture.
- Avoid unnecessary dependencies.
- Avoid duplicated business logic.
- Use reusable components.
- Use strict TypeScript types.
- Handle errors explicitly.
- Do not use fake functionality.
- Do not silently swallow errors.
- Do not install packages without checking whether they are already available.
- Never overwrite unrelated user files.
- Do not claim successful builds or tests without actual execution results.

## 11. Final Deliverables

At completion, provide:
1. Project architecture overview.
2. Implemented feature list.
3. Database schema.
4. Environment variable instructions.
5. Commands to run the application.
6. Test results.
7. Known limitations and unfinished features.

## IMPORTANT EXECUTION INSTRUCTION

Start with Stage 1 only.

Use the installed Superpowers, ECC, and UI/UX Pro Max resources where applicable.

Inspect the environment and prepare a concrete implementation plan before writing application code.

Do not rush into generating the entire application in one step.

Wait for approval of the implementation plan before proceeding to Stage 2.

## Mandatory Toolkits

Before starting any task, inspect and use the installed toolkits when relevant:

1. UI/UX Pro Max:
   - Use for design system, UI/UX decisions, layouts, components, and visual consistency.

2. Superpowers:
   - Follow the appropriate workflow skills.
   - Use brainstorming, planning, TDD, systematic debugging, and code review when applicable.

3. Everything Claude Code (ECC):
   - Use relevant skills and specialized agents for architecture, implementation, testing, security, and code review.
   - Delegate tasks to specialized agents when beneficial.

Rules:
- Do not merely claim a skill or agent was used. Actually invoke or read it.
- Do not skip relevant skills.
- Avoid loading unrelated skills to conserve context tokens.
- Prefer existing installed tools over installing duplicates.
- Report which skills and agents were actually used.