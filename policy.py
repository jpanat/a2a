"""
Policy & Access Control Layer

Defines PatientContext (all PHI fields), RoleAccessPolicy (which roles see what),
AccessControlledContext (enforces field-level access), AuditLog, and the
emergency_override context manager.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Optional
from contextlib import contextmanager
from datetime import datetime
import threading
import copy


# ── Patient Context ────────────────────────────────────────────────────────────

@dataclass
class PatientContext:
    # Core clinical
    patient_id: str
    age: int
    diagnosis: str
    vitals: dict[str, Any]
    current_medications: list[str]

    # Administrative / insurance
    insurance_id: str
    insurance_status: str   # "active", "pending", "denied"

    # Internal hospital notes (sensitive — only sending hospital and supervisor)
    hospital_a_internal_notes: str

    # Personal
    next_of_kin: dict[str, str]  # {"name": ..., "phone": ..., "relationship": ...}

    # Transfer metadata (added during coordination)
    transfer_reason: str = ""
    acuity_score: int = 0  # 1-10


# ── Role Access Policies ───────────────────────────────────────────────────────

# Maps role → set of allowed field names
ROLE_ACCESS_POLICIES: dict[str, set[str]] = {
    "ambulance": {
        "age",
        "diagnosis",
        "vitals",
        "current_medications",
        "transfer_reason",
        "acuity_score",
    },
    "insurance_validator": {
        "insurance_id",
        "insurance_status",
        "age",
        "diagnosis",
        "transfer_reason",
    },
    "hospital_a": {
        "patient_id",
        "age",
        "diagnosis",
        "vitals",
        "current_medications",
        "insurance_id",
        "insurance_status",
        "hospital_a_internal_notes",
        "next_of_kin",
        "transfer_reason",
        "acuity_score",
    },
    "hospital_b": {
        "patient_id",
        "age",
        "diagnosis",
        "vitals",
        "current_medications",
        "insurance_id",
        "insurance_status",
        # NOT hospital_a_internal_notes — receiving hospital doesn't see sender's notes
        "transfer_reason",
        "acuity_score",
    },
    "icu_capacity": {
        "age",
        "diagnosis",
        "vitals",
        "current_medications",
        "transfer_reason",
        "acuity_score",
    },
    "specialist": {
        "age",
        "diagnosis",
        "vitals",
        "current_medications",
        "transfer_reason",
        "acuity_score",
    },
    "risk_assessment": {
        "age",
        "diagnosis",
        "vitals",
        "insurance_status",
        "transfer_reason",
        "acuity_score",
    },
    "supervisor": {
        # Supervisor sees everything for coordination purposes
        "patient_id",
        "age",
        "diagnosis",
        "vitals",
        "current_medications",
        "insurance_id",
        "insurance_status",
        "hospital_a_internal_notes",
        "next_of_kin",
        "transfer_reason",
        "acuity_score",
    },
}

# Fields that are considered PHI and require special handling
PHI_FIELDS = {"patient_id", "insurance_id", "next_of_kin", "hospital_a_internal_notes"}


# ── Audit Log ──────────────────────────────────────────────────────────────────

@dataclass
class AuditEntry:
    timestamp: str
    event_type: str
    role: str
    fields_accessed: list[str]
    fields_denied: list[str]
    override_active: bool
    detail: str = ""


class AuditLog:
    def __init__(self):
        self._entries: list[AuditEntry] = []
        self._lock = threading.Lock()

    def record(
        self,
        event_type: str,
        role: str,
        fields_accessed: list[str],
        fields_denied: list[str],
        override_active: bool = False,
        detail: str = "",
    ) -> None:
        entry = AuditEntry(
            timestamp=datetime.utcnow().isoformat() + "Z",
            event_type=event_type,
            role=role,
            fields_accessed=fields_accessed,
            fields_denied=fields_denied,
            override_active=override_active,
            detail=detail,
        )
        with self._lock:
            self._entries.append(entry)

    def get_entries(self) -> list[AuditEntry]:
        with self._lock:
            return list(self._entries)

    def print_summary(self) -> None:
        print("\n" + "="*60)
        print("AUDIT LOG")
        print("="*60)
        for entry in self._entries:
            override_flag = " [EMERGENCY OVERRIDE]" if entry.override_active else ""
            denied_str = f" | DENIED: {entry.fields_denied}" if entry.fields_denied else ""
            print(
                f"[{entry.timestamp}] {entry.event_type:20s} | {entry.role:20s}"
                f"{override_flag}"
            )
            if entry.detail:
                print(f"  Detail: {entry.detail}")
            if entry.fields_denied:
                print(f"  Denied fields: {entry.fields_denied}")
        print("="*60 + "\n")


# ── Global audit log instance ──────────────────────────────────────────────────
_audit_log = AuditLog()

def get_audit_log() -> AuditLog:
    return _audit_log


# ── Emergency Override ─────────────────────────────────────────────────────────

_override_active = threading.local()

@contextmanager
def emergency_override(reason: str, requesting_role: str):
    """
    Context manager that grants full field access to all roles.
    Always writes to the audit log — this cannot be bypassed.
    """
    _override_active.active = True
    _audit_log.record(
        event_type="EMERGENCY_OVERRIDE_ACTIVATED",
        role=requesting_role,
        fields_accessed=[],
        fields_denied=[],
        override_active=True,
        detail=f"Reason: {reason}",
    )
    print(f"\n⚠️  EMERGENCY OVERRIDE ACTIVATED by {requesting_role}: {reason}")
    try:
        yield
    finally:
        _override_active.active = False
        _audit_log.record(
            event_type="EMERGENCY_OVERRIDE_DEACTIVATED",
            role=requesting_role,
            fields_accessed=[],
            fields_denied=[],
            override_active=True,
            detail="Override scope ended",
        )
        print(f"⚠️  Emergency override deactivated for {requesting_role}\n")


def _is_override_active() -> bool:
    return getattr(_override_active, "active", False)


# ── Access-Controlled Context ──────────────────────────────────────────────────

class AccessControlledContext:
    """
    Wraps a PatientContext and enforces role-based field access.
    Logs every access (granted and denied) to the audit log.
    """

    def __init__(self, patient: PatientContext, audit_log: Optional[AuditLog] = None):
        self._patient = patient
        self._audit = audit_log or _audit_log

    def get_view(self, role: str) -> dict[str, Any]:
        """
        Return a filtered dict of patient data visible to the given role.
        Under emergency_override, all fields are accessible.
        """
        all_fields = {
            f: getattr(self._patient, f)
            for f in self._patient.__dataclass_fields__
        }

        if _is_override_active():
            self._audit.record(
                event_type="CONTEXT_ACCESS",
                role=role,
                fields_accessed=list(all_fields.keys()),
                fields_denied=[],
                override_active=True,
                detail="Full access granted via emergency override",
            )
            return copy.deepcopy(all_fields)

        allowed = ROLE_ACCESS_POLICIES.get(role, set())
        granted = {}
        denied = []

        for fname, fval in all_fields.items():
            if fname in allowed:
                granted[fname] = fval
            else:
                denied.append(fname)

        self._audit.record(
            event_type="CONTEXT_ACCESS",
            role=role,
            fields_accessed=list(granted.keys()),
            fields_denied=denied,
            override_active=False,
        )
        return copy.deepcopy(granted)

    def get_summary_text(self, role: str) -> str:
        """Return a human-readable text summary for the given role."""
        view = self.get_view(role)
        lines = [f"Patient Context (visible to role: {role}):"]
        for k, v in view.items():
            if isinstance(v, dict):
                lines.append(f"  {k}: {json_safe(v)}")
            elif isinstance(v, list):
                lines.append(f"  {k}: {', '.join(str(i) for i in v)}")
            else:
                lines.append(f"  {k}: {v}")
        return "\n".join(lines)


def json_safe(obj: Any) -> str:
    """Convert nested structures to a compact readable string."""
    if isinstance(obj, dict):
        return "{" + ", ".join(f"{k}: {v}" for k, v in obj.items()) + "}"
    if isinstance(obj, list):
        return "[" + ", ".join(str(i) for i in obj) + "]"
    return str(obj)
