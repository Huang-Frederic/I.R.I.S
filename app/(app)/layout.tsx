import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import InstallPrompt from '@/components/layout/InstallPrompt';
import PageWidthContainer from '@/components/layout/PageWidthContainer';
import { UserContextProvider, type UserContextValue } from '@/lib/hooks/useUserContext';
import { PriceTrendsProvider } from '@/components/ui/PriceTrendsProvider';
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
      <PriceTrendsProvider>
        <div className="min-h-screen overflow-x-hidden">
          <Sidebar />
          {/* env(safe-area-inset-*) are 0 on desktop and on non-standalone browser;
              they only kick in for the iOS PWA standalone viewport. */}
          <main
            className="min-h-screen md:pl-[220px]"
            style={{
              paddingTop: 'env(safe-area-inset-top)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            <PageWidthContainer>{children}</PageWidthContainer>
          </main>
          <BottomNav />
          <InstallPrompt />
        </div>
      </PriceTrendsProvider>
    </UserContextProvider>
  );
}
