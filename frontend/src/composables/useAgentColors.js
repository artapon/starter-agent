/**
 * Single source of truth for agent color tokens.
 * Import AGENT_COLORS wherever you need hex values (inline styles, charts, etc.)
 * Import AGENT_STYLES wherever you need full bg/border/accent sets (chat bubbles, cards).
 */

export const AGENT_COLORS = {
  researcher: '#22D3EE',  // cyan  — searching / finding
  planner:    '#818CF8',  // violet — planning / thinking
  worker:     '#34D399',  // emerald — building / coding
  reviewer:   '#F59E0B',  // amber  — reviewing / evaluating
};

export const AGENT_STYLES = {
  researcher: {
    color:  '#22D3EE',
    bg:     'rgba(34,211,238,0.08)',
    border: 'rgba(34,211,238,0.2)',
    accent: '#67E8F9',
    icon:   'mdi-magnify',
  },
  planner: {
    color:  '#818CF8',
    bg:     'rgba(129,140,248,0.08)',
    border: 'rgba(129,140,248,0.2)',
    accent: '#A5B4FC',
    icon:   'mdi-sitemap-outline',
  },
  worker: {
    color:  '#34D399',
    bg:     'rgba(52,211,153,0.08)',
    border: 'rgba(52,211,153,0.2)',
    accent: '#6EE7B7',
    icon:   'mdi-code-braces',
  },
  reviewer: {
    color:  '#F59E0B',
    bg:     'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.2)',
    accent: '#FDE68A',
    icon:   'mdi-check-decagram-outline',
  },
  workflow: {
    color:  '#A78BFA',
    bg:     'rgba(167,139,250,0.1)',
    border: 'rgba(167,139,250,0.25)',
    accent: '#C4B5FD',
    icon:   'mdi-graph-outline',
  },
  system: {
    color:  '#EF4444',
    bg:     'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.2)',
    accent: '#FCA5A5',
    icon:   'mdi-alert-circle-outline',
  },
};

const DEFAULT_STYLE = {
  color:  '#A78BFA',
  bg:     'rgba(167,139,250,0.1)',
  border: 'rgba(167,139,250,0.25)',
  accent: '#C4B5FD',
  icon:   'mdi-robot-outline',
};

/** Get full style object for an agent, falling back to default. */
export function agentStyle(id)  { return AGENT_STYLES[id] || DEFAULT_STYLE; }
/** Get primary hex color for an agent. */
export function agentColor(id)  { return AGENT_COLORS[id] || '#A78BFA'; }
/** Get Vuetify color name for agent chips (maps to theme). */
export function agentChipColor(id) {
  return { researcher: 'secondary', planner: 'accent', worker: 'success', reviewer: 'warning' }[id] || 'default';
}
