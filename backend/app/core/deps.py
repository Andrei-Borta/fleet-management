from enum import StrEnum
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.core.db import get_db


class Role(StrEnum):
    """Demo roles. No authentication in the MVP: the UI sends an X-Role header."""

    SITE_MANAGER = "site_manager"
    FLEET_MANAGER = "fleet_manager"
    MECHANIC = "mechanic"
    OPERATOR = "operator"


def get_role(x_role: Annotated[Role, Header()] = Role.FLEET_MANAGER) -> Role:
    return x_role


DbSession = Annotated[Session, Depends(get_db)]
CurrentRole = Annotated[Role, Depends(get_role)]
