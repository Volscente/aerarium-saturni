# Initiative

**What:** Calculate total weighted single-stock exposures across the combined portfolio and present the aggregated data through a clear hierarchy of visual components.

**Why:** Standard portfolio views mask true single-stock exposure when multiple ETFs hold overlapping companies. Look-through math surfaces hidden over-concentration in a single, scannable dashboard view.

**Successful Criteria:**

- Portfolio engine aggregates holding weights across all owned ETFs using look-through math.
- Dashboard presents four distinct components: Alert Badge, Horizontal Bar Chart, Treemap, and Searchable Data Table.
- Users can instantly identify their top single-stock risk without scrolling.

---

**Calculation Logic**

- Total Stock Weight (%) = (ETF 1 Weight in Portfolio × Stock Weight in ETF 1) + (ETF 2 Weight in Portfolio × Stock Weight in ETF 2) + ...

**UI Component Spec**

1. **Concentration Alert Badge:** High-level summary indicator displaying the maximum single-stock exposure percentage and ticker.
2. **Horizontal Bar Chart:** Displays Top 10–15 holdings with a vertical threshold line at 10%. Bars turn warning color if they cross the line.
3. **Interactive Treemap:** Macro-view showing all underlying holdings scaled by weight rectangle area.
4. **Detailed Table:** Searchable/sortable list. Clicking a stock row expands nested rows detailing which source ETFs contribute to that exposure.
