from decimal import Decimal

import pytest


def test_get_portfolio_overview_empty(client_portfolio_empty):
    """GET /portfolio/overview returns 200 with empty rows list when no transactions exist."""
    response = client_portfolio_empty.get("/portfolio/overview")
    assert response.status_code == 200
    assert response.json() == {"rows": []}


def test_get_portfolio_overview_single_row_with_price(client_portfolio_single_row):
    """GET /portfolio/overview returns 200 with one row and non-None performance fields when price data exists."""
    response = client_portfolio_single_row.get("/portfolio/overview")
    assert response.status_code == 200
    data = response.json()
    assert len(data["rows"]) == 1
    row = data["rows"][0]
    assert row["owner"] == "simone"
    assert row["broker_platform"] == "ibkr"
    assert row["total_invested"] is not None
    assert row["current_value"] is not None
    assert row["performance_abs"] is not None
    assert row["performance_pct"] is not None


def test_get_portfolio_overview_multiple_rows(client_portfolio_multiple_rows):
    """GET /portfolio/overview returns 200 with two rows for different (owner, broker_platform) groups."""
    response = client_portfolio_multiple_rows.get("/portfolio/overview")
    assert response.status_code == 200
    data = response.json()
    assert len(data["rows"]) == 2
    owners = {row["owner"] for row in data["rows"]}
    assert owners == {"simone", "sarah"}


def test_get_portfolio_overview_null_current_value(client_portfolio_null_price):
    """GET /portfolio/overview returns current_value, performance_abs, performance_pct as null when no price data."""
    response = client_portfolio_null_price.get("/portfolio/overview")
    assert response.status_code == 200
    data = response.json()
    assert len(data["rows"]) == 1
    row = data["rows"][0]
    assert row["current_value"] is None
    assert row["performance_abs"] is None
    assert row["performance_pct"] is None
    assert row["total_invested"] is not None


def test_get_portfolio_overview_mixed_null(client_portfolio_mixed):
    """GET /portfolio/overview: group with any missing ISIN price has null current_value; fully-priced group does not."""
    response = client_portfolio_mixed.get("/portfolio/overview")
    assert response.status_code == 200
    data = response.json()
    assert len(data["rows"]) == 2

    by_owner = {row["owner"]: row for row in data["rows"]}
    # simone/ibkr has one ISIN without price — entire group current_value must be None
    assert by_owner["simone"]["current_value"] is None
    assert by_owner["simone"]["performance_abs"] is None
    assert by_owner["simone"]["performance_pct"] is None
    # sarah/ibkr has all ISINs priced — current_value must be non-None
    assert by_owner["sarah"]["current_value"] is not None
    assert by_owner["sarah"]["performance_abs"] is not None


def test_get_holdings_exposure_empty(client_exposure_empty):
    """GET /portfolio/holdings/exposure returns 200 with empty holdings when no ETFs are held."""
    response = client_exposure_empty.get("/portfolio/holdings/exposure")
    assert response.status_code == 200
    assert response.json() == {"holdings": [], "skipped_etfs": [], "alerts": []}


def test_get_holdings_exposure_merges_by_isin(client_exposure_merged_by_isin):
    """Two ETFs reporting the same stock_isin merge into one holding with summed weight."""
    response = client_exposure_merged_by_isin.get("/portfolio/holdings/exposure")
    assert response.status_code == 200
    data = response.json()
    assert len(data["holdings"]) == 1
    holding = data["holdings"][0]
    assert holding["stock_isin"] == "DE0007037129"
    assert holding["total_weight_percentage"] == pytest.approx(4.4)
    assert len(holding["contributions"]) == 2

    by_ticker = {c["etf_ticker"]: c for c in holding["contributions"]}
    # EUNL: current_value 6000 / total 10000 = 60% portfolio weight, 4% stock weight in EUNL
    assert by_ticker["EUNL"]["etf_portfolio_weight_percentage"] == pytest.approx(60.0)
    assert by_ticker["EUNL"]["stock_weight_in_etf_percentage"] == pytest.approx(4.0)
    assert by_ticker["EUNL"]["contribution_weight_percentage"] == pytest.approx(2.4)
    # LYP6: current_value 4000 / total 10000 = 40% portfolio weight, 5% stock weight in LYP6
    assert by_ticker["LYP6"]["etf_portfolio_weight_percentage"] == pytest.approx(40.0)
    assert by_ticker["LYP6"]["stock_weight_in_etf_percentage"] == pytest.approx(5.0)
    assert by_ticker["LYP6"]["contribution_weight_percentage"] == pytest.approx(2.0)


