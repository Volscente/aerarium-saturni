from datetime import date, timedelta
from decimal import Decimal

from backend.timeline import (
    TimelineEtf,
    TimelinePrice,
    TimelineTransaction,
    build_timeline,
)

ISIN_A = "IE00B4L5Y983"
ISIN_B = "IE00BK5BQT80"
ETFS = {
    ISIN_A: TimelineEtf(ticker="EUNL", name="iShares Core MSCI World"),
    ISIN_B: TimelineEtf(ticker="VWCE", name="Vanguard FTSE All-World"),
}


def _txn(
    kind="buy",
    day=date(2026, 1, 5),
    quantity="10",
    price="100",
    fees="1",
    owner="owner_a",
    broker="ibkr",
    isin=ISIN_A,
    currency="EUR",
    ratio=None,
) -> TimelineTransaction:
    return TimelineTransaction(
        owner=owner,
        broker_platform=broker,
        transaction_type=kind,
        isin=isin,
        quantity=Decimal(quantity) if quantity is not None else None,
        price=Decimal(price) if price is not None else None,
        ratio=ratio,
        currency=currency,
        fees=Decimal(fees),
        transaction_date=day,
    )


def _prices(start=date(2026, 1, 1), closes=("100",) * 10, skip=()) -> list[TimelinePrice]:
    return [
        TimelinePrice(day=start + timedelta(days=i), close=Decimal(c))
        for i, c in enumerate(closes)
        if i not in skip
    ]


def _etf_points(result, owner_index=0, broker_index=0, etf_index=0):
    return result.owners[owner_index].brokers[broker_index].etfs[etf_index].points


def test_single_buy_value_and_flow():
    """One buy → value is quantity × close from the buy day; flow is on that day only."""
    result = build_timeline([_txn()], ETFS, {ISIN_A: _prices(closes=("100", "101", "102", "103", "104", "105", "106", "107"))})

    points = _etf_points(result)
    assert points[0].date == date(2026, 1, 5)
    assert points[0].value == Decimal("1040")  # 10 × close on 2026-01-05 (104)
    assert points[0].net_flow == Decimal("1001")  # 10 × 100 + 1 fee
    assert all(p.net_flow == 0 for p in points[1:])
    assert points[1].value == Decimal("1050")
    assert result.skipped_transactions == 0


def test_buy_then_partial_sell():
    """Quantity, value and signed flow are correct on each side of a partial sell."""
    transactions = [
        _txn("buy", day=date(2026, 1, 2), quantity="10", price="100", fees="1"),
        _txn("sell", day=date(2026, 1, 4), quantity="4", price="110", fees="1"),
    ]
    result = build_timeline(transactions, ETFS, {ISIN_A: _prices(closes=("100",) * 5 + ("120",) * 5)})

    by_day = {p.date: p for p in _etf_points(result)}
    assert by_day[date(2026, 1, 3)].value == Decimal("1000")  # 10 shares × 100
    assert by_day[date(2026, 1, 4)].value == Decimal("600")  # 6 shares × 100
    assert by_day[date(2026, 1, 4)].net_flow == Decimal("-439")  # −4 × 110 + 1 fee
    assert by_day[date(2026, 1, 6)].value == Decimal("720")  # 6 shares × 120


def test_carry_forward_repeats_last_close_over_gaps():
    """Days without a stored price repeat the last close."""
    prices = _prices(closes=("100", "100", "130", "100", "100", "100"), skip=(3, 4))
    result = build_timeline([_txn(day=date(2026, 1, 2))], ETFS, {ISIN_A: prices})

    by_day = {p.date: p.value for p in _etf_points(result)}
    assert by_day[date(2026, 1, 3)] == Decimal("1300")
    assert by_day[date(2026, 1, 4)] == Decimal("1300")
    assert by_day[date(2026, 1, 5)] == Decimal("1300")
    assert by_day[date(2026, 1, 6)] == Decimal("1000")


def test_oversell_is_skipped_and_counted():
    """A sell above the held quantity is skipped and does not affect later days."""
    transactions = [
        _txn("buy", day=date(2026, 1, 2), quantity="5"),
        _txn("sell", day=date(2026, 1, 3), quantity="8"),
    ]
    result = build_timeline(transactions, ETFS, {ISIN_A: _prices()})

    points = _etf_points(result)
    assert result.skipped_transactions == 1
    assert points[-1].value == Decimal("500")
    assert all(p.net_flow == 0 for p in points[1:])


def test_dividends_and_splits_are_ignored_not_counted():
    """Dividend and split rows change nothing and add no skipped count."""
    transactions = [
        _txn("buy", day=date(2026, 1, 2)),
        _txn("dividend", day=date(2026, 1, 3), quantity=None, price="0.45", fees="0"),
        _txn("split", day=date(2026, 1, 4), quantity=None, price=None, fees="0", ratio="2:1"),
    ]
    result = build_timeline(transactions, ETFS, {ISIN_A: _prices()})

    assert result.skipped_transactions == 0
    assert _etf_points(result)[-1].value == Decimal("1000")


