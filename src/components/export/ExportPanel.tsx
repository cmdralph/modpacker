import { CircleAlert, Download, FileArchive, Info, LoaderCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { errorMessage } from '../../api/http';
import { buildPackArchive, downloadBlob } from '../../export/packager';
import { planExport } from '../../export/plan';
import { useLatestLoaderVersion } from '../../hooks/useRemoteData';
import { pluralize } from '../../lib/format';
import { packStore } from '../../state/packStore';
import { useStore } from '../../state/store';
import { loaderName, type ExportFormat, type Loader } from '../../types';
import { Button, Callout, Field, Segmented, cx, inputClass, panelClass } from '../ui/primitives';
import { toast } from '../ui/Toasts';
import { CrossPlatformDialog, FORMAT_LABEL } from './CrossPlatformDialog';

export function ExportPanel({ className }: { className?: string }) {
  const state = useStore(packStore, (s) => s);
  const { meta, profile } = state;
  const [format, setFormat] = useState<ExportFormat>('modrinth');
  const [dialogFormat, setDialogFormat] = useState<ExportFormat | null>(null);
  const [exporting, setExporting] = useState(false);
  const detected = useLatestLoaderVersion(profile.loader, profile.gameVersion);
  // A typed (or imported) loader build wins; the reducer clears it whenever the profile changes.
  const loaderOverride = state.loaderVersion;
  const setLoaderOverride = (version: string | null) => packStore.dispatch({ type: 'setLoaderVersion', version });
  const loaderVersion = (loaderOverride ?? detected.version ?? '').trim();

  const plans = useMemo(
    () => ({
      curseforge: planExport(state, 'curseforge', new Set()),
      modrinth: planExport(state, 'modrinth', new Set()),
    }),
    [state],
  );
  const plan = plans[format];

  async function runExport(target: ExportFormat, omitKeys: string[] = []) {
    const current = planExport(packStore.getState(), target, new Set(omitKeys));
    if (current.pending.length > 0) {
      toast('warning', `Wait for ${pluralize(current.pending.length, 'mod')} to finish resolving.`);
      return;
    }
    if (current.crossPlatform.length > 0) {
      setDialogFormat(target);
      return;
    }
    if (current.included.length === 0) {
      toast('error', 'There are no mods with a compatible file to export.');
      return;
    }
    if (!loaderVersion) {
      toast('error', `Enter the ${loaderName(profile.loader)} loader version before exporting.`);
      return;
    }

    setDialogFormat(null);
    setExporting(true);
    try {
      const { meta: currentMeta, profile: currentProfile } = packStore.getState();
      const archive = await buildPackArchive({
        format: target,
        meta: currentMeta,
        profile: currentProfile,
        loaderVersion,
        mods: current.included,
      });
      downloadBlob(archive.blob, archive.filename);
      const skipped = current.unavailable.length + current.omitted.length;
      toast(
        'success',
        `Exported ${archive.filename} with ${pluralize(archive.fileCount, 'mod')}` + (skipped > 0 ? ` (${skipped} skipped).` : '.'),
      );
    } catch (error) {
      toast('error', `Export failed: ${errorMessage(error)}`);
    } finally {
      setExporting(false);
    }
  }

  const exportable = plan.included.length;
  const disabled = exporting || plan.pending.length > 0 || exportable + plan.crossPlatform.length === 0 || !loaderVersion;

  return (
    <section aria-label="Export" className={cx(panelClass, 'flex flex-col gap-4 p-4', className)}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-base-50">
        <FileArchive className="size-5 text-accent-400" aria-hidden /> Export
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Pack name" htmlFor="pack-name">
            <input
              id="pack-name"
              className={inputClass}
              value={meta.name}
              maxLength={80}
              onChange={(e) => packStore.dispatch({ type: 'setMeta', patch: { name: e.target.value } })}
              onBlur={(e) => !e.target.value.trim() && packStore.dispatch({ type: 'setMeta', patch: { name: 'My Modpack' } })}
            />
          </Field>
        </div>
        <Field label="Pack version" htmlFor="pack-version">
          <input
            id="pack-version"
            className={inputClass}
            value={meta.version}
            maxLength={32}
            onChange={(e) => packStore.dispatch({ type: 'setMeta', patch: { version: e.target.value } })}
            onBlur={(e) => !e.target.value.trim() && packStore.dispatch({ type: 'setMeta', patch: { version: '1.0.0' } })}
          />
        </Field>
        <Field label="Author" htmlFor="pack-author">
          <input
            id="pack-author"
            className={inputClass}
            value={meta.author}
            maxLength={64}
            onChange={(e) => packStore.dispatch({ type: 'setMeta', patch: { author: e.target.value } })}
            onBlur={(e) => !e.target.value.trim() && packStore.dispatch({ type: 'setMeta', patch: { author: 'Web Builder' } })}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field
            label={`${loaderName(profile.loader)} loader version`}
            htmlFor="loader-version"
            hint={
              detected.status === 'loading' && loaderOverride === null ? (
                <span className="inline-flex items-center gap-1">
                  <LoaderCircle className="size-3 animate-spin" /> Looking up the latest build…
                </span>
              ) : detected.status === 'missing' && loaderOverride === null ? (
                <span className="text-amber-300">Couldn’t detect the latest build automatically – type it in (e.g. {exampleVersion(profile.loader)}).</span>
              ) : loaderOverride !== null && detected.version && loaderOverride !== detected.version ? (
                <span>
                  Custom build.{' '}
                  <button type="button" className="font-semibold text-accent-300 hover:underline" onClick={() => setLoaderOverride(null)}>
                    Use latest ({detected.version})
                  </button>
                </span>
              ) : (
                `Written to the manifest as the required loader for Minecraft ${profile.gameVersion}.`
              )
            }
          >
            <input
              id="loader-version"
              className={inputClass}
              value={loaderOverride ?? detected.version ?? ''}
              placeholder={exampleVersion(profile.loader)}
              onChange={(e) => setLoaderOverride(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="block text-xs font-semibold uppercase tracking-wide text-base-400">Format</span>
        <Segmented<ExportFormat>
          label="Export format"
          value={format}
          onChange={setFormat}
          className="flex w-full"
          options={[
            {
              value: 'modrinth',
              label: <FormatLabel name=".mrpack" available={plans.modrinth.included.length} total={plans.modrinth.included.length + plans.modrinth.crossPlatform.length} />,
              activeClass: 'bg-emerald-500 text-ink shadow',
            },
            {
              value: 'curseforge',
              label: <FormatLabel name="CurseForge .zip" available={plans.curseforge.included.length} total={plans.curseforge.included.length + plans.curseforge.crossPlatform.length} />,
              activeClass: 'bg-orange-500 text-ink shadow',
            },
          ]}
        />
      </div>

      <div className="space-y-2">
        {plan.crossPlatform.length > 0 && (
          <Callout tone="warning" icon={<CircleAlert className="size-4" />}>
            {pluralize(plan.crossPlatform.length, `${format === 'curseforge' ? 'Modrinth' : 'CurseForge'}-only mod`)} can’t be referenced by a{' '}
            {FORMAT_LABEL[format]}. You’ll be asked how to handle {plan.crossPlatform.length === 1 ? 'it' : 'them'}.
          </Callout>
        )}
        {format === 'curseforge' && profile.loader === 'quilt' && (
          <Callout tone="info" icon={<Info className="size-4" />}>
            Launcher support for Quilt in CurseForge packs varies. A .mrpack is the safer choice for Quilt.
          </Callout>
        )}
        {plan.unavailable.length > 0 && (
          <Callout tone="warning" icon={<CircleAlert className="size-4" />}>
            {pluralize(plan.unavailable.length, 'mod')} without a compatible file will be skipped.
          </Callout>
        )}
        {plan.restricted.length > 0 && (
          <Callout tone="info" icon={<Info className="size-4" />}>
            {pluralize(plan.restricted.length, 'mod')} disallow third-party downloads. The CurseForge app installs them normally; other launchers may ask for a
            manual download.
          </Callout>
        )}
      </div>

      <Button
        variant="primary"
        size="lg"
        loading={exporting}
        disabled={disabled}
        icon={<Download className="size-5" />}
        onClick={() => void runExport(format)}
      >
        {plan.pending.length > 0 ? `Resolving ${plan.pending.length}…` : `Export ${FORMAT_LABEL[format]}`}
      </Button>

      <CrossPlatformDialog
        format={dialogFormat}
        onClose={() => setDialogFormat(null)}
        onExport={(target) => void runExport(target)}
        onOmitAndExport={(target, keys) => void runExport(target, keys)}
        onSwitchFormat={(target) => {
          setFormat(target);
          setDialogFormat(null);
          void runExport(target);
        }}
      />
    </section>
  );
}

function FormatLabel({ name, available, total }: { name: string; available: number; total: number }) {
  return (
    <span className="flex flex-col items-center leading-tight">
      <span>{name}</span>
      <span className="text-[11px] font-medium opacity-75">{total === 0 ? 'no mods yet' : `${available}/${total} mods`}</span>
    </span>
  );
}

function exampleVersion(loader: Loader): string {
  return { fabric: '0.16.14', quilt: '0.29.1', forge: '47.4.0', neoforge: '21.1.172' }[loader];
}
