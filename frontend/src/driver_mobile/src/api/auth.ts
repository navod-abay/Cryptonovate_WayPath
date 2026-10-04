import AsyncStorage from '@react-native-async-storage/async-storage';

/** Where the login flow should store the auth-rbac access token once it calls the API. */
export const ACCESS_TOKEN_KEY = '@auth_access_token';

/**
 * Local testing only, until login is wired up: paste a driver access token here.
 * Leave empty in commits; reports stay queued (and are retried) while there is no token.
 */
const DEV_ACCESS_TOKEN = '';

export const getAccessToken = async (): Promise<string | null> => {
  try {
    return (await AsyncStorage.getItem(ACCESS_TOKEN_KEY)) || DEV_ACCESS_TOKEN || null;
  } catch {
    return DEV_ACCESS_TOKEN || null;
  }
};
