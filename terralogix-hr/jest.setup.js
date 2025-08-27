import 'react-native-gesture-handler/jestSetup';

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///test-cache-dir/',
  downloadAsync: jest.fn(() => Promise.resolve({ status: 200 })),
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn(),
}));