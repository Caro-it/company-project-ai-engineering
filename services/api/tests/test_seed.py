"""scripts/seed_incidents.py sobre la BD en memoria."""
from collections import Counter

import seed_incidents
from app import database


def counts(field: str) -> dict[str, int]:
    return dict(Counter(doc[field] for doc in database.incidents_table.all()))


def test_seed_inserts_96_valid_records(seed_report):
    assert seed_report["read"] == 100
    assert seed_report["inserted"] == 96
    assert seed_report["existing"] == 0
    assert seed_report["invalid"] == 4
    assert seed_report["unmapped"] == 0
    assert {k: v for k, v in seed_report["invalid_by_rule"].items() if v} == {
        "missing_client_company": 1,
        "invalid_category": 1,
        "invalid_email": 1,
        "closed_without_score": 1,
    }


def test_seed_totals_match_context(seed_report):
    assert counts("status") == {"open": 27, "resolved": 56, "discarded": 13}
    assert counts("category") == {"technical_failure": 49, "process_error": 35, "client_complaint": 12}
    assert counts("origin") == {"customer": 96}
    assert counts("branch") == {"central": 96}


def test_seed_is_idempotent(seed, seed_report):
    again = seed()
    assert again["inserted"] == 0
    assert again["existing"] == 96
    assert len(database.incidents_table) == 96
    assert len(database.incident_seed_log_table) == 96


def test_ticket_id_only_in_seed_log(seed_report):
    for doc in database.incidents_table.all():
        assert "ticket_id" not in doc
    log = database.incident_seed_log_table.all()
    assert all(entry["ticket_id"].startswith("NXV-") for entry in log)
    incident_ids = {doc["id"] for doc in database.incidents_table.all()}
    assert {entry["incident_id"] for entry in log} == incident_ids


def test_no_emails_stored_or_printed(seed_report, capsys):
    stored = str(database.incidents_table.all()) + str(database.incident_seed_log_table.all())
    assert "@" not in stored
    assert "customer_email" not in stored

    seed_incidents.print_report(seed_report, "incidents-nexova.csv")
    printed = capsys.readouterr().out
    assert "@" not in printed
    assert "Inserted .............................  96" in printed
    assert "Missing client_company: 1" in printed
