import { ChevronDown, FilePlus, FolderPlus, Paperclip, Trash2, TriangleAlert } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { formatBytes, pluralize } from '../../lib/format';
import { filesStore, packFiles, totalSize, type PackFile } from '../../state/files';
import { useStore } from '../../state/store';
import { IconButton, Select, cx } from '../ui/primitives';
import { toast } from '../ui/Toasts';

const TARGETS = [
  { value: 'config', label: 'config/' },
  { value: 'resourcepacks', label: 'resourcepacks/' },
  { value: 'shaderpacks', label: 'shaderpacks/' },
  { value: 'defaultconfigs', label: 'defaultconfigs/' },
  { value: 'kubejs', label: 'kubejs/' },
  { value: '', label: 'Game folder (root)' },
];

const LARGE_BYTES = 200 * 1024 * 1024;

function rootLabel(file: PackFile): string {
  return file.root === 'overrides' ? '' : file.root === 'client-overrides' ? 'client only · ' : 'server only · ';
}

/**
 * Extra files bundled into the archive's overrides folder – configs, resource packs, shader packs…
 * Saved per pack in IndexedDB so they survive reloads.
 */
export function OverridesSection() {
  const { files, volatile } = useStore(filesStore, (s) => s);
  const [target, setTarget] = useState('config');
  const [expanded, setExpanded] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const size = totalSize(files);

  async function addFiles(event: ChangeEvent<HTMLInputElement>, asFolder: boolean) {
    const list = [...(event.target.files ?? [])];
    event.target.value = '';
    if (list.length === 0) return;
    const incoming: PackFile[] = list.map((file) => {
      // A picked folder keeps its own name, e.g. choosing "config" gives config/sodium.json.
      const relative = asFolder && file.webkitRelativePath ? file.webkitRelativePath : file.name;
      const path = asFolder ? relative : target ? `${target}/${relative}` : relative;
      return { root: 'overrides', path, size: file.size, data: file };
    });
    const rejected = await packFiles.add(incoming);
    setExpanded(true);
    toast(
      rejected.length > 0 ? 'warning' : 'success',
      `Bundled ${pluralize(incoming.length - rejected.length, 'file')}.` + (rejected.length > 0 ? ` Skipped ${rejected.length} with unsafe names.` : ''),
    );
  }

  return (
    <div className="space-y-2 rounded-xl bg-base-900/60 p-3 ring-1 ring-inset ring-base-800">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
      >
        <Paperclip className="size-4 text-base-400" aria-hidden />
        <span className="flex-1 text-sm font-semibold text-base-100">
          Extra files <span className="font-normal text-base-500">· configs, resource packs, shaders</span>
        </span>
        <span className="text-xs text-base-400">{files.length > 0 ? `${files.length} · ${formatBytes(size)}` : 'none'}</span>
        <ChevronDown className={cx('size-4 text-base-400 transition-transform', expanded && 'rotate-180')} aria-hidden />
      </button>

      {expanded && (
        <div className="space-y-3 pt-1 animate-fade-in">
          <p className="text-xs text-base-500">These go into the pack’s overrides folder and are copied into the game folder on install.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Destination folder" value={target} onChange={(e) => setTarget(e.target.value)} className="min-w-40 flex-1">
              {TARGETS.map((t) => (
                <option key={t.label} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
            <IconButton label="Add files to the chosen folder" onClick={() => fileInput.current?.click()} className="size-10 ring-1 ring-inset ring-base-700">
              <FilePlus className="size-4" />
            </IconButton>
            <IconButton label="Add a whole folder (keeps its name, e.g. pick your config folder)" onClick={() => folderInput.current?.click()} className="size-10 ring-1 ring-inset ring-base-700">
              <FolderPlus className="size-4" />
            </IconButton>
            <input ref={fileInput} type="file" multiple className="sr-only" tabIndex={-1} onChange={(e) => void addFiles(e, false)} />
            <input
              ref={folderInput}
              type="file"
              multiple
              className="sr-only"
              tabIndex={-1}
              // Non-standard but supported by every current browser for picking a directory.
              {...{ webkitdirectory: '' }}
              onChange={(e) => void addFiles(e, true)}
            />
          </div>

          {volatile && (
            <p className="flex items-start gap-1.5 text-xs text-amber-300">
              <TriangleAlert className="mt-px size-3.5 shrink-0" /> This browser won’t let us save files, so they’ll be gone after a reload.
            </p>
          )}
          {size > LARGE_BYTES && (
            <p className="flex items-start gap-1.5 text-xs text-amber-300">
              <TriangleAlert className="mt-px size-3.5 shrink-0" /> That’s a big bundle ({formatBytes(size)}) – exporting may take a moment.
            </p>
          )}

          {files.length > 0 && (
            <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {files.map((file) => (
                <li key={`${file.root}/${file.path}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-base-800/50">
                  <span className="min-w-0 flex-1 truncate font-mono text-base-200" title={`${file.root}/${file.path}`}>
                    <span className="text-base-500">{rootLabel(file)}</span>
                    {file.path}
                  </span>
                  <span className="shrink-0 text-base-500">{formatBytes(file.size)}</span>
                  <IconButton
                    label={`Remove ${file.path}`}
                    tone="danger"
                    className="size-6"
                    onClick={() => void packFiles.remove((f) => f.root === file.root && f.path === file.path)}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          {files.length > 1 && (
            <button type="button" className="text-xs font-semibold text-rose-300 hover:underline" onClick={() => void packFiles.replace([])}>
              Remove all extra files
            </button>
          )}
        </div>
      )}
    </div>
  );
}
