import { registerLocaleData } from '@angular/common';
import localeRo from '@angular/common/locales/ro';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { errorInterceptor } from './core/error.interceptor';
import { roleInterceptor } from './core/role.interceptor';

registerLocaleData(localeRo);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([roleInterceptor, errorInterceptor])),
  ],
};
