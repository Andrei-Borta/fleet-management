"""Business logic for construction sites."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, InvalidDataError, NotFoundError
from app.modules.reservations.service import has_approved_outside_site_dates
from app.modules.sites.models import Site
from app.modules.sites.schemas import SiteCreate, SiteUpdate


def list_sites(db: Session) -> list[Site]:
    return list(db.scalars(select(Site).order_by(Site.id)).all())


def get_site(db: Session, site_id: int, *, for_update: bool = False) -> Site:
    site = db.get(Site, site_id, with_for_update=for_update)
    if site is None:
        raise NotFoundError("Site not found")
    return site


def create_site(db: Session, data: SiteCreate) -> Site:
    site = Site(**data.model_dump())
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


def update_site(db: Session, site_id: int, data: SiteUpdate) -> Site:
    # Locked so that a reservation cannot be approved against the dates being replaced.
    site = get_site(db, site_id, for_update=True)
    changes = data.model_dump(exclude_unset=True)
    start_date = changes.get("start_date", site.start_date)
    end_date = changes.get("end_date", site.end_date)
    if end_date < start_date:
        raise InvalidDataError("end_date must not be before start_date")
    if ("start_date" in changes or "end_date" in changes) and has_approved_outside_site_dates(
        db, site_id, start_date, end_date
    ):
        raise ConflictError("Site dates must include all approved reservations")
    for field, value in changes.items():
        setattr(site, field, value)
    db.commit()
    db.refresh(site)
    return site


def delete_site(db: Session, site_id: int) -> None:
    site = get_site(db, site_id)
    db.delete(site)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if getattr(exc.orig, "sqlstate", None) == "23503":
            raise ConflictError("Cannot delete a site with reservations") from exc
        raise
