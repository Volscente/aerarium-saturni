## What

We are introducing a dedicated **Timeline** tab to the **Tabularium > Portfolio** page to house our historical performance visualizations. To indicate its independence from the "Snapshot" tabs (Overview, Holdings, Sectors, Geography) and their global filter, this tab will feature a visual distinction in the navigation menu (e.g., a divider, extra spacing, or a chart icon).

The page will contain two stacked line charts controlled by independent left-side selection menus:

- **Macro Visualization (Top):** A timeline displaying the total portfolio value. Users can use checkboxes to overlay the owner's total portfolio (e.g., "Thomas Total") alongside portfolios held at specific brokers (e.g., "Thomas @ Interactive Brokers", "Thomas @ Trade Republic").
- **Micro Visualization (Bottom):** A timeline dedicated to individual ETF performance. Selections are made via a hierarchical dropdown (e.g., clicking "Thomas" expands to show his specific ETFs). Selecting multiple ETFs will plot distinct line charts for each on the same graph.
- **Controls & Axes:** The X-axis will track time on a daily granularity. The Y-axis will feature a toggle allowing users to switch between viewing Absolute Value ($/€) and Normalized Growth (%) to ensure fair comparisons.

## Why

Separating historical time-series data from current-state snapshot data creates a much clearer mental model for the user. Moving the dual-timeline to its own dedicated tab solves several key UX challenges:

1. **Prevents Filter Confusion:** It eliminates the expectation that the Global Scope Filter on the Overview page should affect the timeline. The timeline charts need their own independent toggles to allow for multi-line comparisons (e.g., comparing Broker A vs. Broker B).
2. **Screen Real Estate:** Stacked line charts require significant horizontal and vertical space. A dedicated tab ensures these charts are highly readable without forcing the user to scroll past large graphs to see their current holdings on the Overview page.
3. **Clarity at Scale:** By separating macro (Owner/Broker totals) from micro (individual ETFs) into two stacked charts, we completely avoid the visually chaotic "spaghetti chart" problem.

## Success Criteria

- **New Tab Integration:** A new "Timeline" tab is successfully created in the navigation menu, complete with subtle visual separation (spacing, divider, or icon) distinguishing it from the snapshot tabs.
- **Independent State:** Timeline selection controls operate completely independently from the Global Scope Filter used on the Overview page.
- **Macro Chart Rendering:** The top chart successfully plots the owner's total portfolio and updates dynamically when independent broker-specific toggles are checked.
- **Micro Chart Rendering:** The bottom chart successfully plots individual ETF lines based on user selection from a collapsible, hierarchical dropdown menu.
- **Axis Functionality:** The X-axis accurately reflects daily data points, and the Y-axis smoothly toggles between Absolute Value and Normalized Growth (%) for accurate visual comparison.
