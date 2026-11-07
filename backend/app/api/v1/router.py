from fastapi import APIRouter

from app.modules.dashboard.router import router as dashboard
from app.modules.equipment.router import router as equipment
from app.modules.maintenance.router import router as maintenance
from app.modules.notifications.router import router as notifications
from app.modules.operations.router import router as operations
from app.modules.reservations.router import router as reservations
from app.modules.sites.router import router as sites

api_router = APIRouter()
for r in (equipment, sites, reservations, maintenance, operations, dashboard, notifications):
    api_router.include_router(r)
