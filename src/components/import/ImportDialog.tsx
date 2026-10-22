import { CircleAlert, FileArchive, FileUp, Info, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { isCurseForgeConfigured } from '../../api/curseforgeConfig';
import { errorMessage } from '../../api/http';
import { parsePackArchive, type ParsedPack } from '../../import/parsePack';
import { pluralize } from '../../lib/format';
import { packController } from '../../state/controller';
import { packStore } from '../../state/packStore';
import { useStore } from '../../state/store';
import { ui, uiStore } from '../../state/ui';
import { loaderName } from '../../types';
import { Modal } from '../ui/Modal';
import { Button, Callout, SourceBadge, Spinner, cx } from '../ui/primitives';
import { toast } from '../ui/Toasts';

type Step = { kind: 'pick' } | { kind: 'parsing'; name: string } | { kind: 'preview'; name: string; pack: ParsedPack } | { kind: 'importing'; name: string; pack: ParsedPack };

export function ImportDialog() {
  const open = useStore(uiStore, (s) => s.importOpen);
  const modCount = useStore(packStore, (s) => s.order.length);
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep({ kind: 'pick' });
      setError(null);
    }
  }, [open]);

  async function readFile(file: File) {
    setError(null);
    setStep({ kind: 'parsing', name: file.name });
    try {
      const pack = await parsePackArchive(await file.arrayBuffer());
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
      const summary = await packController.importPack(pack);
      ui.closeImport();
      toast(
        summary.unmatched.length > 0 ? 'warning' : 'success',
        `Imported ${pluralize(summary.added, 'mod')} from ${name}.` +
          (summary.unmatched.length > 0 ? ` ${summary.unmatched.length} file(s) couldn’t be identified: ${summary.unmatched.slice(0, 3).join(', ')}${summary.unmatched.length > 3 ? '…' : ''}` : ''),
        { durationMs: 10_000 },
      );
    } catch (e) {
      setError(`Import failed: ${errorMessage(e)}`);
      setStep({ kind: 'preview', name, pack });
    }
  }

  const needsCurseForge = step.kind === 'preview' && step.pack.format === 'curseforge' && !isCurseForgeConfigured();

  return (
    <Modal
      open={open}
      onClose={ui.closeImport}
      icon={<FileUp className="size-6 text-accent-400" />}
      title="Import a modpack"
      description="Open a Modrinth .mrpack or a CurseForge .zip to keep editing it here. Every mod is pinned to the exact file the pack used."
      footer={
        step.kind === 'preview' || step.kind === 'importing' ? (
          <>
            <Button variant="ghost" onClick={() => setStep({ kind: 'pick' })} disabled={step.kind === 'importing'}>
              Choose another file
            </Button>
            {needsCurseForge ? (
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
                {modCount > 0 ? 'Replace pack & import' : 'Import'}
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
                <p className="truncate font-bold text-base-50">{step.pack.meta.name || step.name}</p>
                <SourceBadge source={step.pack.format} />
              </div>
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
            {modCount > 0 && (
              <Callout tone="warning" icon={<TriangleAlert className="size-4" />}>
                Importing replaces your current pack ({pluralize(modCount, 'mod')}) and switches the profile.
              </Callout>
            )}
            {needsCurseForge && (
              <Callout tone="warning" icon={<TriangleAlert className="size-4" />} title="CurseForge access needed">
                CurseForge packs reference mods by project ID, so a CurseForge API key or proxy is needed to look them up.
              </Callout>
            )}
            {step.pack.skipped.length > 0 && (
              <Callout tone="info" icon={<Info className="size-4" />}>
                {pluralize(step.pack.skipped.length, 'non-mod file')} (resource packs, shaders, …) won’t be imported.
              </Callout>
            )}
            {step.pack.hasOverrides && (
              <Callout tone="info" icon={<Info className="size-4" />}>
                The pack’s overrides folder (configs and other bundled files) isn’t carried over. Only mods are imported.
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
