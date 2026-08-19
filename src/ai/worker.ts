import { type WorkerRequest, handleWorkerRequest } from './worker-protocol';

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const response = handleWorkerRequest(event.data, Math.random);
  self.postMessage(response);
};
