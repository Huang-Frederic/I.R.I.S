import { redirect } from 'next/navigation';

// Home is now an alias for /dashboard. Kept as a route so /'s in the wild
// (bookmarks, deep links, push notifications) still land somewhere useful.
export default function HomePage(): never {
  redirect('/dashboard');
}
