**What**
Design the relational database schema, FastAPI backend endpoints, and Next.js management UI to store, visualize, search, and update a centralized repository of target exchange-traded funds (ETFs).

**Why**
To establish the foundational asset definitions, price timelines, and internal composition metrics required by the portfolio aggregation dashboard, comparison sandbox, and optimization engines built in subsequent milestones.

### Data Layer: Tables and Relationships

The database layer utilizes a hybrid relational and document (`JSONB`) pattern inside PostgreSQL 17 to maximize query performance while keeping schema maintenance clean.

Plaintext

```
  ┌──────────────────────────────────────┐
  │                 etfs                 │
  ├──────────────────────────────────────┤
  │ id (UUID, PK)                        │
  │ ticker (VARCHAR, Unique, Indexed)    │
  │ isin (VARCHAR, Unique, Indexed)      │
  │ ... [Core Metadata Columns]          │
  │ geographical_distribution (JSONB)    │
  │ sector_distribution (JSONB)          │
  │ bond_maturities (JSONB, Nullable)    │
  │ bond_credit_scores (JSONB, Nullable) │
  │ metrics (JSONB)                      │
  └──────────────────────────────────────┘
         │                        │
         │ 1:Many                 │ 1:Many
         ▼                        ▼
  ┌────────────────────────┐   ┌─────────────────────────────┐
  │      etf_holdings      │   │      etf_price_history      │
  ├────────────────────────┤   ├─────────────────────────────┤
  │ id (UUID, PK)          │   │ id (UUID, PK)               │
  │ etf_id (UUID, FK, Idx) │   │ etf_id (UUID, FK, Indexed)  │
  │ company_name (VARCHAR) │   │ price (NUMERIC)             │
  │ weight_pct (NUMERIC)   │   │ currency (VARCHAR)          │
  │ sector (VARCHAR)       │   │ timestamp (TIMESTAMPTZ, Idx)│
  │ region (VARCHAR)       │   └─────────────────────────────┘
  │ market_value (NUMERIC) │
  │ shares (NUMERIC)       │
  └────────────────────────┘
```

### 1. `etfs` Table (Parent)

- Holds core identity data, administrative records, and structured metric blocks.
- Uses PostgreSQL `JSONB` for distributions (Geographical, Sector, Bond Maturities, and Bond Credit Scores) to prevent column bloat while allowing deep querying and indexing.

### 2. `etf_holdings` Table (Child)

- **Relationship:** Many-to-One with `etfs` (`etf_holdings.etf_id` $\rightarrow$ `etfs.id`).
- Stores individual constituent equities or bonds within the ETF (supporting thousands of records per fund without impacting parent table scans). Is deleted cascade-style if the parent ETF is deleted.

### 3. `etf_price_history` Table (Child)

- **Relationship:** Many-to-One with `etfs` (`etf_price_history.etf_id` $\rightarrow$ `etfs.id`).
- Tracks price points across time. Indexed on `(etf_id, timestamp DESC)` to allow the portfolio engine to instantly pull the most recent valuation price.

### Master ETF Characteristic Checklist

Every ETF entity tracked by the system must contain the following information, organized into these exact data groupings:

### 1. Identity & Structural Tags

- **Ticker:** Short exchange identification code (e.g., VWCE) (Unique, Indexed).
- **ISIN:** International Securities Identification Number (Unique, Indexed).
- **Issuer:** Fund management company (e.g., Vanguard, iShares).
- **ETF Name:** Complete fund title.
- **Asset Class:** Categorization Enum (`Equities` or `Bonds`).

### 2. General & Specialized Ingestion Metrics

- **Index:** The underlying index tracked by the fund (e.g., FTSE All-World).
- **Description:** Extended text detailing the fund tracking purpose.
- **P/E Ratio:** Price-to-Earnings ratio of the underlying fund portfolio (Nullable).
- **TER:** Total Expense Ratio expressed as a percentage (e.g., 0.22%).
- **Fund Domicile:** Physical legal home of the fund (e.g., Ireland, Luxembourg) *(German Tax Impact)*.
- **Currency Hedged Flag:** Boolean indicator (`True` / `False`).
- **Fiscal Year End:** Month marking the fund's accounting year-end.
- **German Tax Classification Type:** Enum determining partial exemptions (`Equity Fund` for 30% exemption, `Mixed Fund` for 15%, or `None`).

