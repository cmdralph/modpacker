import { CircleAlert, FileArchive, FileUp, Info, Link2, Paperclip, TriangleAlert } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { isCurseForgeConfigured } from '../../api/curseforgeConfig';
import { errorMessage } from '../../api/http';
import { parsePackArchive, type ParsedPack } from '../../import/parsePack';
import { formatBytes, pluralize } from '../../lib/format';
import { packController } from '../../state/controller';
import { packFiles, totalSize } from '../../state/files';
import { library } from '../../state/library';
import { initialPackState } from '../../state/pack';
import { useStore } from '../../state/store';
import { ui, uiStore, type ImportPreset } from '../../state/ui';
import { loaderName } from '../../types';
import { Modal } from '../ui/Modal';
import { Button, Callout, SourceBadge, Spinner, cx } from '../ui/primitives';
import { toast } from '../ui/Toasts';

type Step =
  | { kind: 'pick' }
  | { kind: 'parsing'; name: string }
  | { kind: 'preview'; name: string; pack: ParsedPack }
  | { kind: 'importing'; name: string; pack: ParsedPack };

export function ImportDialog() {
  const open = useStore(uiStore, (s) => s.importOpen);
  const preset = useStore(uiStore, (s) => s.importPreset);
  // Mounted only while open, so each import starts from a clean slate.
  return open ? <ImportFlow preset={preset} /> : null;
}

function needsCurseForge(pack: ParsedPack): boolean {
  return pack.entries.some((e) => e.kind === 'project' && e.source === 'curseforge') && !isCurseForgeConfigured();
}

