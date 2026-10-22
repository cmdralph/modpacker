import { Copy, FileUp, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { pluralize } from '../../lib/format';
import { library, libraryStore } from '../../state/library';
import { useStore } from '../../state/store';
import { ui, uiStore } from '../../state/ui';
import { loaderName, type Loader } from '../../types';
import { Modal } from '../ui/Modal';
import { Button, IconButton, cx } from '../ui/primitives';
import { toast } from '../ui/Toasts';

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function timeAgo(ms: number): string {
  const minutes = Math.round((ms - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  return relative.format(Math.round(hours / 24), 'day');
}

export function PacksDialog() {
  const open = useStore(uiStore, (s) => s.packsOpen);
  const { activeId, packs } = useStore(libraryStore, (s) => s);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const sorted = packs.toSorted((a, b) => b.updatedAt - a.updatedAt);

  return (
    <Modal
      open={open}
      onClose={() => {
        setConfirmDelete(null);
        ui.setPacks(false);
      }}
      icon={<FolderOpen className="size-6 text-accent-400" />}
      title="Your packs"
      description="Every pack is saved in this browser. Switch between them any time – nothing is lost."
      footer={
        <>
          <Button icon={<FileUp className="size-4" />} onClick={() => ui.openImport()}>
            Import a pack
          </Button>
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            onClick={() => {
              library.create();
              ui.setPacks(false);
              toast('success', 'Fresh pack ready – happy building!');
            }}
          >
            New pack
          </Button>
        </>
      }
    >
      <ul className="space-y-2">
        {sorted.map((pack) => {
          const active = pack.id === activeId;
          return (
            <li
              key={pack.id}
              className={cx('flex items-center gap-3 rounded-xl p-3 ring-1 ring-inset', active ? 'bg-accent-500/5 ring-accent-500/40' : 'ring-base-800 hover:bg-base-800/40')}
            >
              <button
                type="button"
                className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                onClick={() => {
                  library.switchTo(pack.id);
                  ui.setPacks(false);
                }}
                aria-current={active ? 'true' : undefined}
              >
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold text-base-50">{pack.name}</span>
                  {active && <span className="shrink-0 rounded bg-accent-500/15 px-1.5 text-[11px] font-bold text-accent-300">Open</span>}
                </span>
                <span className="block truncate text-xs text-base-400">
                  {loaderName(pack.loader as Loader)} {pack.gameVersion} · {pluralize(pack.modCount, 'mod')} · edited {timeAgo(pack.updatedAt)}
                </span>
              </button>
              {confirmDelete === pack.id ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="xs"
                    variant="danger"
                    onClick={() => {
                      library.remove(pack.id);
                      setConfirmDelete(null);
                      toast('info', `Deleted “${pack.name}”.`);
                    }}
                  >
                    Delete
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setConfirmDelete(null)}>
                    Keep
                  </Button>
                </div>
              ) : (
                <div className="flex shrink-0 items-center">
                  <IconButton
                    label={`Duplicate ${pack.name}`}
                    onClick={() => {
                      void library.duplicate(pack.id);
                      ui.setPacks(false);
                      toast('success', `Made a copy of “${pack.name}”.`);
                    }}
                  >
                    <Copy className="size-4" />
                  </IconButton>
                  <IconButton label={`Delete ${pack.name}`} tone="danger" onClick={() => setConfirmDelete(pack.id)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
