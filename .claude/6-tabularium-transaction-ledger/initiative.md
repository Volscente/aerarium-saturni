**What**

This initiative focuses on designing and implementing the data ingestion and management layer within the **Tabularium**. Instead of treating the dashboard as a purely read-only interface, this introduces a hybrid system consisting of a **Dedicated Transaction Ledger View** for historical management and **Contextual Flyouts/Modals** for quick data entry. Users will be able to manually record, view, and edit financial events (Buys, Sells, Dividends, Splits) for their stocks, bonds, and ETFs directly within the Tabularium workspace.

**Why**

A portfolio dashboard is only as good as its underlying data. In financial tracking, a portfolio state is a direct derivative of its transaction history. Without precise historical tracking (date, quantity, price, fees), the Tabularium cannot accurately calculate essential metrics like:

- Cost Basis (Average Purchase Price)
- Realized vs. Unrealized Profit & Loss (P&L)
- Time-Weighted Return (TWR) and Money-Weighted Return (MWR)

Integrating this functionality directly into the Tabularium via a hybrid UX ensures users don't have to navigate away from their analytics to update their portfolios, creating a tight feedback loop and a cohesive user experience.

**Success Criteria**

- **UX Efficiency:** A user can manually log a new stock purchase in fewer than 4 clicks or under 15 seconds.
- **Data Reactivity:** Submitting a transaction via a modal immediately updates the global state and refreshes the dashboard metrics without requiring a manual page reload.
- **Financial Integrity:** The system successfully handles fractional shares (up to 4 decimal places) and various currency inputs.
- **Clean Architecture:** Transaction state management is encapsulated within the `app/tabularium` directory, utilizing Next.js Server Actions or dedicated API routes, keeping the monorepo modular.

**Desired Approach**

1. UI/UX Structure

The Tabularium will feature a local sub-navigation layout to segment data consumption from data management cleanly:

- `/tabularium/portfolio` – Charts, asset allocation, and macro-metrics for all currently held positions.
- `/tabularium/transactions` – The chronological ledger of all historical events.

> **Note:** The original design proposed three sub-routes (`/tabularium/performance`, `/tabularium/holdings`, `/tabularium/transactions`). These were consolidated into two: `portfolio` serves as a rich dashboard covering both holdings and performance visualisations, and `transactions` covers the ledger. The distinction between a "holdings" list and a "performance" view only becomes meaningful when both are data-backed; merging them avoids splitting placeholder pages prematurely.

1. The Ingestion Mechanics

- **The Global Trigger:** A persistent, highly visible `+ Add Transaction` action button accessible across all Tabularium views.
- **The Contextual Slide-Over:** Clicking the trigger opens a sleek right-side drawer (flyout) or modal. This form dynamically adjusts based on the asset type selected (e.g., asking for "Yield" on a bond vs. "Shares" on an ETF).
