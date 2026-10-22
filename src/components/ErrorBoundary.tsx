import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

const PREFERENCES_KEY = 'modpacker:preferences:v1';

/**
 * Last line of defence: if rendering crashes, show a friendly recovery screen instead of a blank
 * page, with a way to download a backup of every saved pack before resetting anything.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; backup: () => string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept in the console for bug reports; nothing is sent anywhere.
    // oxlint-disable-next-line no-console
    console.error('Modpacker crashed', error, info.componentStack);
  }

  private downloadBackup = () => {
    const blob = new Blob([this.props.backup()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modpacker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  private resetPreferences = () => {
    try {
      localStorage.removeItem(PREFERENCES_KEY);
    } catch {
      // Storage unavailable – a reload is still worth a try.
    }
    location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 p-6 text-base-100">
        <p className="text-5xl" aria-hidden>
          🧨
        </p>
        <h1 className="text-2xl font-black text-base-50">Well, that wasn’t supposed to happen.</h1>
        <p className="text-base-300">
          Modpacker hit an unexpected error. Your packs are saved in this browser – grab a backup first, then try reloading. If it keeps happening,
          resetting your display settings usually helps.
        </p>
        <pre className="max-h-32 overflow-auto rounded-lg bg-base-900 p-3 text-xs text-rose-300 ring-1 ring-base-800">{error.message}</pre>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={this.downloadBackup} className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-bold text-on-accent">
            Download backup
          </button>
          <button type="button" onClick={() => location.reload()} className="rounded-lg bg-base-800 px-4 py-2 text-sm font-semibold ring-1 ring-base-700">
            Reload
          </button>
          <button type="button" onClick={this.resetPreferences} className="rounded-lg px-4 py-2 text-sm font-semibold text-base-300 hover:bg-base-800">
            Reset display settings
          </button>
        </div>
      </main>
    );
  }
}
