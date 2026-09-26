/**
 * Root ESLint Configuration: Boundary Enforcement
 * Strictly enforces dependency isolation between microservices and frontend.
 * Allows importing shared contracts from packages/shared-types.
 */

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // Prevent cross-boundary file imports between microservices
    'import/no-restricted-paths': [
      'error',
      {
        zones: [
          // 1. Disallow order-management from importing from auth-rbac or frontend
          {
            target: './services/order-management',
            from: './services/auth-rbac',
            message: '❌ Boundary Violation: services/order-management cannot directly import from services/auth-rbac. Use API calls or @waypoint/shared-types.',
          },
          {
            target: './services/order-management',
            from: './frontend',
            message: '❌ Boundary Violation: Backend services cannot import frontend components.',
          },

          // 2. Disallow auth-rbac from importing from other services or frontend
          {
            target: './services/auth-rbac',
            from: './services/order-management',
            message: '❌ Boundary Violation: services/auth-rbac cannot directly import from services/order-management.',
          },
          {
            target: './services/auth-rbac',
            from: './frontend',
            message: '❌ Boundary Violation: Backend services cannot import frontend components.',
          },

          // 3. Generic protection: any service in services/* importing another service or frontend
          {
            target: './services/planning-allocation',
            from: './services/auth-rbac',
            message: '❌ Boundary Violation: Microservices must remain isolated.',
          },
          {
            target: './services/fleet-directory',
            from: './services/auth-rbac',
            message: '❌ Boundary Violation: Microservices must remain isolated.',
          }
        ],
      },
    ],

    // Global pattern restriction against relative cross-service imports
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['../*/services/*', '../services/*', '../../services/*'],
            message: '❌ Cross-service relative imports are strictly prohibited. Use @waypoint/shared-types for shared contracts or HTTP calls.',
          },
        ],
      },
    ],
  },
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
      },
    },
  },
};
