import io
import re
import zipfile
from datetime import date
from decimal import Decimal
from pathlib import Path

import openpyxl

GERMAN_MONTHS = {
    "Januar": 1,
    "Februar": 2,
    "März": 3,
    "April": 4,
    "Mai": 5,
    "Juni": 6,
    "Juli": 7,
    "August": 8,
    "September": 9,
    "Oktober": 10,
    "November": 11,
    "Dezember": 12,
}

ISSUER_BY_TICKER = {
    "EUNL": "ishares",
    "VWCE": "vanguard",
    "LYP6": "amundi",
}

_ISIN_PATTERN = re.compile(r"[A-Z0-9]{12}")
_GERMAN_DATE_PATTERN = re.compile(r"(\d{1,2})\.\s*([A-Za-zÀ-ÿ]+)\s*(\d{4})")
_AMUNDI_DATE_PATTERN = re.compile(r"zum (\d{2})/(\d{2})/(\d{4})")


def convert_holdings_xlsx(path: Path) -> list[dict[str, str]]:
    """Convert an issuer holdings XLSX export into EtfHoldingRow-shaped dict rows.

    Dispatches on the file's ticker (its stem, uppercased) rather than sniffing
    the content, since issuer layouts are structurally different enough that a
    wrong guess would silently misparse columns rather than fail loudly.

    Args:
        path: Path to the issuer XLSX export; its stem must be a known ticker
            (see ``ISSUER_BY_TICKER``).

    Returns:
        List of dicts with string values ready to be written as CSV rows or
        passed straight into ``EtfHoldingRow``. Each dict carries whichever
        identifier the issuer actually publishes — ``stock_ticker`` for
        iShares/Vanguard, ``stock_isin`` for Amundi — never both, so a blank
        cell for the other identifier is never written to CSV (``EtfHoldingRow``
        only normalises a blank/absent *ISIN* to ``None``; a blank
        ``stock_ticker`` would fail its ``min_length=1`` constraint). Cash,
        money-market, derivative, and zero-weight lines are dropped, since
        ``EtfHoldingRow`` models discrete stock constituents only and requires
        ``weight_percentage > 0``.

    Raises:
        ValueError: If the file's ticker (stem) has no registered converter.
    """
    ticker = path.stem.upper()
    issuer = ISSUER_BY_TICKER.get(ticker)
    if issuer is None:
        raise ValueError(f"Unrecognised ETF ticker '{ticker}'; no converter registered")
    return _CONVERTERS[issuer](path)


def write_csv(rows: list[dict[str, str]], output_path: Path) -> None:
    """Write converted holding rows to a CSV file matching EtfHoldingRow's field names.

    The header is taken from the first row's keys, since each issuer's rows
    carry only the identifier column it actually has data for (see
    ``convert_holdings_xlsx``); writing an unused identifier column with
    blank cells would fail ``EtfHoldingRow`` validation on upload.

    Args:
        rows: Rows produced by ``convert_holdings_xlsx``; must be non-empty.
        output_path: Destination CSV path; parent directory must already exist.
    """
    import csv

    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def _load_workbook(path: Path):
    """Load an XLSX workbook, tolerating issuer files with malformed style XML.

    Amundi exports have been observed with an invalid aRGB color value
    (``rgb="0xffffff"`` instead of a bare hex string) in ``xl/styles.xml``,
    which makes openpyxl refuse to open the file at all. When that happens,
    the stylesheet is rewritten in memory before retrying — styling is
    irrelevant here, only cell values matter.

    Args:
        path: Path to the XLSX file.

    Returns:
        The loaded ``openpyxl.Workbook``.
    """
    try:
        return openpyxl.load_workbook(path, data_only=True)
    except ValueError:
        return openpyxl.load_workbook(_sanitize_invalid_colors(path), data_only=True)


