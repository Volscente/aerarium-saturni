from uuid import UUID

import pytest

from tests.conftest import VALID_BUY_PAYLOAD

DUMMY_TRANSACTION_ID = "00000000-0000-0000-0000-000000000002"


def test_create_transaction_valid(client):
    """POST valid buy payload returns 201 with UUID id and created_at."""
    response = client.post("/transactions", json=VALID_BUY_PAYLOAD)
    assert response.status_code == 201
    data = response.json()
    UUID(data["id"])
    assert "created_at" in data
    assert data["owner"] == "simone"
    assert data["isin"] == "US0378331005"


def test_create_transaction_invalid_isin(client):
    """POST with ISIN that is not 12 alphanumeric characters returns 422."""
    payload = {**VALID_BUY_PAYLOAD, "isin": "INVALID"}
    response = client.post("/transactions", json=payload)
    assert response.status_code == 422


def test_create_transaction_isin_none(client):
    """POST with isin omitted returns 201 with isin null in response."""
    payload = {k: v for k, v in VALID_BUY_PAYLOAD.items() if k not in ("isin", "ticker")}
    response = client.post("/transactions", json=payload)
    assert response.status_code == 201
    assert response.json()["isin"] is None


def test_create_transaction_negative_quantity(client):
    """POST with quantity <= 0 returns 422."""
    payload = {**VALID_BUY_PAYLOAD, "quantity": "-1.0"}
    response = client.post("/transactions", json=payload)
    assert response.status_code == 422


def test_list_transactions_empty(client):
    """GET /transactions returns 200 with empty list when no rows exist."""
    response = client.get("/transactions")
    assert response.status_code == 200
    assert response.json() == []


def test_list_transactions_owner_filter(client_with_rows):
    """GET /transactions?owner=simone returns only rows matching that owner."""
    response = client_with_rows.get("/transactions?owner=simone")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    assert all(row["owner"] == "simone" for row in data)


def test_list_transactions_ordered_desc(client_with_rows):
    """GET /transactions returns rows ordered by transaction_date descending."""
    response = client_with_rows.get("/transactions")
    assert response.status_code == 200
    dates = [row["transaction_date"] for row in response.json()]
    assert dates == sorted(dates, reverse=True)


def test_update_transaction_success(client_transaction_found):
    """PUT /transactions/{id} with a valid partial payload returns 200 with the updated row."""
    response = client_transaction_found.put(
        f"/transactions/{DUMMY_TRANSACTION_ID}",
        json={"price": "200.0000"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["owner"] == "simone"


def test_update_transaction_not_found(client_transaction_not_found):
    """PUT /transactions/{unknown-id} returns 404 when the transaction does not exist."""
    response = client_transaction_not_found.put(
        f"/transactions/{DUMMY_TRANSACTION_ID}",
        json={"price": "200.0000"},
    )
    assert response.status_code == 404


def test_delete_transaction_success(client_transaction_found):
    """DELETE /transactions/{id} returns 204 with no response body."""
    response = client_transaction_found.delete(f"/transactions/{DUMMY_TRANSACTION_ID}")
    assert response.status_code == 204
    assert response.content == b""


def test_delete_transaction_not_found(client_transaction_not_found):
    """DELETE /transactions/{unknown-id} returns 404 when the transaction does not exist."""
    response = client_transaction_not_found.delete(f"/transactions/{DUMMY_TRANSACTION_ID}")
    assert response.status_code == 404