def test_aggregation_levels_sum_children():
    """Broker equals the sum of its ETFs, owner equals the sum of its brokers."""
    transactions = [
        _txn(isin=ISIN_A, broker="ibkr", day=date(2026, 1, 2)),
        _txn(isin=ISIN_B, broker="ibkr", day=date(2026, 1, 3), quantity="5"),
        _txn(isin=ISIN_A, broker="n26", day=date(2026, 1, 4), quantity="2"),
    ]
    prices = {ISIN_A: _prices(), ISIN_B: _prices(closes=("50",) * 10)}
    result = build_timeline(transactions, ETFS, prices)

    def by_day(points):
        return {p.date: p for p in points}

    owner = result.owners[0]
    ibkr, n26 = owner.brokers
    for broker in owner.brokers:
        for point in broker.points:
            children = [by_day(e.points).get(point.date) for e in broker.etfs]
            assert point.value == sum(c.value for c in children if c)
            assert point.net_flow == sum(c.net_flow for c in children if c)
    for point in owner.points:
        children = [by_day(b.points).get(point.date) for b in owner.brokers]
        assert point.value == sum(c.value for c in children if c)
        assert point.net_flow == sum(c.net_flow for c in children if c)

    jan4 = by_day(owner.points)[date(2026, 1, 4)]
    assert jan4.value == Decimal("1000") + Decimal("250") + Decimal("200")
    assert jan4.net_flow == Decimal("201")  # only the n26 buy happens that day
    assert [e.etf_ticker for e in ibkr.etfs] == ["EUNL", "VWCE"]
    assert n26.etfs[0].etf_ticker == "EUNL"


def test_same_etf_at_two_brokers_gives_two_series_and_one_owner_line():
    """The same ETF at two brokers stays two ETF series; the owner line sums them."""
    transactions = [
        _txn(broker="ibkr", day=date(2026, 1, 2), quantity="10"),
        _txn(broker="n26", day=date(2026, 1, 2), quantity="5"),
    ]
    result = build_timeline(transactions, ETFS, {ISIN_A: _prices()})

    owner = result.owners[0]
    assert [b.broker_platform for b in owner.brokers] == ["ibkr", "n26"]
    assert [len(b.etfs) for b in owner.brokers] == [1, 1]
    assert owner.points[0].value == Decimal("1500")


def test_series_starts_on_first_non_zero_day():
    """A series begins on its own first holding day, not on the global range start."""
    transactions = [
        _txn(owner="owner_a", day=date(2026, 1, 2)),
        _txn(owner="owner_b", day=date(2026, 1, 6)),
    ]
    result = build_timeline(transactions, ETFS, {ISIN_A: _prices()})

    owner_a, owner_b = result.owners
    assert owner_a.points[0].date == date(2026, 1, 2)
    assert owner_b.points[0].date == date(2026, 1, 6)
    assert owner_b.brokers[0].etfs[0].points[0].date == date(2026, 1, 6)


def test_skipped_count_covers_each_unusable_buy_or_sell():
    """Non-EUR, missing price/quantity/ISIN and unknown ISIN each add one."""
    transactions = [
        _txn(),
        _txn(currency="USD"),
        _txn(price=None),
        _txn(quantity=None),
        _txn(isin=None),
        _txn(isin="US0378331005"),
    ]
    result = build_timeline(transactions, ETFS, {ISIN_A: _prices()})

    assert result.skipped_transactions == 5
    assert _etf_points(result)[0].value == Decimal("1000")


def test_no_usable_transactions_returns_empty_result():
    """Nothing usable → empty owners and the skipped count."""
    result = build_timeline([_txn(currency="USD"), _txn("dividend")], ETFS, {ISIN_A: _prices()})

    assert result.owners == []
    assert result.skipped_transactions == 1


def test_transaction_on_last_price_date_gives_single_point():
    """A buy on the last price date yields a one-point series."""
    result = build_timeline([_txn(day=date(2026, 1, 10))], ETFS, {ISIN_A: _prices()})

    assert len(_etf_points(result)) == 1


def test_full_sell_out_keeps_emitting_zero_value():
    """After selling everything, the series continues with value 0."""
    transactions = [
        _txn("buy", day=date(2026, 1, 2), quantity="5"),
        _txn("sell", day=date(2026, 1, 4), quantity="5"),
    ]
    result = build_timeline(transactions, ETFS, {ISIN_A: _prices()})

    points = _etf_points(result)
    assert points[-1].date == date(2026, 1, 10)
    assert points[-1].value == Decimal("0")


def test_same_day_transactions_accumulate():
    """Two buys of one position on one day add quantities and flows."""
    transactions = [
        _txn(day=date(2026, 1, 2), quantity="3", fees="1"),
        _txn(day=date(2026, 1, 2), quantity="2", fees="1"),
    ]
    result = build_timeline(transactions, ETFS, {ISIN_A: _prices()})

    first = _etf_points(result)[0]
    assert first.value == Decimal("500")
    assert first.net_flow == Decimal("502")


def test_isin_without_prices_before_held_day_contributes_zero():
    """A day with no usable close values the position at zero instead of failing."""
    prices = _prices(start=date(2026, 1, 5), closes=("100",) * 5)
    result = build_timeline([_txn(day=date(2026, 1, 3))], ETFS, {ISIN_A: prices})

    by_day = {p.date: p.value for p in _etf_points(result)}
    assert by_day[date(2026, 1, 3)] == Decimal("0")
    assert by_day[date(2026, 1, 5)] == Decimal("1000")
