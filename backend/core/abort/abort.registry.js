// Abort registry — keyed by runId, manages AbortControllers for cancelling running workflows/agents
const _controllers = new Map();

export function createAbortController(id) {
  const controller = new AbortController();
  _controllers.set(id, controller);
  return controller;
}

export function getAbortSignal(id) {
  return _controllers.get(id)?.signal;
}

export function abortById(id) {
  const ctrl = _controllers.get(id);
  if (ctrl) {
    ctrl.abort();
    _controllers.delete(id);
    return true;
  }
  return false;
}

export function clearAbortController(id) {
  _controllers.delete(id);
}
