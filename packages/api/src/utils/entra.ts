import { generators, Issuer } from 'openid-client';

import * as config from '@/config';

import logger from './logger';

let _clientPromise: Promise<import('openid-client').Client> | null = null;

function getEntraClient() {
  if (!config.IS_ENTRA_ENABLED) {
    throw new Error('Entra ID SSO is not configured');
  }

  if (!_clientPromise) {
    _clientPromise = Issuer.discover(
      `https://login.microsoftonline.com/${config.ENTRA_TENANT_ID}/v2.0`,
    )
      .then(issuer => {
        return new issuer.Client({
          client_id: config.ENTRA_CLIENT_ID,
          client_secret: config.ENTRA_CLIENT_SECRET,
          redirect_uris: [config.ENTRA_REDIRECT_URI],
          response_types: ['code'],
        });
      })
      .catch(err => {
        // Reset so the next call retries discovery
        _clientPromise = null;
        logger.error({ err }, 'Failed to discover Entra ID OIDC configuration');
        throw err;
      });
  }

  return _clientPromise;
}

export function generateEntraState() {
  return generators.state();
}

export function generateEntraNonce() {
  return generators.nonce();
}

export async function getEntraAuthorizationUrl(
  state: string,
  nonce: string,
): Promise<string> {
  const client = await getEntraClient();
  return client.authorizationUrl({
    scope: 'openid profile email',
    state,
    nonce,
  });
}

export interface EntraUserInfo {
  email: string;
  name: string;
  oid: string; // Entra object ID — stable unique identifier
}

export async function handleEntraCallback(
  currentUrl: string,
  storedState: string,
  storedNonce: string,
): Promise<EntraUserInfo> {
  const client = await getEntraClient();
  const params = client.callbackParams(currentUrl);
  const tokenSet = await client.callback(config.ENTRA_REDIRECT_URI, params, {
    state: storedState,
    nonce: storedNonce,
  });

  const claims = tokenSet.claims();

  const rawEmail = claims.email ?? claims.preferred_username;
  const email = typeof rawEmail === 'string' ? rawEmail : undefined;
  if (!email) {
    throw new Error('Entra ID token is missing email claim');
  }

  const oid = typeof claims.oid === 'string' ? claims.oid : undefined;
  if (!oid) {
    throw new Error('Entra ID token is missing oid claim');
  }

  const displayName = typeof claims.name === 'string' ? claims.name : email;

  return {
    email: email.toLowerCase(),
    name: displayName,
    oid,
  };
}
