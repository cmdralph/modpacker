import { ArrowLeftRight, Ban, CircleCheck, Search, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { isCurseForgeConfigured } from '../../api/curseforgeConfig';
import { errorMessage } from '../../api/http';
import { otherFormat, planExport } from '../../export/plan';
import { pluralize } from '../../lib/format';
import { packController } from '../../state/controller';
import { packStore } from '../../state/packStore';
import { settingsStore } from '../../state/settings';
import { useStore } from '../../state/store';
import type { ExportFormat } from '../../types';
import { Modal } from '../ui/Modal';
import { Button, Callout, ModIcon, SourceBadge } from '../ui/primitives';
import { toast } from '../ui/Toasts';

export const FORMAT_LABEL: Record<ExportFormat, string> = {
  curseforge: 'CurseForge .zip',
  modrinth: 'Modrinth .mrpack',
};

interface CrossPlatformDialogProps {
  format: ExportFormat | null;
  onClose: () => void;
  onSwitchFormat: (format: ExportFormat) => void;
  onOmitAndExport: (format: ExportFormat, omitKeys: string[]) => void;
  onExport: (format: ExportFormat) => void;
}

/**
 * Shown when the chosen export format cannot reference some mods – e.g. Modrinth-only mods
 * in a CurseForge manifest. Lets the user switch format, look for identical files on the
 * other platform, or omit the affected mods.
 */
export function CrossPlatformDialog({ format, onClose, onSwitchFormat, onOmitAndExport, onExport }: CrossPlatformDialogProps) {
  const state = useStore(packStore, (s) => s);
  useStore(settingsStore, (s) => s); // re-render when CurseForge access changes
  const [matching, setMatching] = useState<{ done: number; total: number } | null>(null);
  const [lastSearchFound, setLastSearchFound] = useState<number | null>(null);

  if (!format) return null;

  const plan = planExport(state, format, new Set());
  const alternative = otherFormat(format);
  const alternativePlan = planExport(state, alternative, new Set());
  const toCurseForge = format === 'curseforge';
  const sourceName = toCurseForge ? 'Modrinth' : 'CurseForge';
  const canSearch = toCurseForge ? isCurseForgeConfigured() : true;

  async function findMatches() {
    const keys = plan.crossPlatform.map((m) => m.key);
    setLastSearchFound(null);
    setMatching({ done: 0, total: keys.length });
    try {
      const found = toCurseForge
        ? await packController.findCurseForgeMatches(keys, (done, total) => setMatching({ done, total }))
        : await packController.findModrinthMatches(keys);
      setLastSearchFound(found);
    } catch (error) {
      toast('error', `Match search failed: ${errorMessage(error)}`);
    } finally {
      setMatching(null);
    }
  }

  const resolvedAll = plan.crossPlatform.length === 0;

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      icon={resolvedAll ? <CircleCheck className="size-6 text-accent-400" /> : <TriangleAlert className="size-6 text-amber-400" />}
      title={resolvedAll ? 'Every mod is now exportable' : `${pluralize(plan.crossPlatform.length, `${sourceName}-only mod`)} can’t go in a ${FORMAT_LABEL[format]}`}
      description={
        resolvedAll
          ? `Identical files were found for all ${sourceName} mods, so the ${FORMAT_LABEL[format]} will include them.`
          : toCurseForge
            ? 'CurseForge ignores Modrinth IDs. A CurseForge manifest.json can only reference files by their numeric CurseForge projectID and fileID, so these Modrinth mods would silently be missing when the pack is installed.'
            : 'A .mrpack lists every file with its SHA-1/SHA-512 hashes and a download URL on Modrinth’s allowed hosts. These CurseForge mods have no byte-identical copy on Modrinth, so they cannot be listed in modrinth.index.json.'
      }
      footer={
        resolvedAll ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" onClick={() => onExport(format)}>
              Export {FORMAT_LABEL[format]}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<Ban className="size-4" />}
              disabled={plan.included.length === 0 || matching !== null}
              onClick={() => onOmitAndExport(format, plan.crossPlatform.map((m) => m.key))}
            >
              Omit {plan.crossPlatform.length} & export
            </Button>
            <Button variant="primary" icon={<ArrowLeftRight className="size-4" />} disabled={matching !== null} onClick={() => onSwitchFormat(alternative)}>
              Switch to {FORMAT_LABEL[alternative]}
            </Button>
          </>
        )
      }
    >
      {!resolvedAll && (
        <div className="space-y-4">
          <ul className="max-h-60 space-y-2 overflow-y-auto">
            {plan.crossPlatform.map((mod) => (
              <li key={mod.key} className="flex items-center gap-3 rounded-lg bg-base-800/60 p-2">
                <ModIcon src={mod.iconUrl} title={mod.title} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-base-100">{mod.title}</span>
                <SourceBadge source={mod.source} />
              </li>
            ))}
          </ul>

          <Callout tone="info" icon={<ArrowLeftRight className="size-4" />} title={`Switching to ${FORMAT_LABEL[alternative]}`}>
            {alternativePlan.crossPlatform.length === 0
              ? `All ${pluralize(alternativePlan.included.length, 'ready mod')} can be exported in that format.`
              : `${pluralize(alternativePlan.included.length, 'mod')} would be included, but ${pluralize(alternativePlan.crossPlatform.length, 'other mod')} would then need attention.`}
          </Callout>

          <div className="flex flex-col gap-2 rounded-xl bg-base-800/40 p-3 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm text-base-300">
              {toCurseForge
                ? 'Many mods are published on both sites. Check whether CurseForge hosts the byte-identical jar (downloads each jar and compares CurseForge fingerprints).'
                : 'Many mods are published on both sites. Check Modrinth for byte-identical files by SHA-1.'}
              {!canSearch && ' Requires a CurseForge API key or proxy in Settings.'}
            </p>
            <Button
              size="sm"
              icon={<Search className="size-3.5" />}
              loading={matching !== null}
              disabled={!canSearch}
              onClick={() => void findMatches()}
            >
              {matching ? `Checking ${matching.done}/${matching.total}` : `Find on ${toCurseForge ? 'CurseForge' : 'Modrinth'}`}
            </Button>
          </div>
          {lastSearchFound !== null && (
            <p className="text-xs text-base-400" role="status">
              {lastSearchFound === 0 ? 'No identical files were found.' : `Matched ${pluralize(lastSearchFound, 'mod')}.`}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
