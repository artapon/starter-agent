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
          primary: '#7C4DFF',
          secondary: '#00BCD4',
          accent: '#FF4081',
          success: '#4CAF50',
          warning: '#FF9800',
          error: '#F44336',
          info: '#2196F3',
          background: '#0A0A0F',
          surface: '#12121A',
          'surface-variant': '#1E1E2E',
        },
      },
    },
  },
  defaults: {
    VCard: { elevation: 2 },
    VBtn: { variant: 'elevated' },
  },
});
