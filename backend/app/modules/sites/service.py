"""Business logic for construction sites."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.modules.sites.models import Site
from app.modules.sites.schemas import SiteCreate, SiteUpdate


def list_sites(db: Session) -> list[Site]:
    return list(db.scalars(select(Site).order_by(Site.id)).all())


def get_site(db: Session, site_id: int) -> Site:
    site = db.get(Site, site_id)
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
    site = get_site(db, site_id)
    changes = data.model_dump(exclude_unset=True)
    start_date = changes.get("start_date", site.start_date)
    end_date = changes.get("end_date", site.end_date)
    if end_date < start_date:
        raise ValueError("end_date must not be before start_date")
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
