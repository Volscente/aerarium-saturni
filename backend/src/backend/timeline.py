from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

EXPECTED_CURRENCY = "EUR"
ZERO = Decimal("0")


@dataclass(frozen=True)
class TimelineTransaction:
    """One transaction row, reduced to the fields the replay needs."""

    owner: str
    broker_platform: str
    transaction_type: str  # "buy" | "sell" | "dividend" | "split"
    isin: str | None
    quantity: Decimal | None
    price: Decimal | None
    ratio: str | None
    currency: str
    fees: Decimal
    transaction_date: date


@dataclass(frozen=True)
class TimelineEtf:
    """ETF display metadata, keyed by ISIN in the caller's mapping."""

    ticker: str
    name: str


@dataclass(frozen=True)
class TimelinePrice:
    """One stored daily close."""

    day: date  # UTC date of the stored timestamp
    close: Decimal


@dataclass(frozen=True)
class Point:
    """One day of a series."""

    date: date
    value: Decimal  # end-of-day holdings value in EUR
    net_flow: Decimal  # that day's contributions net of withdrawals, fees included


@dataclass(frozen=True)
class EtfSeries:
    """Position of one owner in one ETF at one broker."""

    isin: str
    etf_ticker: str
    etf_name: str
    points: list[Point]


@dataclass(frozen=True)
class BrokerSeries:
    """All ETF positions of one owner at one broker."""

    broker_platform: str
    points: list[Point]
    etfs: list[EtfSeries]


@dataclass(frozen=True)
class OwnerSeries:
    """All positions of one owner across brokers."""

    owner: str
    points: list[Point]
    brokers: list[BrokerSeries]


@dataclass(frozen=True)
class TimelineResult:
    """Owner > broker > ETF series tree plus the number of transactions that could not be used."""

    owners: list[OwnerSeries]
    skipped_transactions: int


def build_timeline(
    transactions: list[TimelineTransaction],
    etfs: dict[str, TimelineEtf],
    prices: dict[str, list[TimelinePrice]],
) -> TimelineResult:
    """Replay transactions day by day and return owner > broker > ETF value/net_flow series.

    Transactions are replayed in date order, buys before sells on the same day. A sell
    larger than the quantity held is skipped and counted, since it points at missing buy
    data. The range runs from the earliest usable transaction date to the latest price
    date across the ETFs, one point per calendar day. Each position is valued at the
    latest close on or before each day. Broker and owner series are the sums of their
    children, and every series starts on the first day its node holds a non-zero
    position and then continues to the end of the range, even after a full sell-out.

    Args:
        transactions: All transaction rows; only usable buys and sells are replayed.
        etfs: ETF metadata keyed by ISIN.
        prices: Daily closes keyed by ISIN. An ETF without prices is treated as unknown.

    Returns:
        The series tree and the skipped-transaction count. ``owners`` is empty when no
        usable transaction exists or no price date falls on or after the first one.
    """
    known = {isin: etf for isin, etf in etfs.items() if prices.get(isin)}
    usable, skipped = _select_usable(transactions, known)
    if not usable:
        return TimelineResult(owners=[], skipped_transactions=skipped)

    ordered = sorted(usable, key=lambda t: (t.transaction_date, t.transaction_type != "buy"))
    held: dict[tuple[str, str, str], Decimal] = defaultdict(lambda: ZERO)
    events: dict[tuple[str, str, str], dict[date, list[Decimal]]] = defaultdict(
        lambda: defaultdict(lambda: [ZERO, ZERO])
    )
    for txn in ordered:
        position = (txn.owner, txn.broker_platform, txn.isin)
        if txn.transaction_type == "sell" and txn.quantity > held[position]:
            skipped += 1
            continue
        delta = txn.quantity if txn.transaction_type == "buy" else -txn.quantity
        held[position] += delta
        events[position][txn.transaction_date][0] += delta
        events[position][txn.transaction_date][1] += _net_flow(txn)

    if not events:
        return TimelineResult(owners=[], skipped_transactions=skipped)

    first_day = min(day for by_day in events.values() for day in by_day)
    last_day = max(p.day for isin in known for p in prices[isin])
    if last_day < first_day:
        return TimelineResult(owners=[], skipped_transactions=skipped)
    days = [first_day + timedelta(days=i) for i in range((last_day - first_day).days + 1)]

    closes = {isin: _daily_closes(prices[isin], days) for isin in {p[2] for p in events}}
    replayed = {
        position: _replay_position(by_day, closes[position[2]], days)
        for position, by_day in events.items()
    }

    owners = []
    for owner in sorted({p[0] for p in replayed}):
        brokers = []
        for broker in sorted({p[1] for p in replayed if p[0] == owner}):
            etf_positions = sorted(
                (p for p in replayed if p[0] == owner and p[1] == broker),
                key=lambda p: (known[p[2]].ticker, p[2]),
            )
            etf_series = [
                EtfSeries(
                    isin=p[2],
                    etf_ticker=known[p[2]].ticker,
                    etf_name=known[p[2]].name,
                    points=_to_points(*replayed[p], days),
                )
                for p in etf_positions
            ]
            broker_values, broker_flows, broker_start = _sum_series([replayed[p] for p in etf_positions])
            brokers.append(
                BrokerSeries(
                    broker_platform=broker,
                    points=_to_points(broker_values, broker_flows, broker_start, days),
                    etfs=etf_series,
                )
            )
        owner_values, owner_flows, owner_start = _sum_series(
            [replayed[p] for p in replayed if p[0] == owner]
        )
        owners.append(
            OwnerSeries(
                owner=owner,
                points=_to_points(owner_values, owner_flows, owner_start, days),
                brokers=brokers,
            )
        )
    return TimelineResult(owners=owners, skipped_transactions=skipped)


