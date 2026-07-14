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
