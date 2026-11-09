import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';

/** One item of a FastAPI/Pydantic validation error (422 with a list `detail`). */
export interface ValidationIssue {
  loc: (string | number)[];
  msg: string;
  type: string;
}

/** Error body sent by the backend (docs/API_CONVENTIONS.md). */
export interface ApiErrorBody {
  detail: string | ValidationIssue[];
}

/**
 * Body of a 409 Conflict. The error interceptor never shows these: the calling page decides
 * what to do. Some conflicts suggest `alternatives` (e.g. other equipment for a reservation);
 * most (e.g. deleting a site that has reservations) don't, so it is optional.
 */
export interface ApiConflict<TAlternative = unknown> {
  detail: string;
  alternatives?: TAlternative[];
}

/** Returns the 409 body when `error` is a conflict, otherwise `null`. */
export function asConflict<TBody extends ApiConflict = ApiConflict>(error: unknown): TBody | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== HttpStatusCode.Conflict) {
    return null;
  }
  const body: unknown = error.error;
  if (isObject(body) && typeof body['detail'] === 'string') {
    return body as TBody;
  }
  return { detail: 'This conflicts with existing data.' } as TBody;
}

/** A short, human-readable message for a failed request. */
export function errorMessage(error: HttpErrorResponse): string {
  if (error.status === 0) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  const body: unknown = error.error;
  const detail = isObject(body) ? body['detail'] : undefined;
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    return (detail as ValidationIssue[]).map(formatIssue).join('; ');
  }
  return fallbackMessage(error.status);
}

function formatIssue(issue: ValidationIssue): string {
  const field = [...(issue.loc ?? [])].reverse().find((part) => part !== 'body');
  return field === undefined ? issue.msg : `${field}: ${issue.msg}`;
}

function fallbackMessage(status: number): string {
  switch (status) {
    case HttpStatusCode.Forbidden:
      return 'Your role is not allowed to do this.';
    case HttpStatusCode.NotFound:
      return 'The requested item was not found.';
    case HttpStatusCode.UnprocessableEntity:
      return 'Some values are invalid.';
    default:
      return status >= 500
        ? 'Something went wrong on the server. Try again.'
        : `The request failed (${status}).`;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
