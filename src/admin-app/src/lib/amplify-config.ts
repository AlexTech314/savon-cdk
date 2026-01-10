import { Amplify } from 'aws-amplify';

// Cognito and API configuration
// Values come from environment variables (set after CDK deployment)
const config = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
      loginWith: {
        oauth: {
          domain: import.meta.env.VITE_COGNITO_DOMAIN || 'auth-alpha.savondesigns.com',
          scopes: ['openid', 'email'],
          redirectSignIn: [
            import.meta.env.VITE_REDIRECT_SIGN_IN || 'http://localhost:5173/callback',
          ],
          redirectSignOut: [
            import.meta.env.VITE_REDIRECT_SIGN_OUT || 'http://localhost:5173/',
          ],
          responseType: 'code' as const,
        },
      },
    },
  },
};

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api-alpha.savondesigns.com';

export function configureAmplify() {
  Amplify.configure(config);
}

export default config;
