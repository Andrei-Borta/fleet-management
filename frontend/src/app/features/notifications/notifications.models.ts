import { Role } from '../../core/role.service';

/** `GET /notifications` item; the feed belongs to the role sent in `X-Role`. */
export interface Notification {
  id: number;
  role: Role;
  title: string;
  body: string;
  /** App route to open on click, e.g. `/maintenance` or `/equipment/7`. */
  link: string | null;
  created_at: string;
  /** `null` while unread. */
  read_at: string | null;
}

/** `POST /notifications/read-all` response. */
export interface ReadAllResult {
  marked: number;
}