def _select_usable(
    transactions: list[TimelineTransaction],
    etfs: dict[str, TimelineEtf],
) -> tuple[list[TimelineTransaction], int]:
    """Keep buy/sell rows the replay can value; return them with the skipped count.

    Dividends and splits are dropped without counting. A buy/sell is skipped (and
    counted) when its currency is not EUR, ``price``, ``quantity`` or ``isin`` is
    ``None``, or its ISIN has no matching ETF (e.g. a stock). Sells larger than the
    quantity held are skipped later, in ``build_timeline``, where the running quantity
    is known.

    Args:
        transactions: All transaction rows.
        etfs: ETF metadata keyed by ISIN; only these ISINs can be valued.

    Returns:
        The usable buy/sell rows and the number of buy/sell rows that were skipped.
    """
    usable = []
    skipped = 0
    for txn in transactions:
        if txn.transaction_type not in ("buy", "sell"):
            continue
        if (
            txn.currency != EXPECTED_CURRENCY
            or txn.price is None
            or txn.quantity is None
            or txn.isin is None
            or txn.isin not in etfs
        ):
            skipped += 1
            continue
        usable.append(txn)
    return usable, skipped


def _daily_closes(
    prices: list[TimelinePrice],
    days: list[date],
) -> dict[date, Decimal]:
    """Latest close on or before each day; days before the first price are absent.

    Carry-forward keeps values flat across weekends, holidays and gaps. Price dates are
    the UTC date of ``EtfPriceHistory.timestamp``, matching the
    ``uq_etf_price_history_etf_id_day`` index.

    Args:
        prices: Stored closes for one ETF, in any order.
        days: Ascending calendar days to fill.

    Returns:
        A close for every day on or after the ETF's first price day.
    """
    ordered = sorted(prices, key=lambda p: p.day)
    closes: dict[date, Decimal] = {}
    index = 0
    latest: Decimal | None = None
    for day in days:
        while index < len(ordered) and ordered[index].day <= day:
            latest = ordered[index].close
            index += 1
        if latest is not None:
            closes[day] = latest
    return closes


def _net_flow(txn: TimelineTransaction) -> Decimal:
    """+quantity×price+fees for a buy, −quantity×price+fees for a sell.

    Fees always add to the flow, so a buy day shows a small cost drag once normalized.
    Sell proceeds are net of fees by the same sign convention.

    Args:
        txn: A usable buy or sell row (``quantity`` and ``price`` not ``None``).

    Returns:
        The signed EUR flow of the transaction.
    """
    amount = txn.quantity * txn.price
    return (amount if txn.transaction_type == "buy" else -amount) + txn.fees


def _replay_position(
    by_day: dict[date, list[Decimal]],
    closes: dict[date, Decimal],
    days: list[date],
) -> tuple[list[Decimal], list[Decimal], int | None]:
    """Walk one position through every day.

    Args:
        by_day: ``[quantity delta, net flow]`` per transaction day.
        closes: Daily closes with carry-forward, from ``_daily_closes``.
        days: Ascending calendar days of the whole range.

    Returns:
        Per-day value and net flow aligned with ``days``, and the index of the first day
        with a non-zero quantity (``None`` if the position is never held at a day's end).
        A day without a usable close is valued at zero.
    """
    values = []
    flows = []
    start = None
    quantity = ZERO
    for i, day in enumerate(days):
        delta, flow = by_day.get(day, (ZERO, ZERO))
        quantity += delta
        if start is None and quantity != 0:
            start = i
        values.append(quantity * closes.get(day, ZERO))
        flows.append(flow)
    return values, flows, start


def _sum_series(
    children: list[tuple[list[Decimal], list[Decimal], int | None]],
) -> tuple[list[Decimal], list[Decimal], int | None]:
    """Add child series element by element; the start is the earliest child start."""
    length = len(children[0][0])
    values = [sum((c[0][i] for c in children), ZERO) for i in range(length)]
    flows = [sum((c[1][i] for c in children), ZERO) for i in range(length)]
    starts = [c[2] for c in children if c[2] is not None]
    return values, flows, min(starts) if starts else None


def _to_points(
    values: list[Decimal],
    flows: list[Decimal],
    start: int | None,
    days: list[date],
) -> list[Point]:
    """Emit points from the series start to the end of the range (none if never started)."""
    if start is None:
        return []
    return [Point(date=days[i], value=values[i], net_flow=flows[i]) for i in range(start, len(days))]
