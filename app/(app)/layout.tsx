import { cookies } from 'next/headers';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialTheme = cookieStore.get('theme')?.value === 'light' ? 'light' : 'dark';

  return (
    <div className="min-h-screen">
      <Sidebar initialTheme={initialTheme} />
      <main className="min-h-screen md:pl-[220px]">
        <div className="mx-auto max-w-[1200px] px-4 pb-20 pt-6 md:px-8 md:pb-8">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
