import type JSZipType from 'jszip';

/** JSZip is only needed to export or import, so it is fetched on first use instead of at page load. */
export async function loadJSZip(): Promise<typeof JSZipType> {
  const module = await import('jszip');
  return module.default;
}
