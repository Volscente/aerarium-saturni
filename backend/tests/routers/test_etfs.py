from uuid import UUID

import pytest

from tests.conftest import VALID_ETF_PAYLOAD

DUMMY_ETF_ID = "00000000-0000-0000-0000-000000000001"


def test_create_etf_valid(client):
    """POST valid ETF payload returns 201 with UUID id and created_at."""
    response = client.post("/etfs", json=VALID_ETF_PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    UUID(data["id"])
    assert "created_at" in data
    assert data["ticker"] == "VWCE"
    assert data["isin"] == "IE00B3RBWM25"


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
