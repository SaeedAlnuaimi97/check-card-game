import { extendTheme, type ThemeConfig } from '@chakra-ui/react';

const config: ThemeConfig = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
};

const theme = extendTheme({
  config,
  colors: {
    brand: {
      50: '#e3f0ff',
      100: '#b3d4fc',
      200: '#82b8f8',
      300: '#4C8CE4',
      400: '#4C8CE4',
      500: '#4C8CE4',
      600: '#3a72c0',
      700: '#2a5a9e',
      800: '#1c437c',
      900: '#0e2d5a',
    },
    accent: {
      green: '#91D06C',
      highlight: '#FFF799',
    },
    card: {
      red: '#d32f2f',
      black: '#212121',
      back: '#1565c0',
      selected: '#FFF799',
    },
    table: {
      felt: '#406093',
      border: '#2e4a73',
    },
  },
  fonts: {
    heading: `'Inter', system-ui, sans-serif`,
    body: `'Inter', system-ui, sans-serif`,
  },
  styles: {
    global: {
      body: {
        bg: '#406093',
        color: 'gray.100',
      },
    },
  },
});

export default theme;
