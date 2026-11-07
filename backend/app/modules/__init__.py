"""Import every module's models here so Alembic autogenerate can see them."""

from app.modules.dashboard import models as _dashboard  # noqa: F401
from app.modules.equipment import models as _equipment  # noqa: F401
from app.modules.maintenance import models as _maintenance  # noqa: F401
from app.modules.notifications import models as _notifications  # noqa: F401
from app.modules.operations import models as _operations  # noqa: F401
from app.modules.reservations import models as _reservations  # noqa: F401
from app.modules.sites import models as _sites  # noqa: F401
