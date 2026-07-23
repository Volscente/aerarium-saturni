# Holdings Data Ingestion - Initiative

**What:** Build a database schema to store complete ETF constituent lists and implement a manual CSV/Excel ingestion pipeline for your target ETFs (EUNL, VWCE, LYP6).

**Why:** Free financial APIs restrict ETF holding endpoints to the Top 10 positions. Ingesting full issuer-provided CSVs enables 100% look-through visibility across thousands of underlying stocks without paying expensive subscription fees.

**Successful Criteria:**

- Database reliably stores individual stock constituents for each ETF with proper data types.
- A file upload utility accepts and parses direct CSV files from iShares, Vanguard, and Amundi.
- Querying an ETF returns 100% of its holdings with exact weights and ISIN identifiers.

---

**Target Instruments:**

- iShares MSCI Core World (`EUNL`)
- Vanguard FTSE All-World (`VWCE`)
- Amundi Stoxx 600 (`LYP6`)

**Data Sources:** Direct `.csv` / `.xls` exports from official issuer product pages.

**Core Data Model (`ETF_Holdings` Table):**

- `etf_isin` / `etf_ticker` (String)
- `stock_isin` (String, Primary Identifier)
- `stock_name` (String)
- `weight_percentage` (Float)
- `snapshot_date` (Date)

**Ingestion Strategy:** Manual CSV upload interface with custom backend parsers handling format differences across iShares, Vanguard, and Amundi layouts.
