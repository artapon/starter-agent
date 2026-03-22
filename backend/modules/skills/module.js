import skillsRouter from './routes/skills.routes.js';

let _router = null;
export default {
  get router() {
    if (!_router) _router = skillsRouter;
    return _router;
  },
};
