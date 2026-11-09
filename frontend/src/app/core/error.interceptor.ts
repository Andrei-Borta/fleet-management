import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpStatusCode,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { errorMessage } from './api-error';
import { NotificationService } from './notification.service';

/**
 * Set to `true` on a request to stop the interceptor from showing its error message, when the
 * caller shows the error itself:
 * `http.get(url, { context: new HttpContext().set(SKIP_ERROR_NOTIFICATION, true) })`.
 */
export const SKIP_ERROR_NOTIFICATION = new HttpContextToken<boolean>(() => false);

/**
 * Shows the backend `detail` in an error message for every failed request, except
 * 409 Conflict, which the caller handles (e.g. to offer alternatives). The error is always
 * rethrown, so callers can still update their own loading and error state.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notifications = inject(NotificationService);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status !== HttpStatusCode.Conflict &&
        !req.context.get(SKIP_ERROR_NOTIFICATION)
      ) {
        notifications.error(errorMessage(error));
      }
      return throwError(() => error);
    }),
  );
};
