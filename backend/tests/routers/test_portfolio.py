from decimal import Decimal


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
