import { extendTheme, type ThemeConfig } from '@chakra-ui/react';

const config: ThemeConfig = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
};

const theme = extendTheme({
  config,
  colors: {
    brand: {
      50: '#c1b0e8',
      100: '#b19ee2',
      200: '#a08bdc',
      300: '#9079d6',
      400: '#7e67cf',
      500: '#6c55c9',
      600: '#5a44b0',
      700: '#483697',
      800: '#36287e',
      900: '#241a65',
    },
    accent: {
      green: '#47d5a6',
      highlight: '#d7ac61',
    },
    card: {
      red: '#d94a4a',
      black: '#121212',
      back: '#6c55c9',
      selected: '#d7ac61',
    },
    table: {
      felt: '#1b1922',
      border: '#302e37',
    },
    surface: {
      a0: '#121212',
      a10: '#282828',
      a20: '#3f3f3f',
      a30: '#575757',
      a40: '#717171',
      a50: '#8b8b8b',
      tonal0: '#1b1922',
      tonal10: '#302e37',
      tonal20: '#46444d',
      tonal30: '#5e5c64',
      tonal40: '#77757c',
      tonal50: '#908f94',
    },
    success: {
      a0: '#22946e',
      a10: '#47d5a6',
      a20: '#9ae8ce',
    },
    warning: {
      a0: '#a87a2a',
      a10: '#d7ac61',
      a20: '#ecd7b2',
    },
    danger: {
      a0: '#9c2121',
      a10: '#d94a4a',
      a20: '#eb9e9e',
    },
    info: {
      a0: '#21498a',
      a10: '#4077d1',
      a20: '#92b2e5',
    },
  },
  fonts: {
    heading: `'Inter', system-ui, sans-serif`,
    body: `'Inter', system-ui, sans-serif`,
  },
  styles: {
    global: {
      body: {
        bg: '#1b1922',
        color: 'gray.100',
      },
    },
  },
});

export default theme;