function ImportFlow({ preset }: { preset: ImportPreset | null }) {
  const [step, setStep] = useState<Step>(() => (preset ? { kind: 'preview', name: preset.name, pack: preset.pack } : { kind: 'pick' }));
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function readFile(file: File) {
    setError(null);
    setStep({ kind: 'parsing', name: file.name });
    try {
      const pack = await parsePackArchive(file);
      setStep({ kind: 'preview', name: file.name, pack });
    } catch (e) {
      setError(errorMessage(e));
      setStep({ kind: 'pick' });
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void readFile(file);
  }

  async function runImport(name: string, pack: ParsedPack) {
    setStep({ kind: 'importing', name, pack });
    try {
      // Lookups run first; only then is a new pack opened, so a failure changes nothing.
      const summary = await packController.importPack(pack, () => {
        library.create({ ...initialPackState(), profile: pack.profile });
      });
      await packFiles.replace(pack.files);
      ui.closeImport();
      const unmatched = summary.unmatched.length;
      toast(
        unmatched > 0 ? 'warning' : 'success',
        `Opened “${pack.meta.name || name}” as a new pack with ${pluralize(summary.added, 'mod')}` +
          (pack.files.length > 0 ? ` and ${pluralize(pack.files.length, 'bundled file')}` : '') +
          '.' +
          (unmatched > 0 ? ` ${unmatched} couldn’t be identified: ${summary.unmatched.slice(0, 3).join(', ')}${unmatched > 3 ? '…' : ''}` : ''),
        { durationMs: 10_000 },
      );
    } catch (e) {
      setError(`Import failed: ${errorMessage(e)}`);
      setStep({ kind: 'preview', name, pack });
    }
  }

  const blocked = step.kind === 'preview' && needsCurseForge(step.pack);

  return (
    <Modal
      open
      onClose={ui.closeImport}
      icon={preset ? <Link2 className="size-6 text-accent-400" /> : <FileUp className="size-6 text-accent-400" />}
      title={preset ? 'Someone shared a modpack with you' : 'Import a modpack'}
      description={
        preset
          ? 'Have a look, then open it as a new pack. Your current packs stay untouched.'
          : 'Open a Modrinth .mrpack or a CurseForge .zip to keep editing it here. It opens as a new pack, with every mod pinned to the exact file it used.'
      }
      footer={
        step.kind === 'preview' || step.kind === 'importing' ? (
          <>
            <Button variant="ghost" onClick={() => (preset ? ui.closeImport() : setStep({ kind: 'pick' }))} disabled={step.kind === 'importing'}>
              {preset ? 'No thanks' : 'Choose another file'}
            </Button>
            {blocked ? (
              <Button
                variant="primary"
                onClick={() => {
                  ui.closeImport();
                  ui.openSettings('curseforge');
                }}
              >
                Configure CurseForge
              </Button>
            ) : (
              <Button variant="primary" loading={step.kind === 'importing'} onClick={() => void runImport(step.name, step.pack)}>
                Open as new pack
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      <div className="space-y-4">
        {error && (
          <Callout tone="error" icon={<CircleAlert className="size-4" />}>
            {error}
          </Callout>
        )}

        {(step.kind === 'pick' || step.kind === 'parsing') && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cx(
              'flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors',
              dragging ? 'border-accent-400 bg-accent-500/5' : 'border-base-700',
            )}
          >
            {step.kind === 'parsing' ? (
              <>
                <Spinner className="size-8 text-accent-400" />
                <p className="text-sm text-base-300">Reading {step.name}…</p>
              </>
            ) : (
              <>
                <FileArchive className="size-10 text-base-500" aria-hidden />
                <div>
                  <p className="font-semibold text-base-100">Drop a .mrpack or .zip here</p>
                  <p className="mt-1 text-sm text-base-500">or</p>
                </div>
                <Button variant="primary" icon={<FileUp className="size-4" />} onClick={() => inputRef.current?.click()}>
                  Choose file
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".mrpack,.zip,application/zip,application/x-modrinth-modpack+zip"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void readFile(file);
                  }}
                />
              </>
            )}
          </div>
        )}

        {(step.kind === 'preview' || step.kind === 'importing') && (
          <div className="space-y-4">
            <div className="rounded-xl bg-base-800/50 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate font-bold text-base-50">{step.pack.meta.name || step.name}</p>
                {step.pack.format !== 'link' && <SourceBadge source={step.pack.format} />}
              </div>
              {step.pack.meta.description && <p className="mt-1 text-sm text-base-400">{step.pack.meta.description}</p>}
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-base-500">Minecraft</dt>
                <dd className="font-semibold text-base-100">{step.pack.profile.gameVersion}</dd>
                <dt className="text-base-500">Loader</dt>
                <dd className="font-semibold text-base-100">
                  {loaderName(step.pack.profile.loader)} {step.pack.loaderVersion ?? ''}
                </dd>
                <dt className="text-base-500">Mods</dt>
                <dd className="font-semibold text-base-100">{step.pack.entries.length}</dd>
                {step.pack.meta.version && (
                  <>
                    <dt className="text-base-500">Pack version</dt>
                    <dd className="font-semibold text-base-100">{step.pack.meta.version}</dd>
                  </>
                )}
              </dl>
            </div>
            {blocked && (
              <Callout tone="warning" icon={<TriangleAlert className="size-4" />} title="CurseForge access needed">
                This pack lists CurseForge mods by project ID, so a CurseForge API key or proxy is needed to look them up.
              </Callout>
            )}
            {step.pack.files.length > 0 && (
              <Callout tone="success" icon={<Paperclip className="size-4" />}>
                {pluralize(step.pack.files.length, 'bundled file')} ({formatBytes(totalSize(step.pack.files))}) – configs and other extras come along too.
              </Callout>
            )}
            {step.pack.skipped.length > 0 && (
              <Callout tone="info" icon={<Info className="size-4" />}>
                {pluralize(step.pack.skipped.length, 'entry', 'entries')} (resource packs, shaders or unsafe file names) won’t be imported.
              </Callout>
            )}
            {step.kind === 'importing' && (
              <p className="flex items-center gap-2 text-sm text-base-400">
                <Spinner /> Looking up mods…
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
