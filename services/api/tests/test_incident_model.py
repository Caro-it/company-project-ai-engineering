"""incidents_core.incident_model: valores, transiciones y csv_row_to_incident."""
from incidents_core.incident_model import (
    ALLOWED_TRANSITIONS,
    BRANCHES,
    CATEGORIES,
    CSV_CATEGORY_MAP,
    CSV_STATUS_MAP,
    MAPPING_ERRORS,
    ORIGINS,
    STATUSES,
    csv_row_to_incident,
)

ROW = {
    "ticket_id": "NXV-000001",
    "date": "2024-01-18",
    "client_company": "Acme",
    "category": "ACCESS",
    "description": "No puedo entrar en el portal",
    "agent_id": "AGT-01",
    "status": "CLOSED",
    "customer_email": "cliente@example.com",
    "satisfaction_score": "4",
}


def test_values_match_context():
    assert list(STATUSES) == ["open", "in_progress", "resolved", "discarded"]
    assert list(ORIGINS) == ["customer", "branch", "internal"]
    assert list(CATEGORIES) == [
        "technical_failure", "process_error", "client_complaint", "candidate_issue",
        "staff_issue", "sla_breach", "data_quality", "other",
    ]
    assert BRANCHES == {
        "central": "Central — Sede Valencia",
        "valencia_operations": "Valencia — Operaciones",
        "miami_office": "Miami Office",
        "remote": "Remoto (empleado sin sede fija)",
    }


def test_allowed_transitions():
    assert ALLOWED_TRANSITIONS["open"] == {"in_progress", "discarded"}
    assert ALLOWED_TRANSITIONS["in_progress"] == {"resolved", "discarded"}
    assert ALLOWED_TRANSITIONS["resolved"] == frozenset()
    assert ALLOWED_TRANSITIONS["discarded"] == frozenset()


def test_csv_maps():
    assert CSV_STATUS_MAP == {"OPEN": "open", "CLOSED": "resolved", "DISCARDED": "discarded"}
    assert CSV_CATEGORY_MAP == {
        "TECHNICAL": "technical_failure",
        "BILLING": "process_error",
        "ACCESS": "technical_failure",
        "HR_QUERY": "process_error",
        "COMPLAINT": "client_complaint",
    }


def test_valid_row_is_transformed():
    incident, problems = csv_row_to_incident(ROW)
    assert problems == []
    assert incident == {
        "title": "No puedo entrar en el portal",
        "description": "No puedo entrar en el portal",
        "status": "resolved",
        "category": "technical_failure",
        "origin": "customer",
        "branch": "central",
        "created_at": "2024-01-18T00:00:00+00:00",
        "updated_at": "2024-01-18T00:00:00+00:00",
    }


def test_no_csv_only_fields_leak():
    incident, _ = csv_row_to_incident(ROW)
    for field in ("ticket_id", "customer_email", "client_company", "agent_id", "satisfaction_score"):
        assert field not in incident
    assert "@" not in str(incident)


def test_title_is_first_120_chars_trimmed_and_description_literal():
    description = "  " + "x" * 200 + "  "
    incident, _ = csv_row_to_incident({**ROW, "description": description})
    assert incident["title"] == ("  " + "x" * 200)[:120].strip()
    assert len(incident["title"]) == 118
    assert incident["description"] == description


def test_unmappable_row_reports_keys_without_values():
    incident, problems = csv_row_to_incident(
        {**ROW, "status": "PENDING", "category": "OTHER", "date": "18/01/2024", "description": "   "}
    )
    assert incident is None
    assert problems == ["unmapped_status", "unmapped_category", "invalid_date", "empty_title"]
    assert set(problems) <= set(MAPPING_ERRORS)
    assert "PENDING" not in str(problems)
