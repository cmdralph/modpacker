import { Keyboard } from 'lucide-react';
import { useStore } from '../state/store';
import { ui, uiStore } from '../state/ui';
import { Modal } from './ui/Modal';

export const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ['/'], action: 'Jump to search' },
  { keys: ['Esc'], action: 'Clear the search / close a dialog' },
  { keys: ['G'], action: 'Switch between grid and list results' },
  { keys: ['H'], action: 'Hide or show mods already in your pack' },
  { keys: ['P'], action: 'Open your packs' },
  { keys: [','], action: 'Open settings' },
  { keys: ['?'], action: 'Show this list' },
];

export function ShortcutsDialog() {
  const open = useStore(uiStore, (s) => s.shortcutsOpen);
  return (
    <Modal open={open} onClose={() => ui.setShortcuts(false)} icon={<Keyboard className="size-6 text-accent-400" />} title="Keyboard shortcuts">
      <dl className="divide-y divide-base-800">
        {SHORTCUTS.map((s) => (
          <div key={s.action} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-sm text-base-200">{s.action}</dt>
            <dd className="flex gap-1">
              {s.keys.map((k) => (
                <kbd key={k} className="min-w-7 rounded-md border border-b-2 border-base-700 bg-base-800 px-1.5 py-0.5 text-center text-xs font-semibold text-base-100">
                  {k}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
