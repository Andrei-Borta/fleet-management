from fastapi import APIRouter, Response, status

from app.core.deps import DbSession
from app.modules.sites import service
from app.modules.sites.schemas import SiteCreate, SiteRead, SiteUpdate

router = APIRouter(prefix="/sites", tags=["sites"])


@router.get("", response_model=list[SiteRead])
def list_sites(db: DbSession) -> list[SiteRead]:
    return [SiteRead.model_validate(site) for site in service.list_sites(db)]


@router.post("", response_model=SiteRead, status_code=status.HTTP_201_CREATED)
def create_site(db: DbSession, data: SiteCreate) -> SiteRead:
    return SiteRead.model_validate(service.create_site(db, data))


@router.get("/{site_id}", response_model=SiteRead)
def get_site(db: DbSession, site_id: int) -> SiteRead:
    return SiteRead.model_validate(service.get_site(db, site_id))


@router.patch("/{site_id}", response_model=SiteRead)
def update_site(db: DbSession, site_id: int, data: SiteUpdate) -> SiteRead:
    return SiteRead.model_validate(service.update_site(db, site_id, data))


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_site(db: DbSession, site_id: int) -> Response:
    service.delete_site(db, site_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
