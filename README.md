# Aerarium Saturni

## Vision

### Introduction

Aerarium Saturni is a comprehensive, cognitive ecosystem explicitly engineered for the long-term passive investor. Rejecting complex active-trading bloat, the platform seamlessly synthesizes three operational pillars to optimize long-term wealth accumulation, domestic tax positioning, and structured drawdown planning.

### Pillars

- **Codex (The Investment Bible):** A centralized, deeply structured knowledge base designed to serve as the investor's personalized financial handbook, where advanced market research, strategies, and asset behavior are permanently documented.  
- **Tabularium (The Analytical Hub):** A robust transaction ledger paired with a high-fidelity analytics dashboard. It empowers the investor to aggregate cost-basises, run geographical and sector "X-Rays," isolate asset class comparisons (e.g., EUNL vs. VWCE), run cluster risk diagnostics, and execute tax-optimized cash routing.
- **Providentia (The Statistical Playground):** A high-performance forecasting engine utilizing stochastic analysis and Monte Carlo simulations. It serves as a personal laboratory to stress-test 30-year accumulation horizons, model behavioral anomalies under historic market shock regimes, and simulate safe, dynamic decumulation (withdrawal) strategies.

## Gaps to Close

To move from a basic transaction ledger to the ultimate investment platform, the following specific feature gaps must be closed across the service.  

### Tabularium

- **Holding Aggregation Engine:** Implement backend logic to compute real-time holdings, current market value weights, net P&L, and weighted cost-basises from raw historical ledger items.  
- **Manual Fund Characteristics Ledger:** Design a simple UI configuration panel and database schema to manually input sector, geographical, and asset allocations for a core selection of 5–6 target ETFs.
- **Portfolio X-Ray Visualizations:** Construct client-side charts mapping aggregate geographical and industry distributions across the entire portfolio based on combined asset allocations.
- **Asset Comparison Playground:** Build a comparison module inside the frontend to contrast key performance benchmarks and structural differences between specific tracking assets (e.g., EUNL vs. VWCE).  
- **Overlap & Cluster Risk Matrix:** Develop a cross-fund correlation view highlighting concentrated ticker exposures across multiple separate ETFs to flag hidden diversification risks.
- **Smart Rebalancing & Cash Router:** Build an algorithmic calculator that takes a target cash injection sum (e.g., monthly contribution) and outputs the exact purchase distribution needed to safely return the portfolio to target allocations without generating tax sales.

###  German Tax Optimization Engine

- **Sparer-Pauschbetrag Tracker:** Add data tracking for the annual €1,000 / €2,000 tax-free allowance, complete with a tax-harvesting simulator to model beneficial annual asset turnover.
- **Vorabpauschale Automation:** Implement automated phantom-yield computation for accumulating funds (Thesaurierend) using the official German base interest rate formula.
- **Teilfreistellung Accounting:** Integrate partial tax exemption rules (e.g., 30% reduction on stock ETFs) directly into the capital gains calculations inside the ledger framework.

### Providentia Gaps

- **Statistical Math Framework:** Add scientific computing dependencies (such as NumPy/SciPy) to the FastAPI backend framework to support complex financial data analytics.
- **Stochastic Monte Carlo Engine:** Build an accumulation simulator executing multi-thousand iteration path models across a 30-year horizon, adapting dynamically to changing variables like evolving monthly contributions.
- **Behavioral Stress-Testing Engine:** Design a module that lets users purposefully inject historical macro-shocks (e.g., Dot-Com crash, 2008 GFC, 1970s Stagflation) into their 30-year curves to visualize potential real-world behavioral changes.
- **Decumulation Plan Simulator:** Implement advanced drawdown calculators modeling safe withdrawal paths based on Variable Percentage Withdrawal (VPW) rules and Guyton-Klinger spending guardrails.

##  Roadmap

###  Milestone 1: Tabularium Core Analytics (v0.3.0)

**Objective:** Transform the platform from a raw transaction ledger into a functional portfolio dashboard, unblocking the currently empty `/tabularium/portfolio` view.

- **Holding Aggregation Engine (Backend):** Write the calculation logic to process raw ledger transactions (Buy, Sell, Split) into real-time share balances, current values, and weighted cost-basises.
- **Manual Asset Characteristics Ledger:** Build a basic database schema and frontend UI to allow manual input of geographic and sector weights for your core 5–6 ETFs.
- **Portfolio X-Ray Dashboard:** Implement client-side charts on the portfolio page to visualize aggregate geographical and asset-class asset distributions
- **Asset Comparison Playground:** Introduce a module to evaluate and compare tracking parameters between core funds (e.g., EUNL vs. VWCE).  

### Milestone 2: Passive Portfolio Optimization (v0.4.0)

**Objective:** Provide actionable insights that help the passive investor optimize asset allocations and risk management without triggering tax events.

- **Overlap & Cluster Risk Matrix:** Build a diagnostic tool mapping top underlying holdings across separate ETFs to flag hidden stock concentration risks.
- **Smart Rebalancing & Cash Router:** Implement the automated calculator that takes a monthly cash contribution input and routes it precisely across funds to fix drift passively.

### Milestone 3: German Tax Integration (v0.5.0)

**Objective:** Ground the portfolio metrics in domestic tax realities to provide hyper-localized financial alpha.

- **Sparer-Pauschbetrag Tracker:** Add tracking for the annual €1,000 / €2,000 tax-free allowance alongside a tax-harvesting turnover simulator
- **Vorabpauschale Automation:** Build backend calculation logic for accumulating funds (Thesaurierend) based on the official German base interest rate framework.
- **Teilfreistellung Accounting:** Integrate the 30% partial tax exemption rules directly into cost-basis and capital gains ledger analytics.

### Milestone 4: Providentia Foresight Engine (v1.0.0)

**Objective:** Unlock the forecasting pillar, turning the platform into a predictive playground for multi-decade statistical modeling.  

- **Statistical Infrastructure:** Add math and data-science library dependencies (NumPy/SciPy) to the FastAPI backend.
- **Stochastic Monte Carlo Simulator:** Launch the 30-year accumulation path model capable of adapting to variable monthly contributions over time.
- **Behavioral Stress-Testing Sandbox:** Allow users to simulate how their portfolio curves survive historically simulated macro-crises (e.g., 2008 GFC).
- **Decumulation Plan Simulator:** Implement drawdown models incorporating Variable Percentage Withdrawal (VPW) rules and dynamic safety guardrails.
