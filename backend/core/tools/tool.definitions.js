/**
 * Master list of all available tools.
 * Each entry describes the tool's capabilities and default access per agent mode.
 */
export const ALL_TOOLS = [
  {
    name: 'read_file',
    params: '{path}',
    safe: true,
    category: 'filesystem',
    description: 'Read the content of a file by path',
    icon: 'mdi-file-eye',
  },
  {
    name: 'write_file',
    params: '{path, content}',
    safe: false,
    category: 'filesystem',
    description: 'Write or overwrite a file with given content',
    icon: 'mdi-file-edit',
  },
  {
    name: 'replace_in_file',
    params: '{path, search, replace}',
    safe: false,
    category: 'filesystem',
    description: 'Find and replace a string within a file',
    icon: 'mdi-file-replace',
  },
  {
    name: 'bulk_write',
    params: '{files:[{path,content}]}',
    safe: false,
    category: 'filesystem',
    description: 'Write multiple files in a single operation',
    icon: 'mdi-file-multiple',
  },
  {
    name: 'apply_blueprint',
    params: '{content}',
    safe: false,
    category: 'filesystem',
    description: 'Parse and apply a structured blueprint (JSON/YAML) to create files',
    icon: 'mdi-blueprint',
  },
  {
    name: 'list_files',
    params: '{path}',
    safe: true,
    category: 'filesystem',
    description: 'List files and directories at a given path',
    icon: 'mdi-folder-open',
  },
  {
    name: 'create_directory',
    params: '{path}',
    safe: false,
    category: 'filesystem',
    description: 'Create a directory (including nested paths)',
    icon: 'mdi-folder-plus',
  },
  {
    name: 'bulk_read',
    params: '{paths:[]}',
    safe: true,
    category: 'filesystem',
    description: 'Read multiple files and return their contents',
    icon: 'mdi-file-multiple-outline',
  },
  {
    name: 'scaffold_project',
    params: '{type, name}',
    safe: false,
    category: 'scaffold',
    description: 'Scaffold a project from a template (express-api, vue-app, fullstack, fullstack-auth, etc.)',
    icon: 'mdi-rocket-launch',
  },
  {
    name: 'order_fix',
    params: '{instructions}',
    safe: true,
    category: 'workflow',
    description: 'Send a corrective instruction back to the calling agent',
    icon: 'mdi-wrench',
  },
  {
    name: 'request_review',
    params: '{}',
    safe: true,
    category: 'workflow',
    description: 'Signal that the current output should be sent to the reviewer agent',
    icon: 'mdi-eye-check',
  },
];

/** Default tool enablement per agent. */
export const DEFAULT_AGENT_TOOLS = {
  researcher: ['read_file', 'list_files', 'bulk_read'],
  planner:    ['read_file', 'list_files', 'bulk_read', 'order_fix', 'request_review'],
  worker:     ['read_file', 'write_file', 'replace_in_file', 'bulk_write', 'apply_blueprint', 'list_files', 'create_directory', 'bulk_read', 'scaffold_project', 'order_fix', 'request_review'],
  reviewer:   ['read_file', 'bulk_read', 'list_files', 'replace_in_file', 'order_fix'],
};

export function getToolMeta(name) {
  return ALL_TOOLS.find((t) => t.name === name) || null;
}
