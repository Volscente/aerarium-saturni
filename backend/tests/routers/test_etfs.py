from pathlib import Path
from unittest.mock import AsyncMock, patch
from uuid import UUID

import httpx
import pytest

from backend.routers.etfs import _aggregate_fund_distribution
from backend.schemas.etfs import EtfHoldingRow
from tests.conftest import VALID_ETF_PAYLOAD

DUMMY_ETF_ID = "00000000-0000-0000-0000-000000000001"
FIXTURES_DIR = Path(__file__).resolve().parents[2] / "data" / "holdings" / "original"


def test_create_etf_valid(client):
    """POST valid ETF payload returns 201 with UUID id and created_at."""
    response = client.post("/etfs", json=VALID_ETF_PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    UUID(data["id"])
    assert "created_at" in data
    assert data["ticker"] == "VWCE"
    assert data["isin"] == "IE00B3RBWM25"


def test_create_etf_defaults_empty_distributions(client):
    """A newly created ETF has empty geographical_distribution/sector_distribution -- both are derived from holdings uploads, not user-entered."""
    response = client.post("/etfs", json=VALID_ETF_PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    assert data["geographical_distribution"] == {}
    assert data["sector_distribution"] == {}


def test_create_etf_ignores_supplied_distribution_fields(client):
    """geographical_distribution/sector_distribution in the request body are ignored, not persisted."""
    payload = {
        **VALID_ETF_PAYLOAD,
        "geographical_distribution": {"US": 100.0},
        "sector_distribution": {"Technology": 100.0},
    }
    response = client.post("/etfs", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["geographical_distribution"] == {}
    assert data["sector_distribution"] == {}


def test_create_etf_invalid_isin(client):
    """POST with ISIN that is not 12 alphanumeric characters returns 422."""
    payload = {**VALID_ETF_PAYLOAD, "isin": "INVALID"}
    response = client.post("/etfs", json=payload)
    assert response.status_code == 422


def test_create_etf_bonds_missing_maturities(client):
    """POST with asset_class Bonds but no bond_maturities returns 422."""
    payload = {**VALID_ETF_PAYLOAD, "asset_class": "Bonds"}
    response = client.post("/etfs", json=payload)
    assert response.status_code == 422


def test_list_etfs_empty(client):
    """GET /etfs returns 200 with empty list when no rows exist."""
    response = client.get("/etfs")
    assert response.status_code == 200
    assert response.json() == []


def test_list_etfs_with_rows(client_with_etfs):
    """GET /etfs returns 200 with all ETF rows from the session."""
    response = client_with_etfs.get("/etfs")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_update_etf_not_found(client_etf_not_found):
    """PUT /etfs/{unknown-id} returns 404 when the ETF does not exist."""
    response = client_etf_not_found.put(f"/etfs/{DUMMY_ETF_ID}", json={"name": "New Name"})
    assert response.status_code == 404


def test_delete_etf_not_found(client_etf_not_found):
    """DELETE /etfs/{unknown-id} returns 404 when the ETF does not exist."""
    response = client_etf_not_found.delete(f"/etfs/{DUMMY_ETF_ID}")
    assert response.status_code == 404


def test_get_price_history_with_rows(client_with_price_history):
    """GET /etfs/{id}/price-history returns 200 with price rows ordered newest-first."""
    response = client_with_price_history.get(f"/etfs/{DUMMY_ETF_ID}/price-history")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["currency"] == "EUR"
    assert float(data[0]["price"]) == pytest.approx(105.0)


def test_get_price_history_etf_not_found(client_etf_not_found):
    """GET /etfs/{unknown-id}/price-history returns 404 when the ETF does not exist."""
    response = client_etf_not_found.get(f"/etfs/{DUMMY_ETF_ID}/price-history")
    assert response.status_code == 404


def test_create_price_valid(client_with_etfs):
    """POST /etfs/{id}/price with valid payload returns 201."""
    payload = {
        "price": "100.50",
        "currency": "EUR",
        "timestamp": "2026-06-19T12:00:00Z",
    }
    response = client_with_etfs.post(f"/etfs/{DUMMY_ETF_ID}/price", json=payload)
    assert response.status_code == 201


def test_upload_holdings_valid(client_with_etfs):
    """POST /etfs/{id}/holdings/upload with valid CSV returns 200 and inserted_rows count."""
    csv_content = (
        "stock_isin,stock_name,weight_percentage,snapshot_date\n"
        "IE00B3RBWM25,Vanguard FTSE All-World,5.0,2026-07-22\n"
        "IE00B5BMR087,iShares Core S&P 500,4.5,2026-07-22"
    )
    response = client_with_etfs.post(
        f"/etfs/{DUMMY_ETF_ID}/holdings/upload",
        files={"file": ("holdings.csv", csv_content.encode(), "text/csv")},
    )
    assert response.status_code == 200
    assert response.json() == {"inserted_rows": 2}


def test_upload_holdings_invalid_row(client_with_etfs):
    """POST /etfs/{id}/holdings/upload with an unparseable row returns 422 with row number."""
    csv_content = (
        "stock_isin,stock_name,weight_percentage,snapshot_date\n"
        "IE00B3RBWM25,Vanguard FTSE All-World,not_a_number,2026-07-22"
    )
    response = client_with_etfs.post(
        f"/etfs/{DUMMY_ETF_ID}/holdings/upload",
        files={"file": ("holdings.csv", csv_content.encode(), "text/csv")},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["row"] == 1


def test_upload_holdings_etf_not_found(client_etf_not_found):
    """POST /etfs/{unknown-id}/holdings/upload returns 404 when the ETF does not exist."""
    csv_content = (
        "stock_isin,stock_name,weight_percentage,snapshot_date\n"
        "IE00B3RBWM25,Vanguard FTSE All-World,5.0,2026-07-22"
    )
    response = client_etf_not_found.post(
        f"/etfs/{DUMMY_ETF_ID}/holdings/upload",
        files={"file": ("holdings.csv", csv_content.encode(), "text/csv")},
    )
    assert response.status_code == 404


def test_upload_holdings_xlsx_valid(client_with_etfs):
    """POST /etfs/{id}/holdings/upload with a real issuer XLSX (EUNL.xlsx) converts and inserts."""
    xlsx_bytes = (FIXTURES_DIR / "EUNL.xlsx").read_bytes()
    response = client_with_etfs.post(
        f"/etfs/{DUMMY_ETF_ID}/holdings/upload",
        files={
            "file": (
                "EUNL.xlsx",
                xlsx_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert response.status_code == 200
    assert response.json() == {"inserted_rows": 1231}


def test_upload_holdings_xlsx_valid_with_browser_suffixed_filename(client_with_etfs):
    """A repeat download suffixed by the browser (e.g. 'EUNL (1).xlsx') still resolves to iShares."""
    xlsx_bytes = (FIXTURES_DIR / "EUNL.xlsx").read_bytes()
    response = client_with_etfs.post(
        f"/etfs/{DUMMY_ETF_ID}/holdings/upload",
        files={
            "file": (
                "EUNL (1).xlsx",
                xlsx_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert response.status_code == 200
    assert response.json() == {"inserted_rows": 1231}


def test_upload_holdings_calls_isin_reconciliation(client_with_etfs):
    """A successful holdings upload triggers the OpenFIGI-based ISIN reconciliation step."""
    csv_content = (
        "stock_isin,stock_name,weight_percentage,snapshot_date\n"
        "IE00B3RBWM25,Vanguard FTSE All-World,5.0,2026-07-22"
    )
    with patch(
        "backend.routers.etfs.resolve_stock_isin_aliases",
        new=AsyncMock(return_value=2),
    ) as mock_resolve:
        response = client_with_etfs.post(
            f"/etfs/{DUMMY_ETF_ID}/holdings/upload",
            files={"file": ("holdings.csv", csv_content.encode(), "text/csv")},
        )
    assert response.status_code == 200
    mock_resolve.assert_awaited_once()


def test_upload_holdings_succeeds_when_reconciliation_fails(client_with_etfs):
    """OpenFIGI being unreachable during reconciliation does not fail the upload."""
    csv_content = (
        "stock_isin,stock_name,weight_percentage,snapshot_date\n"
        "IE00B3RBWM25,Vanguard FTSE All-World,5.0,2026-07-22"
    )
    with patch(
        "backend.routers.etfs.resolve_stock_isin_aliases",
        new=AsyncMock(side_effect=httpx.ConnectError("unreachable")),
    ):
        response = client_with_etfs.post(
            f"/etfs/{DUMMY_ETF_ID}/holdings/upload",
            files={"file": ("holdings.csv", csv_content.encode(), "text/csv")},
        )
    assert response.status_code == 200
    assert response.json() == {"inserted_rows": 1}


def _make_holding_row(stock_country=None, stock_sector=None, weight_percentage="1.0000"):
    holding = EtfHoldingRow(
        stock_ticker="AAPL",
        stock_name="Apple Inc",
        weight_percentage=weight_percentage,
        snapshot_date="2026-07-22",
    )
    return holding, {"stock_country": stock_country, "stock_sector": stock_sector}


def test_aggregate_fund_distribution_sums_by_bucket():
    """Rows sharing a bucket have their weight_percentage summed; distinct buckets stay separate."""
    holdings = [
        _make_holding_row(stock_country="US", weight_percentage="5.0000"),
        _make_holding_row(stock_country="US", weight_percentage="3.0000"),
        _make_holding_row(stock_country="DE", weight_percentage="4.0000"),
    ]
    result = _aggregate_fund_distribution(holdings, "stock_country")
    assert result == {"US": 8.0, "DE": 4.0}


def test_aggregate_fund_distribution_missing_key_buckets_as_unknown():
    """A None (or absent) bucket value is grouped under the literal 'Unknown' string, not a null key."""
    holdings = [
        _make_holding_row(stock_country=None, weight_percentage="2.0000"),
        _make_holding_row(stock_country="US", weight_percentage="1.0000"),
    ]
    result = _aggregate_fund_distribution(holdings, "stock_country")
    assert result == {"Unknown": 2.0, "US": 1.0}


def test_aggregate_fund_distribution_empty_holdings_returns_empty_dict():
    """No holdings produces an empty distribution rather than raising."""
    assert _aggregate_fund_distribution([], "stock_sector") == {}


def test_upload_holdings_populates_fund_distributions(client_with_etfs, mock_session_with_etfs):
    """A holdings upload aggregates its rows' stock_country/stock_sector into the ETF's own distribution fields."""
    csv_content = (
        "stock_isin,stock_name,stock_country,stock_sector,weight_percentage,snapshot_date\n"
        "IE00B3RBWM25,Vanguard FTSE All-World,US,Information Technology,5.0,2026-07-22\n"
        "IE00B5BMR087,iShares Core S&P 500,DE,Financials,4.5,2026-07-22"
    )
    response = client_with_etfs.post(
        f"/etfs/{DUMMY_ETF_ID}/holdings/upload",
        files={"file": ("holdings.csv", csv_content.encode(), "text/csv")},
    )
    assert response.status_code == 200

    etf_row = mock_session_with_etfs.execute.return_value.scalar_one_or_none.return_value
    assert etf_row.geographical_distribution == {"US": 5.0, "DE": 4.5}
    assert etf_row.sector_distribution == {"Information Technology": 5.0, "Financials": 4.5}


def test_upload_holdings_without_country_sector_columns_buckets_as_unknown(
    client_with_etfs, mock_session_with_etfs
):
    """A CSV with no stock_country/stock_sector columns buckets every row's weight under 'Unknown'."""
    csv_content = (
        "stock_isin,stock_name,weight_percentage,snapshot_date\n"
        "IE00B3RBWM25,Vanguard FTSE All-World,5.0,2026-07-22\n"
        "IE00B5BMR087,iShares Core S&P 500,4.5,2026-07-22"
    )
    response = client_with_etfs.post(
        f"/etfs/{DUMMY_ETF_ID}/holdings/upload",
        files={"file": ("holdings.csv", csv_content.encode(), "text/csv")},
    )
    assert response.status_code == 200

    etf_row = mock_session_with_etfs.execute.return_value.scalar_one_or_none.return_value
    assert etf_row.geographical_distribution == {"Unknown": 9.5}
    assert etf_row.sector_distribution == {"Unknown": 9.5}


def test_upload_holdings_xlsx_unrecognised_ticker(client_with_etfs):
    """POST /etfs/{id}/holdings/upload with an XLSX filename that isn't a known issuer ticker returns 422."""
    response = client_with_etfs.post(
        f"/etfs/{DUMMY_ETF_ID}/holdings/upload",
        files={
            "file": (
                "UNKNOWN.xlsx",
                b"not a real workbook",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert response.status_code == 422
    assert "Unrecognised ETF ticker" in response.json()["detail"]["error"]
