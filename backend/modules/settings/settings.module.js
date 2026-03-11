import { SettingsService } from './services/settings.service.js';
import { SettingsController } from './controllers/settings.controller.js';
import { createSettingsRouter } from './routes/settings.routes.js';

let _service = null;

function init(socketManager) {
  _service = new SettingsService(socketManager);
  const controller = new SettingsController(_service);
  return createSettingsRouter(controller);
}

// Lazy init with app-level socketManager
const _router = { _r: null };

export const SettingsModule = {
  get router() {
    if (!_router._r) {
      _router._r = init(null); // socketManager attached later via app.set
    }
    return _router._r;
  },
  get service() { return _service; },
  init(socketManager) {
    _service = new SettingsService(socketManager);
    const controller = new SettingsController(_service);
    _router._r = createSettingsRouter(controller);
  },
};
