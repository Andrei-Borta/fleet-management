import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { RoleService } from './role.service';

export const roleInterceptor: HttpInterceptorFn = (req, next) => {
  const role = inject(RoleService).role();
  return next(req.clone({ setHeaders: { 'X-Role': role } }));
};
