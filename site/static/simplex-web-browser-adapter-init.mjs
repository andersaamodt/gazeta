// SPDX-License-Identifier: AGPL-3.0-only
//
// Browser-native simplex-web bootstrap for Secure Chat.
//
// This module deliberately registers only the first-party browser-native
// simplex-web adapter. It does not load the removed SimpleX Chat command API
// adapter, and it does not route plaintext through a server bridge. Sites must
// configure browser-compatible SMP/XFTP endpoints before the facade becomes
// available.

import { createSimplexWebTransportAdapter } from './browser-simplex-web-transport-adapter.mjs?v=20260516-browserprofilev2';
import { encodeBase64Url, parseSimplexConnectionLink } from './browser-smp-core.mjs';

const STORAGE_KEYS = {
  namespace: 'simplexWebNamespace',
  defaultContactId: 'simplexWebDefaultContactId',
  smpUrl: 'simplexWebSmpUrl',
  smpKeyHash: 'simplexWebSmpKeyHash',
  xftpUrl: 'simplexWebXftpUrl',
  xftpKeyHash: 'simplexWebXftpKeyHash'
};

function storageText(key) {
  try {
    return String(globalThis.localStorage && globalThis.localStorage.getItem(key) || '').trim();
  } catch (_error) {
    return '';
  }
}

function sameOriginSmpRelayUrl(server = {}) {
  try {
    const location = globalThis.location;
    if (!location || !location.host) return '';
    const url = new URL((location.protocol === 'http:' ? 'ws://' : 'wss://') + location.host + '/simplex/smp');
    const host = String(server.host || server.nativeHost || '').trim();
    const port = String(server.port || server.nativePort || '').trim();
    if (host) url.searchParams.set('host', host);
    if (port) url.searchParams.set('port', port);
    return url.toString();
  } catch (_error) {
    return '';
  }
}

function contactLinkSmpProfile(contactLink) {
  const text = String(contactLink || '').trim();
  if (!text) return null;
  try {
    const parsed = parseSimplexConnectionLink(text);
    const queue = parsed && parsed.smpQueues && parsed.smpQueues[0];
    const server = queue && queue.server;
    if (!server || !server.keyHash) return null;
    return {
      url: sameOriginSmpRelayUrl(server),
      keyHash: encodeBase64Url(server.keyHash),
      server,
      host: String(server.host || '').trim(),
      port: String(server.port || '').trim()
    };
  } catch (_error) {
    return null;
  }
}

function configuredOptions(overrides = {}) {
  const contactProfile = contactLinkSmpProfile(overrides.contactLink || overrides.contact_link || overrides.ownerContactLink || overrides.owner_contact_link);
  const profile = overrides.profile && typeof overrides.profile === 'object' ? overrides.profile : {};
  const smpUrl = String(overrides.smpWebSocketUrl || overrides.smp_url || (overrides.smp && overrides.smp.url) || storageText(STORAGE_KEYS.smpUrl) || (contactProfile && contactProfile.url) || '').trim();
  const smpKeyHash = String(overrides.smpKeyHash || overrides.smp_key_hash || (overrides.smp && overrides.smp.keyHash) || storageText(STORAGE_KEYS.smpKeyHash) || (contactProfile && contactProfile.keyHash) || '').trim();
  const xftpUrl = String(overrides.xftpWebUrl || overrides.xftp_web_url || (overrides.xftp && overrides.xftp.url) || storageText(STORAGE_KEYS.xftpUrl)).trim();
  const xftpKeyHash = String(overrides.xftpKeyHash || overrides.xftp_key_hash || (overrides.xftp && overrides.xftp.keyHash) || storageText(STORAGE_KEYS.xftpKeyHash)).trim();
  const smpWebSocketUrlForServer = (server) => sameOriginSmpRelayUrl(server);
  return {
    namespace: String(overrides.namespace || storageText(STORAGE_KEYS.namespace) || 'nostr-blog-secure-chat').trim(),
    defaultContactId: String(overrides.defaultContactId || overrides.default_contact_id || storageText(STORAGE_KEYS.defaultContactId) || 'secure-chat-owner').trim(),
    smp: smpUrl && smpKeyHash ? { url: smpUrl, keyHash: smpKeyHash, server: contactProfile && contactProfile.server || null, nativeHost: contactProfile && contactProfile.host || '', nativePort: contactProfile && contactProfile.port || '' } : null,
    smpServer: contactProfile && contactProfile.server || null,
    xftp: xftpUrl && xftpKeyHash ? { url: xftpUrl, keyHash: xftpKeyHash } : null,
    profile,
    smpWebSocketUrlForServer
  };
}

export function registerConfiguredSimplexWebTransport(overrides = {}) {
  const facade = globalThis.SimplexWebTransport;
  if (!facade || typeof facade.registerBrowserTransport !== 'function') {
    return { registered: false, reason: 'facade-unavailable' };
  }
  const options = configuredOptions(overrides);
  if (!options.smp) {
    return { registered: false, reason: 'smp-not-configured' };
  }
  const adapter = createSimplexWebTransportAdapter({
    namespace: options.namespace,
    defaultContactId: options.defaultContactId,
    smp: options.smp,
    smpServer: options.smpServer,
    xftp: options.xftp || undefined,
    profile: options.profile || {},
    smpWebSocketUrlForServer: options.smpWebSocketUrlForServer
  });
  const transport = facade.registerBrowserTransport(adapter);
  globalThis.SimplexWebBrowserAdapter = {
    adapter,
    options,
    registerConfiguredSimplexWebTransport
  };
  return { registered: true, transport, adapter, options };
}

globalThis.SimplexWebBrowserAdapter = {
  registerConfiguredSimplexWebTransport
};

registerConfiguredSimplexWebTransport();
