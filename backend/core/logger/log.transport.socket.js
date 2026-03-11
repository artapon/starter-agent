import Transport from 'winston-transport';

export class SocketTransport extends Transport {
  constructor(socketManager, opts = {}) {
    super(opts);
    this.socketManager = socketManager;
    this.name = 'SocketTransport';
    this.setMaxListeners(50);
  }

  log(info, callback) {
    setImmediate(() => this.emit('logged', info));
    try {
      this.socketManager.emitLog(info);
    } catch (_) {
      // Never let transport errors crash the app
    }
    callback();
  }
}
