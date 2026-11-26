import { Cadical, createModule } from 'cadical-wasm';
import wasmUrl from 'cadical-wasm/cadical.wasm?url&no-inline';
import { solveBoard, type SolveBoardRequest, type SolveResult } from './solver';

self.onmessage = async (event: MessageEvent<SolveBoardRequest>) => {
  let solver: Cadical | undefined;
  let result: SolveResult;
  try {
    // Resolve the emitted asset against this worker so relative Pages builds work.
    const module = await createModule({ locateFile: () => new URL(wasmUrl, import.meta.url).href });
    solver = new Cadical(module, { phase: false });
    result = solveBoard(event.data, solver);
  } catch {
    result = { status: 'unavailable' };
  } finally {
    solver?.dispose();
  }
  self.postMessage(result);
};
