---
title: Nostr Login Security
---

This page explains how login works on this site, in plain language.

## Quick Summary

- Your account is identified by exactly one **Nostr public key** (`P_user`).
- There is no email/password login and no recovery reset flow.
- If control of `P_user` is lost, account access is lost by design.
- This site never asks for your private key (`nsec`).

## Login Methods

You can sign in using:

1. **Login with Nostr**: NIP-07 extension flow (desktop default when available).
2. **Use phone signer (QR)**: NIP-46 pairing with `nostrconnect://` deep link/QR.
3. **Paste signed login**: manual fallback with pasted signed auth event JSON.

Recommended signer apps:
- Desktop: [nos2x-fox](https://addons.mozilla.org/en-US/firefox/addon/nos2x-fox/)
- Mobile: [Amethyst](https://play.google.com/store/apps/details?id=com.vitorpamplona.amethyst)

## Challenge Rules

Every login requires a server-issued challenge that is:

- Single-use
- Short-lived (about 2 minutes)
- Bound to this domain
- Verified against signed event time

## Safety Notes

- Never paste private key material (`nsec`) into any form.
- Sign only events that include this site domain/origin and expected action tags.
- Use the challenge expiry as a hard limit.

## Device Approval (Delegation)

You can choose:

- **One-time login**: no delegated device key.
- **Approve this device for N days**: creates a local session keypair (`P_sess/S_sess`) in your browser, default 30 days (range 1-90).

Delegation is signed by your account key (`P_user`) and includes domain + expiry.  
During the delegation window, the browser can authenticate with `S_sess` without repeated prompts.

If you enable **Require direct signer approval for sensitive actions**, delegated sessions are not accepted for mutating admin actions, and a direct signer flow is required.

## Logout and Revocation

- **Logout** clears local session key material and invalidates the server session.
- **Log out everywhere** requires a fresh signature from `P_user` and revokes all active device delegations.
