from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class PortfolioRowResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    owner: str = Field(description="Portfolio owner name.")
    broker_platform: str = Field(description="Broker platform identifier (e.g. 'ibkr', 'n26').")
    total_invested: float = Field(description="Net capital deployed: Σ(buy qty*price) - Σ(sell qty*price).")
    current_value: float | None = Field(
        default=None,
        description="Σ(net_quantity * latest_price). None when any held ISIN has no price record.",
    )
    performance_abs: float | None = Field(
        default=None,
        description="current_value - total_invested. None when current_value is None.",
    )
    performance_pct: float | None = Field(
        default=None,
        description="performance_abs / total_invested * 100. None when current_value is None.",
    )


class PortfolioOverviewResponse(BaseModel):
    rows: list[PortfolioRowResponse] = Field(
        description="One row per (owner, broker_platform) pair found in transactions."
    )


class HoldingContribution(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    etf_ticker: str = Field(description="Ticker of the contributing ETF.")
    etf_name: str = Field(description="Name of the contributing ETF.")
    etf_portfolio_weight_percentage: float = Field(
        description="This ETF's own share of total portfolio value (etf_current_value / total_portfolio_value), in percentage points."
    )
    stock_weight_in_etf_percentage: float = Field(
        description="The stock's raw weight_percentage within this ETF's latest holdings snapshot, unmultiplied by portfolio weight."
    )
    contribution_weight_percentage: float = Field(
        description="This ETF's contribution to the stock's total look-through weight, in percentage points. "
        "Equal to etf_portfolio_weight_percentage * stock_weight_in_etf_percentage / 100."
    )
    snapshot_date: date = Field(
        description="snapshot_date of the EtfHolding row this contribution was computed from."
    )


class HoldingExposureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    stock_isin: str | None = Field(default=None, description="ISIN of the underlying stock, when reported by its ETF(s).")
    stock_ticker: str | None = Field(default=None, description="Ticker of the underlying stock, when reported by its ETF(s).")
    stock_name: str = Field(description="Display name of the underlying stock.")
    total_weight_percentage: float = Field(
        description="Σ (etf_portfolio_weight × holding.weight_percentage) across all contributing ETFs."
    )
    contributions: list[HoldingContribution] = Field(
        description="Per-ETF breakdown of this stock's total look-through weight."
    )


class HoldingsExposureResponse(BaseModel):
    holdings: list[HoldingExposureResponse] = Field(
        description="One row per distinct stock identity (ISIN-priority, ticker-fallback), ordered by total_weight_percentage DESC."
    )
    skipped_etfs: list[str] = Field(
        default_factory=list,
        description="Tickers of owned ETFs excluded from the aggregation because they have no price record in etf_price_history.",
    )
