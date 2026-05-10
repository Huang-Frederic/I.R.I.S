import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import RouteChangeRefresher from '@/components/layout/RouteChangeRefresher';
import InstallPrompt from '@/components/layout/InstallPrompt';
import { UserContextProvider, type UserContextValue } from '@/lib/hooks/useUserContext';
import { createClient } from '@/lib/supabase/server';
import type { UserProfile } from '@/lib/types';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const [
    {
      data: { user },
    },
    { data: profiles },
  ] = await Promise.all([supabase.auth.getUser(), supabase.from('user_profiles').select('user_id, display_name')]);

  if (!user) {
    return null;
  }

  const myUserId = user.id;
  const myProfile = profiles?.find((p: UserProfile) => p.user_id === myUserId) ?? null;
  const partnerProfile = profiles?.find((p: UserProfile) => p.user_id !== myUserId) ?? null;

  const userContextValue: UserContextValue = {
    myUserId,
    myName: myProfile?.display_name ?? user.email ?? 'Moi',
    partnerUserId: partnerProfile?.user_id ?? null,
    partnerName: partnerProfile?.display_name ?? null,
  };

  return (
    <UserContextProvider value={userContextValue}>
      <RouteChangeRefresher />
      <div className="min-h-screen overflow-x-hidden">
        <Sidebar />
        <main className="min-h-screen md:pl-[220px]">
          <div className="mx-auto max-w-[1200px] px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))] md:px-8 md:pb-8 md:pt-6">{children}</div>
        </main>
        <BottomNav />
        <InstallPrompt />
      </div>
    </UserContextProvider>
  );
}
