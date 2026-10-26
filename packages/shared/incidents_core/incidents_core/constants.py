import re

EXPECTED_FIELDS = [
    "ticket_id", "date", "client_company", "category", "description",
    "agent_id", "status", "customer_email", "satisfaction_score",
]

# El orden importa: es el orden en que se imprimen
VALID_CATEGORIES = ("TECHNICAL", "BILLING", "ACCESS", "HR_QUERY", "COMPLAINT")
VALID_STATUSES = ("OPEN", "CLOSED", "DISCARDED")

AGENT_ID_PATTERN = re.compile(r"^AGT-\d{2}$")
MIN_DESCRIPTION_LENGTH = 5
SCORE_MIN, SCORE_MAX = 1, 5

# Clave interna -> etiqueta legible (nunca incluye datos del registro)
RULES = {
    "missing_client_company": "Missing client_company",
    "invalid_category": "Invalid or missing category",
    "invalid_description": "Empty or too short description",
    "invalid_agent_id": "Invalid or missing agent_id",
    "invalid_email": "Invalid or missing email",
    "invalid_status": "Invalid or missing status",
    "closed_without_score": "Closed ticket, no score",
    "score_out_of_range": "Score out of range",
}

SCORE_LABELS = {
    1: "Very dissatisfied",
    2: "Dissatisfied",
    3: "Neutral",
    4: "Satisfied",
    5: "Very satisfied",
}