def _sanitize_invalid_colors(path: Path) -> io.BytesIO:
    """Rewrite non-hex ``rgb="0x..."`` color values in a workbook's styles.xml.

    Args:
        path: Path to the XLSX file whose stylesheet openpyxl rejected.

    Returns:
        An in-memory copy of the XLSX zip archive with valid aRGB hex values.
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(path) as zin, zipfile.ZipFile(buf, "w") as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "xl/styles.xml":
                text = data.decode("utf-8")
                text = re.sub(
                    r'rgb="0x([0-9A-Fa-f]+)"',
                    lambda m: f'rgb="{m.group(1).upper().rjust(8, "F")}"',
                    text,
                )
                data = text.encode("utf-8")
            zout.writestr(item, data)
    buf.seek(0)
    return buf


def _parse_german_date(text: str) -> date:
    """Parse a German day/month-name/year date, with or without separating spaces.

    Args:
        text: Text containing a date such as ``"23.Juli2026"`` or
            ``"Per 30. Juni 2026"``; only the date portion is matched.

    Returns:
        The parsed date.

    Raises:
        ValueError: If no date pattern is found, or the month name is unknown.
    """
    match = _GERMAN_DATE_PATTERN.search(text)
    if not match:
        raise ValueError(f"Cannot parse German date from '{text}'")
    day, month_name, year = match.groups()
    if month_name not in GERMAN_MONTHS:
        raise ValueError(f"Unknown German month name '{month_name}'")
    return date(int(year), GERMAN_MONTHS[month_name], int(day))


def _clean_weight(value: object) -> Decimal | None:
    """Parse a weight value into a percentage Decimal, or None if not strictly positive.

    Args:
        value: Raw weight cell value — a float/int already in percentage
            units, or a German-formatted string like ``"4,4503\xa0%"``.

    Returns:
        The weight as a percentage, quantized to 4 decimal places, or ``None``
        if the value is missing, unparseable, or not strictly positive.
    """
    if value is None:
        return None
    if isinstance(value, str):
        cleaned = value.replace("\xa0", "").replace("%", "").replace(",", ".").strip()
        if not cleaned:
            return None
        try:
            weight = Decimal(cleaned)
        except Exception:
            return None
    else:
        weight = Decimal(str(value))
    quantized = weight.quantize(Decimal("0.0001"))
    if quantized <= 0:
        return None
    return quantized


def _convert_ishares(path: Path) -> list[dict[str, str]]:
    """Convert an iShares holdings export (e.g. EUNL.xlsx) to holding rows.

    Header row 3 (German column names); data from row 4. Only rows with
    ``Anlageklasse == "Aktien"`` are kept — cash, money-market, and
    derivative overlay lines carry small nonzero weights and would otherwise
    pass the weight filter despite not being stock constituents.

    Args:
        path: Path to the iShares XLSX export.

    Returns:
        Converted holding rows keyed by ``stock_ticker`` (no ISIN available).
    """
    wb = _load_workbook(path)
    ws = wb.active
    snapshot_date = _parse_german_date(str(ws.cell(row=1, column=2).value))

    rows = []
    for ticker, name, _sector, asset_class, *_rest, weight_pct in (
        row[:6] for row in ws.iter_rows(min_row=4, values_only=True)
    ):
        if asset_class != "Aktien" or not ticker or not name:
            continue
        weight = _clean_weight(weight_pct)
        if weight is None:
            continue
        rows.append(
            {
                "stock_ticker": str(ticker).strip(),
                "stock_name": str(name).strip(),
                "weight_percentage": str(weight),
                "snapshot_date": snapshot_date.isoformat(),
            }
        )
    return rows


def _convert_vanguard(path: Path) -> list[dict[str, str]]:
    """Convert a Vanguard holdings export (e.g. VWCE.xlsx) to holding rows.

    Header row 7 (German column names); data from row 8. Rows with no ticker
    (secondary listings of an already-included company) are dropped, since
    Vanguard exports provide no ISIN fallback identifier.

    Args:
        path: Path to the Vanguard XLSX export.

    Returns:
        Converted holding rows keyed by ``stock_ticker`` (no ISIN available).
    """
    wb = _load_workbook(path)
    ws = wb.active
    title_row = " ".join(str(c) for c in next(ws.iter_rows(min_row=5, max_row=5, values_only=True)) if c)
    snapshot_date = _parse_german_date(title_row)

    rows = []
    for ticker, name, weight_pct, *_rest in (
        row[:3] for row in ws.iter_rows(min_row=8, values_only=True)
    ):
        if not ticker or not name:
            continue
        weight = _clean_weight(weight_pct)
        if weight is None:
            continue
        rows.append(
            {
                "stock_ticker": str(ticker).strip(),
                "stock_name": str(name).strip(),
                "weight_percentage": str(weight),
                "snapshot_date": snapshot_date.isoformat(),
            }
        )
    return rows


def _convert_amundi(path: Path) -> list[dict[str, str]]:
    """Convert an Amundi holdings export (e.g. LYP6.xlsx) to holding rows.

    Metadata block precedes the real header row; the snapshot date is
    embedded in an "as of" label rather than a dedicated column. Weight is
    published as a fraction (e.g. ``0.0459`` for 4.59%) and is scaled ×100
    to match the other issuers' convention. Only rows with
    ``Anlageklasse == "EQUITY"`` are kept — futures overlay and cash lines
    carry ISIN-like identifiers too and would otherwise pass the identifier
    check despite not being stock constituents. Any row whose ISIN cell
    doesn't match the 12-alphanumeric pattern is skipped rather than treated
    as the end of the block — cash lines interleave with real holdings
    rather than trailing them, and the disclaimer footer follows all of it.

    Args:
        path: Path to the Amundi XLSX export.

    Returns:
        Converted holding rows keyed by ``stock_isin`` (no ticker available).
    """
    wb = _load_workbook(path)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)

    snapshot_date = None
    header_row_index = None
    for i, row in enumerate(rows_iter):
        if row[1] and "Verwaltetes Vermögen" in str(row[1]):
            match = _AMUNDI_DATE_PATTERN.search(str(row[1]))
            if match:
                day, month, year = match.groups()
                snapshot_date = date(int(year), int(month), int(day))
        if row[1] == "ISIN" and row[2] == "Name":
            header_row_index = i
            break
    if snapshot_date is None:
        raise ValueError(f"Cannot find snapshot date in '{path}'")
    if header_row_index is None:
        raise ValueError(f"Cannot find holdings header row in '{path}'")

    rows = []
    for row in rows_iter:
        isin, name, asset_class, weight_pct = row[1], row[2], row[3], row[5]
        if asset_class != "EQUITY" or not isin or not _ISIN_PATTERN.fullmatch(str(isin)) or not name:
            continue
        weight = _clean_weight(Decimal(str(weight_pct)) * 100 if weight_pct is not None else None)
        if weight is None:
            continue
        rows.append(
            {
                "stock_isin": str(isin).strip().upper(),
                "stock_name": str(name).strip(),
                "weight_percentage": str(weight),
                "snapshot_date": snapshot_date.isoformat(),
            }
        )
    return rows


_CONVERTERS = {
    "ishares": _convert_ishares,
    "vanguard": _convert_vanguard,
    "amundi": _convert_amundi,
}
