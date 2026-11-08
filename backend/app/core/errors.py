"""Domain errors and their HTTP representations."""

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse


class NotFoundError(Exception):
    """The requested resource does not exist."""


class ConflictError(Exception):
    """The requested operation conflicts with the current state."""


class ForbiddenError(Exception):
    """The current role cannot perform the requested operation."""


def register_error_handlers(app: FastAPI) -> None:
    """Translate domain errors at the HTTP boundary."""

    @app.exception_handler(NotFoundError)
    async def not_found_handler(_request: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": str(exc)})

    @app.exception_handler(ConflictError)
    async def conflict_handler(_request: Request, exc: ConflictError) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": str(exc)})

    @app.exception_handler(ForbiddenError)
    async def forbidden_handler(_request: Request, exc: ForbiddenError) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_403_FORBIDDEN, content={"detail": str(exc)})