### 3. Fixed Income / Bonds Profile

*(Populated if Asset Class = `Bonds`, otherwise mapped as `Null`)*

- **Bonds Class:** Category of fixed income (e.g., Corporate, Government, Aggregate).
- **Bonds Maturity Percentage Allocations (JSONB Key-Value):**
  - Cash, 0-1y, 1-2y, 2-3y, 3-5y, 5-7y, 7-10y, 10-15y, 15-20y, 20+y.
- **Bond Credit Score Allocation Percentages (JSONB Key-Value):**
  - AAA, AA, A, BBB (plus catch-all keys for Non-Investment Grade and Unrated).

### 4. Equity Market-Cap Profile

*(Populated if Asset Class = `Equities`, otherwise mapped as `Null`)*

- **Allocation Percentages:** Mega-Cap, Large-Cap, Mid-Cap, Small-Cap, Micro-Cap.

### 5. Fund Operations Data

- **Replication Strategy:** Fund method Enum (`Physical/Full`, `Physical/Sampled`, or `Synthetic/Swap`).
- **Fund Size:** Total Assets Under Management (AUM) in millions.
- **Monthly Volume:** Trading volume index in thousands.

### 6. Risk Profile (Volatility)

- **Historical Volatility Percentage:** 1-Year Volatility, 3-Year Volatility, 5-Year Volatility.

### 7. Distributions & Dividends

- **Dividend Strategy:** Enum (`Accumulating` or `Distributing`).
- **Frequency:** Payout cadence (e.g., Quarterly, Annually, Monthly, None).
- **Rate:** Absolute amount per share of last payout.
- **Yield:** Trailing twelve-month dividend yield percentage.

### 8. Macro Holdings Overview

- **Regional Weights Summary:** Target percentages split by macro-regions (World, Europe, Emerging Markets).
- **Top Holding Concentration Percentage:** Aggregate weight of the fund's top 10 positions.
- **Number of Holdings:** Total distinct security count inside the fund.

### 9. Granular Holdings List (Mapped via `etf_holdings` table)

- **Name:** Underlying security identifier name.
- **Percentage of Market Value:** Weight within the ETF.
- **Sector:** Industry classification.
- **Region:** Country or continent of origin.
- **Market Value:** Aggregate dollar/euro size within the fund.
- **Shares:** Total share count held by the asset.

### 10. Macro Distribution Arrays (JSONB Objects)

- **Geographical Distribution:** Open key-value map tracking country codes to allocation percentages (`{"USA": 62.5, "JPN": 6.1}`).
- **Sector Distribution:** Open key-value map tracking industry fields to allocation percentages (`{"Technology": 24.1, "Financials": 14.5}`).

### 11. Cost / Pricing Ledger (Mapped via `etf_price_history` table)

- **Datetime:** Exact timestamp of price record.
- **Value:** Nominal price per share.
- **Currency:** Base trading currency (e.g., EUR, USD).

### Successful Criteria

### 1. Backend Service Layer (FastAPI & SQLAlchemy 2.0)

- **Idempotent Migrations:** Implement database tables with clear relational keys, cascading deletion constraints, and automated database index allocations on search targets (`isin`, `ticker`).
- **Validated CRUD Router Engine:**
  - `POST /transactions/etfs` $\rightarrow$ Validate inputs via strict Pydantic models (raising errors on invalid ISIN configurations or missing required asset fields).
  - `PUT /transactions/etfs/{id}` $\rightarrow$ Enable complete updates to core configuration values or specific distribution JSON blocks.
  - `DELETE /transactions/etfs/{id}` $\rightarrow$ Cleanly purge the parent item, cascading removals to historical price lines and holding datasets.

### 2. Administrative User Interface (Next.js 15 & Tailwind)

- **Unified Management View:** Construct a configuration panel safely housed inside the existing `/tabularium` route framework, avoiding any Nextra chrome breakages.
- **Search and Filter Matrix:** Deliver an administrative interface allowing instantaneous client-side filter sorting by Ticker, Asset Class, or Issuing house.
- **Instant Actualization Action:** Implement an interactive button trigger next to active holdings that transmits a manual price point log request to the backend history array.
- **CSV Batch Stream Ingestion:** Build an upload parsing interface capable of reading a formatted CSV text file to batch-load or overwrite the complete constituent mapping within the `etf_holdings` dataset.
