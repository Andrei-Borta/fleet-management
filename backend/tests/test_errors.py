"""Domain exceptions are rendered using the API error contract."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import (
    ConflictError,
    ForbiddenError,
    InvalidDataError,
    NotFoundError,
    register_error_handlers,
)
from app.main import app


@pytest.mark.parametrize(
    ("error_type", "expected_status"),
    [(NotFoundError, 404), (ConflictError, 409), (ForbiddenError, 403), (InvalidDataError, 422)],
)
def test_domain_errors_map_to_http(error_type, expected_status):
    test_app = FastAPI()
    register_error_handlers(test_app)

    @test_app.get("/error")
    def raise_error():
        raise error_type("A useful explanation")

    response = TestClient(test_app).get("/error")

    assert response.status_code == expected_status
    assert response.json() == {"detail": "A useful explanation"}
    assert error_type in app.exception_handlers


def test_unexpected_errors_are_not_translated_to_domain_errors():
    test_app = FastAPI()
    register_error_handlers(test_app)

    @test_app.get("/error")
    def raise_error():
        raise RuntimeError("unexpected")

    response = TestClient(test_app, raise_server_exceptions=False).get("/error")
    assert response.status_code == 500
