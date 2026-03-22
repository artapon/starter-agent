export const SocketEvents = {
  // Server → Client
  AGENT_STATUS_UPDATE:      'agent:status',
  WORKFLOW_NODE_COMPLETE:   'workflow:node_complete',
  WORKFLOW_STARTED:         'workflow:started',
  WORKFLOW_COMPLETE:        'workflow:complete',
  WORKFLOW_ERROR:           'workflow:error',
  CHAT_RESPONSE:            'chat:response',
  CHAT_RESPONSE_CHUNK:      'chat:response_chunk',
  CHAT_AGENT_TYPING:        'chat:typing',
  LOG_ENTRY:                'log:entry',
  MEMORY_UPDATED:           'memory:updated',
  DASHBOARD_STATS:          'dashboard:stats',
  AGENT_CONFIG_UPDATED:     'agent:config_updated',
  WORKSPACE_CHANGED:        'workspace:changed',

  // Client → Server
  CHAT_MESSAGE:             'chat:message',
  WORKFLOW_PAUSE:           'workflow:pause',
  WORKFLOW_RESUME:          'workflow:resume',
  WORKFLOW_STOP:            'workflow:stop',
  CHAT_STOP:                'chat:stop',
  SUBSCRIBE_AGENT:          'subscribe:agent',
  REQUEST_STATS:            'request:stats',

  // Server → Client (stop acks)
  WORKFLOW_STOPPED:         'workflow:stopped',
  CHAT_STOPPED:             'chat:stopped',

  // Worker file actions
  WORKER_ACTION:            'worker:action',

  // Researcher MCP
  RESEARCHER_WEB_SOURCES:   'researcher:web_sources',

  // Job queue
  QUEUE_UPDATED:            'queue:updated',
};
