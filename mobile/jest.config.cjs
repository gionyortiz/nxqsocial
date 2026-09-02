module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  clearMocks: true,
};
