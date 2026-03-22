import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import 'vuetify/styles';

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        dark: true,
        colors: {
          primary:           '#6366F1',
          secondary:         '#22D3EE',
          accent:            '#818CF8',
          success:           '#34D399',
          warning:           '#F59E0B',
          error:             '#EF4444',
          info:              '#38BDF8',
          background:        '#08080F',
          surface:           '#0D0D1A',
          'surface-variant': '#12121E',
          'on-surface':      '#E2E8F0',
          'on-background':   '#E2E8F0',
        },
      },
    },
  },
  defaults: {
    VCard:     { elevation: 0 },
    VBtn:      { variant: 'flat' },
    VTextField: { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
    VTextarea:  { variant: 'outlined', density: 'compact' },
    VSelect:    { variant: 'outlined', density: 'compact', hideDetails: 'auto' },
  },
});
