import { extendTheme, type ThemeConfig } from '@chakra-ui/react';

const config: ThemeConfig = {
  initialColorMode: 'dark',
  useSystemColorMode: false,
};

const theme = extendTheme({
  config,
  colors: {
    // Legacy tokens kept for backward compat with existing components
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
      red: '#c0392b',
      black: '#121212',
      back: '#2a2a4a',
      backBorder: '#3a3a5a',
      selected: '#c9a227',
    },
    // New reskin tokens
    base: { bg: '#0f0f14', bgAlt: '#0f0f16' },
    surface: {
      primary: '#13131a',
      secondary: '#1c1c26',
      modal: '#1c1c28',
      tertiary: '#16162a',
      tableFelt: '#13191a',
      tableCenter: '#0d0d12',
      // Legacy
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
    border: { default: '#2a2a3a', felt: '#1a2a22' },
    gold: { default: '#c9a227', bg: '#1f1a0a', dim: '#c9a22740' },
    purple: { default: '#7a7aee' },
    timer: { green: '#4ecb4e', amber: '#c9a227', red: '#cf5e5e' },
    burn: { red: '#cf5e5e', redDim: '#cf5e5e40', bg: '#2a1a1a' },
    swap: { blue: '#5eb8cf', blueDim: '#5eb8cf40', bg: '#0a1a1f' },
    btn: { green: '#4a8a5a', greenHover: '#3a7a4a', secondary: '#1c1c2e' },
    danger: { border: '#5a2a2a', text: '#cf7070' },
    // Legacy semantic tokens
    table: {
      felt: '#0f0f14',
      border: '#1c1c28',
    },
    success: {
      a0: '#22946e',
      a10: '#5ecf5e',
      a20: '#9ae8ce',
    },
    warning: {
      a0: '#a87a2a',
      a10: '#c9a227',
      a20: '#ecd7b2',
    },
    dangerLegacy: {
      a0: '#9c2121',
      a10: '#cf5e5e',
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
        bg: '#0f0f14',
        color: '#eee',
      },
    },
  },
});

export default theme;