def test_get_holdings_exposure_merges_by_ticker_fallback(client_exposure_ticker_fallback):
    """Two ETFs reporting the same stock only by ticker (no ISIN) still merge via the ticker fallback."""
    response = client_exposure_ticker_fallback.get("/portfolio/holdings/exposure")
    assert response.status_code == 200
    data = response.json()
    assert len(data["holdings"]) == 1
    assert data["holdings"][0]["stock_ticker"] == "RWE"
    assert len(data["holdings"][0]["contributions"]) == 2


def test_get_holdings_exposure_residual_isin_ticker_gap_not_merged(client_exposure_residual_gap):
    """A stock reported by ISIN in one ETF and only by an unresolved ticker in another is not merged."""
    response = client_exposure_residual_gap.get("/portfolio/holdings/exposure")
    assert response.status_code == 200
    data = response.json()
    assert len(data["holdings"]) == 2


def test_get_holdings_exposure_missing_price_skipped(client_exposure_missing_price):
    """An ETF with no price record is excluded from weighting and listed in skipped_etfs."""
    response = client_exposure_missing_price.get("/portfolio/holdings/exposure")
    assert response.status_code == 200
    data = response.json()
    assert "LYP6" in data["skipped_etfs"]
    assert len(data["holdings"]) == 1
    assert data["holdings"][0]["contributions"][0]["etf_ticker"] == "EUNL"


def test_get_holdings_exposure_no_alerts_when_nothing_breaches(client_exposure_merged_by_isin):
    """Weights well under 10% and a fresh (today's) snapshot_date produce no alerts at all."""
    response = client_exposure_merged_by_isin.get("/portfolio/holdings/exposure")
    assert response.status_code == 200
    assert response.json()["alerts"] == []


def test_get_holdings_exposure_concentration_alert_above_threshold(
    client_exposure_concentration_alert_above_threshold,
):
    """A holding at 12% total weight produces one concentration_risk alert referencing that stock."""
    response = client_exposure_concentration_alert_above_threshold.get("/portfolio/holdings/exposure")
    assert response.status_code == 200
    data = response.json()
    assert len(data["alerts"]) == 1
    alert = data["alerts"][0]
    assert alert["rule"] == "concentration_risk"
    assert alert["stock_ticker"] == "NVDA"
    assert alert["total_weight_percentage"] == pytest.approx(12.0)


def test_get_holdings_exposure_no_concentration_alert_at_exactly_threshold(
    client_exposure_concentration_at_exactly_threshold,
):
    """A holding at exactly 10% total weight produces zero concentration alerts (strict >)."""
    response = client_exposure_concentration_at_exactly_threshold.get("/portfolio/holdings/exposure")
    assert response.status_code == 200
    assert response.json()["alerts"] == []


def test_get_holdings_exposure_freshness_alert_when_stale(client_exposure_freshness_alert_stale):
    """An ETF whose snapshot_date is 61 days old produces one data_freshness_risk alert."""
    response = client_exposure_freshness_alert_stale.get("/portfolio/holdings/exposure")
    assert response.status_code == 200
    data = response.json()
    assert len(data["alerts"]) == 1
    alert = data["alerts"][0]
    assert alert["rule"] == "data_freshness_risk"
    assert alert["etf_ticker"] == "EUNL"
    assert alert["days_stale"] == 61


def test_get_holdings_exposure_no_freshness_alert_at_exactly_threshold(
    client_exposure_freshness_at_exactly_threshold,
):
    """An ETF whose snapshot_date is exactly 60 days old produces zero freshness alerts (strict >)."""
    response = client_exposure_freshness_at_exactly_threshold.get("/portfolio/holdings/exposure")
    assert response.status_code == 200
    assert response.json()["alerts"] == []


def test_get_holdings_exposure_multiple_alerts(client_exposure_multiple_alerts):
    """A stock that is both concentrated (15%) and inside a stale ETF (65 days) produces both alert types together."""
    response = client_exposure_multiple_alerts.get("/portfolio/holdings/exposure")
    assert response.status_code == 200
    data = response.json()
    assert len(data["alerts"]) == 2
    rules = {a["rule"] for a in data["alerts"]}
    assert rules == {"concentration_risk", "data_freshness_risk"}
