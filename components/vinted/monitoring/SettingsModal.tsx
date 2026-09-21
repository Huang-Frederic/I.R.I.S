// components/vinted/monitoring/SettingsModal.tsx
'use client';

import type { VintedBotScheduleRow } from '@/lib/types';
import Modal from '@/components/ui/Modal';
import BotConfigForm from './BotConfigForm';
import ScheduleEditor from './ScheduleEditor';
import CookiesForm from './CookiesForm';
import GroupPriorityEditor from './GroupPriorityEditor';

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  editable: boolean;
  dailyQuota: number;
  repostAfterDays: number;
  schedule: Pick<VintedBotScheduleRow, 'day_of_week' | 'starts_at' | 'ends_at'>[];
  groupPriority: string[];
  presentGroups: string[];
  onSaved: () => void;
}

export default function SettingsModal({
  open,
  onClose,
  userId,
  editable,
  dailyQuota,
  repostAfterDays,
  schedule,
  groupPriority,
  presentGroups,
  onSaved,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel="Paramètres du bot Vinted"
      className="bg-surface border-border max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border p-6 shadow-xl"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Paramètres</h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className="text-text-muted hover:text-text">
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-5">
        <section>
          <h3 className="text-text-muted mb-2 text-xs uppercase">Quota &amp; repost</h3>
          <BotConfigForm
            key={userId}
            userId={userId}
            editable={editable}
            dailyQuota={dailyQuota}
            repostAfterDays={repostAfterDays}
            onSaved={onSaved}
          />
        </section>
        <section>
          <h3 className="text-text-muted mb-2 text-xs uppercase">Ordre de priorité des groupes</h3>
          <GroupPriorityEditor
            key={userId}
            userId={userId}
            editable={editable}
            groupPriority={groupPriority}
            presentGroups={presentGroups}
            onSaved={onSaved}
          />
        </section>
        <section>
          <h3 className="text-text-muted mb-2 text-xs uppercase">Planning horaire</h3>
          <ScheduleEditor key={userId} userId={userId} editable={editable} schedule={schedule} onSaved={onSaved} />
        </section>
        <section>
          <h3 className="text-text-muted mb-2 text-xs uppercase">Cookies Vinted</h3>
          <CookiesForm userId={userId} onSaved={onSaved} />
        </section>
      </div>
    </Modal>
  );
}
