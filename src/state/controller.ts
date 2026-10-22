import { toast } from '../components/ui/Toasts';
import { createPackController, liveApi } from './packController';
import { packStore } from './packStore';

/** App-wide controller wired to the live Modrinth/CurseForge APIs and the toast system. */
export const packController = createPackController(packStore, liveApi, (kind, message) => toast(kind, message));
