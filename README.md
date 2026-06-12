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
