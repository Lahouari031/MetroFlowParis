/// <reference lib="webworker" />
/** Point d'entrée du Web Worker : le moteur tourne ici, hors du fil d'affichage. */
import { SimCore } from './simCore';
import type { ToCore } from './simProtocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const core = new SimCore((msg) => scope.postMessage(msg));
scope.onmessage = (e: MessageEvent<ToCore>) => core.handle(e.data);
