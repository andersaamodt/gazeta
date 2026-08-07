import init, { WebAttachmentHasher, WebGuestSession, WebMediaCryptor, WebRoomSession, newCallId } from "./pkg/yosemite_web.js";

const form = document.querySelector("#chat");
const status = document.querySelector("#status");
const download = document.querySelector("#download");
const keep = document.querySelector("#keep");
const promotion = document.querySelector("#promotion");
const verifyPromotion = document.querySelector("#verify-promotion");
const retireBrowser = document.querySelector("#retire-browser");
const clear = document.querySelector("#clear");
const continuation = document.querySelector("#continue-chat");
const conversation = document.querySelector("#conversation");
const resume = document.querySelector("#resume");
const unlock = document.querySelector("#unlock");
const parameters = new URLSearchParams(location.search);
const descriptorUrl = parameters.get("descriptor");
const roomUrl = parameters.get("room");
const expectedRoomInstance = parameters.get("instance");
const nostrPubkey = String(parameters.get("nostr") || "").trim().toLowerCase();
const recoveryFileName = nostrPubkey && /^[0-9a-f]{64}$/.test(nostrPubkey)
  ? `yosemite-browser-recovery-${nostrPubkey.slice(0, 16)}.bin`
  : "yosemite-browser-recovery.bin";
let encryptedRecovery;
let activeSession;
let recoveryPassphrase;
let recoveryKey;
let recoverySalt;
let history = [];
let promotionInProgress = false;
const incomingAttachments = new Map();
const attachmentChunkBytes = 512 * 1024;
const attachmentLimit = 10 * 1024 * 1024 * 1024;
const callStatus = document.querySelector("#call-status");
const relayInput = document.querySelector("#call-relay");
relayInput.value = new URLSearchParams(location.search).get("relay") || localStorage.getItem("yosemite.call-relay") || "";
let pendingCall;
let peerConnection;
let relaySession;
let signalTimer;
let activeCallSignal;
let activeRoom;
let roomEndpoint;
let roomEpoch;
let roomTimer;
const roomTransforms = [];
let roomDescriptorYaml;
let roomCapability;
let roomRelayCredential;
let roomTurn;

document.querySelector("#voice-call").addEventListener("click", () => startBrowserCall(false));
document.querySelector("#video-call").addEventListener("click", () => startBrowserCall(true));
document.querySelector("#end-call").addEventListener("click", endBrowserCall);
document.querySelector("#join-room").addEventListener("click", joinBrowserRoom);
document.querySelector("#leave-room").addEventListener("click", leaveBrowserRoom);
document.querySelector("#copy-room-invitation").addEventListener("click", copyRoomInvitation);

document.querySelector("#release").textContent = `Release ${document.documentElement.dataset.release || "development"}`;
if (nostrPubkey) {
  document.querySelector("#privacy").textContent = "Signed in with Nostr. Your message is encrypted in this browser; the website gateway cannot read it.";
}
await init();
if (roomUrl) {
  await initializeRoomMode();
} else {
  if (!descriptorUrl) fail("This chat link is incomplete: it has no signed contact descriptor.");
  await initializeRecovery();
}

async function initializeRoomMode() {
  form.hidden = true;
  resume.hidden = true;
  document.querySelector("h1").textContent = "Encrypted Room";
  document.querySelector("#privacy").textContent = "Room media is encrypted in this browser. The gateway and relay cannot decrypt it.";
  document.querySelector("#room-entry").hidden = false;
  const invitation = parameters.get("invite") || "";
  document.querySelector("#room-capability").value = invitation;
  const response = await fetch(roomUrl, { cache: "no-store" });
  requireOk(response, "The signed Room descriptor is unavailable");
  roomDescriptorYaml = await response.text();
  try {
    const probe = new WebRoomSession(
      roomDescriptorYaml,
      Math.floor(Date.now() / 1000),
      invitation ? unhex(invitation) : new Uint8Array()
    );
    document.querySelector("#room-title").textContent = safeDisplay(probe.title);
    const video = document.querySelector("#room-video-enabled");
    video.checked = probe.video;
    video.disabled = !probe.video;
    status.textContent = "Ready to join privately.";
  } catch {
    status.textContent = "Enter this private Room's invitation capability to join.";
  }
}

async function joinBrowserRoom() {
  const button = document.querySelector("#join-room");
  button.disabled = true;
  try {
    if (!supportsPrivateCalling()) {
      throw new Error("This browser cannot apply encoded-frame encryption, so private Room calling is unavailable.");
    }
    const invitation = document.querySelector("#room-capability").value.trim();
    roomCapability = invitation ? unhex(invitation) : new Uint8Array();
    activeRoom = new WebRoomSession(
      roomDescriptorYaml,
      Math.floor(Date.now() / 1000),
      roomCapability
    );
    document.querySelector("#room-title").textContent = safeDisplay(activeRoom.title);
    roomEndpoint = `${activeRoom.gatewayUrl.replace(/\/$/, "")}/rooms/${hex(activeRoom.descriptorId)}`;
    const video = activeRoom.video && document.querySelector("#room-video-enabled").checked;
    status.textContent = "Requesting media access…";
    const stream = await navigator.mediaDevices.getUserMedia({ audio: activeRoom.audio, video });
    pendingCall = { stream, video };

    let response = await fetch(`${roomEndpoint}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: roomCapability,
      cache: "no-store"
    });
    if (response.status === 404) {
      if (expectedRoomInstance) {
        throw new Error("This live Room invitation has expired. Ask for a current invitation.");
      }
      status.textContent = "Creating a fresh encrypted Room instance…";
      const instance = newCallId();
      const allocationResponse = await fetch(`${activeRoom.relayUrl.replace(/\/$/, "")}/v1/admissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId: hex(instance),
          expiresAtUnixSeconds: Math.floor(Date.now() / 1000) + 6 * 60 * 60,
          participants: 1
        })
      });
      requireOk(allocationResponse, "The selected relay refused Room admission");
      const allocation = await allocationResponse.json();
      if (!Array.isArray(allocation.credentials)
          || allocation.credentials.length !== 1
          || !allocation.mediaAddress) {
        throw new Error("The relay returned invalid Room credentials.");
      }
      const credentials = Uint8Array.from(allocation.credentials.flatMap(value => [...unhex(value)]));
      const bootstrap = activeRoom.beginRoom(instance, allocation.mediaAddress, credentials);
      response = await fetch(`${roomEndpoint}/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: bootstrap
      });
      requireOk(response, "The gateway could not instantiate this Room");
      roomEpoch = activeRoom.finishBootstrap(new Uint8Array(await response.arrayBuffer()));
      roomRelayCredential = roomEpoch.relayCredential;
      roomTurn = turnFromAllocation(allocation, 0);
    } else {
      requireOk(response, "The gateway could not admit this Room participant");
      const admission = new Uint8Array(await response.arrayBuffer());
      const joining = activeRoom.joinRoom(admission);
      const candidate = joining.candidate;
      roomEpoch = joining.takeEpoch();
      if (expectedRoomInstance && hex(roomEpoch.instanceId) !== expectedRoomInstance.toLowerCase()) {
        throw new Error("This invitation names an old Room instance. Ask for a current invitation.");
      }
      const relayAdmission = await fetch(`${activeRoom.relayUrl.replace(/\/$/, "")}/v1/admissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId: hex(roomEpoch.instanceId),
          expiresAtUnixSeconds: Math.floor(Date.now() / 1000) + 6 * 60 * 60,
          participants: 1
        })
      });
      requireOk(relayAdmission, "The Room relay refused this participant");
      const relayAllocation = await relayAdmission.json();
      if (!Array.isArray(relayAllocation.credentials)
          || relayAllocation.credentials.length !== 1
          || relayAllocation.mediaAddress !== roomEpoch.mediaAddress) {
        throw new Error("The Room relay returned an invalid credential.");
      }
      roomRelayCredential = unhex(relayAllocation.credentials[0]);
      roomTurn = turnFromAllocation(relayAllocation, 0);
      const committed = await fetch(`${roomEndpoint}/commit`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${hex(roomEpoch.session)}`,
          "Content-Type": "application/octet-stream"
        },
        body: candidate
      });
      requireOk(committed, "Another participant changed the Room; please join again");
    }
    await connectRoomMedia(roomEpoch);
    document.querySelector("#join-room").hidden = true;
    document.querySelector("#leave-room").hidden = false;
    document.querySelector("#call-video").hidden = !video;
    showRoomInvitation(roomEpoch.instanceId);
    status.textContent = "Encrypted Room connected.";
    scheduleRoomPoll();
  } catch (error) {
    if (roomEndpoint && roomEpoch) {
      await fetch(`${roomEndpoint}/events`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${hex(roomEpoch.session)}` }
      }).catch(() => {});
    }
    pendingCall?.stream.getTracks().forEach(track => track.stop());
    pendingCall = undefined;
    activeRoom = undefined;
    roomEpoch = undefined;
    roomRelayCredential = undefined;
    roomTurn = undefined;
    status.dataset.error = "true";
    status.textContent = error?.name === "NotFoundError"
      ? "No microphone or camera was found on this device."
      : error instanceof Error ? error.message : String(error);
    button.disabled = false;
  }
}

async function connectRoomMedia(epoch) {
  const remoteKeys = epoch.remoteKeys;
  const ready = {
    relay: activeRoom.relayUrl,
    relayCredential: roomRelayCredential,
    callId: epoch.instanceId,
    cryptographicInstance: epoch.instanceId,
    localDevice: epoch.localDevice,
    localKey: epoch.localKey,
    remoteDevice: remoteKeys.length >= 48 ? remoteKeys.slice(0, 32) : new Uint8Array(),
    remoteKey: remoteKeys.length >= 48 ? remoteKeys.slice(32, 48) : new Uint8Array(),
    remoteKeys,
    turnUrl: roomTurn?.url || "",
    turnUsername: roomTurn?.username || "",
    turnCredential: roomTurn?.credential || ""
  };
  await connectBrowserMedia(ready, true);
}

function scheduleRoomPoll() {
  clearTimeout(roomTimer);
  roomTimer = setTimeout(pollRoomEvents, 1000);
}

async function pollRoomEvents() {
  if (!activeRoom || !roomEpoch) return;
  try {
    const response = await fetch(`${roomEndpoint}/events`, {
      headers: { "Authorization": `Bearer ${hex(roomEpoch.session)}` },
      cache: "no-store"
    });
    requireOk(response, "Room membership updates are unavailable");
    const epoch = activeRoom.applyEvents(new Uint8Array(await response.arrayBuffer()));
    if (epoch) {
      roomEpoch = epoch;
      replaceRoomCryptors(epoch);
    }
  } catch (error) {
    status.dataset.error = "true";
    status.textContent = error instanceof Error ? error.message : String(error);
    await leaveBrowserRoom();
    return;
  }
  scheduleRoomPoll();
}

function roomCryptorOptions(epoch, direction, kind) {
  const remoteKeys = epoch.remoteKeys;
  return {
    direction,
    kind,
    callId: epoch.instanceId,
    cryptographicInstance: epoch.instanceId,
    localDevice: epoch.localDevice,
    localKey: epoch.localKey,
    remoteDevice: remoteKeys.length >= 48 ? remoteKeys.slice(0, 32) : new Uint8Array(),
    remoteKey: remoteKeys.length >= 48 ? remoteKeys.slice(32, 48) : new Uint8Array(),
    remoteKeys
  };
}

function replaceRoomCryptors(epoch) {
  for (const transform of roomTransforms) {
    const options = roomCryptorOptions(epoch, transform.direction, transform.kind);
    if (transform.worker) transform.worker.postMessage(options);
    if (transform.holder) transform.holder.cryptor = createRoomCryptor(options);
  }
}

async function leaveBrowserRoom() {
  clearTimeout(roomTimer);
  if (activeRoom && roomEpoch && roomEndpoint) {
    await fetch(`${roomEndpoint}/events`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${hex(roomEpoch.session)}` }
    }).catch(() => {});
  }
  activeRoom = undefined;
  roomEpoch = undefined;
  roomRelayCredential = undefined;
  roomTurn = undefined;
  roomTransforms.splice(0);
  await endBrowserCall();
  document.querySelector("#join-room").hidden = false;
  document.querySelector("#join-room").disabled = false;
  document.querySelector("#leave-room").hidden = true;
  document.querySelector("#room-invitation").hidden = true;
}

function showRoomInvitation(instanceId) {
  const invitation = new URL(location.href);
  invitation.search = "";
  invitation.searchParams.set("room", roomUrl);
  if (roomCapability?.length) invitation.searchParams.set("invite", hex(roomCapability));
  invitation.searchParams.set("instance", hex(instanceId));
  document.querySelector("#room-invitation-link").value = invitation.href;
  document.querySelector("#room-invitation").hidden = false;
}

async function copyRoomInvitation() {
  const input = document.querySelector("#room-invitation-link");
  try {
    await navigator.clipboard.writeText(input.value);
    status.textContent = "Live Room invitation copied.";
  } catch {
    input.select();
    status.textContent = "Copy the selected live Room invitation.";
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  status.removeAttribute("data-error");
  status.textContent = "Creating your encrypted conversation…";
  try {
    await init();
    const descriptorResponse = await fetch(descriptorUrl, { cache: "no-store" });
    requireOk(descriptorResponse, "The signed contact information is unavailable");
    const descriptor = new Uint8Array(await descriptorResponse.arrayBuffer());
    const packageResponse = await fetch(`${descriptorUrl.replace(/\/$/, "")}/key-package`, { method: "POST", cache: "no-store" });
    requireOk(packageResponse, "No fresh encryption key is currently available");
    const keyPackage = new Uint8Array(await packageResponse.arrayBuffer());
    const gatewayOrigin = new URL(descriptorUrl).origin;
    const queueResponse = await fetch(`${gatewayOrigin}/v1/queues`, { method: "POST", cache: "no-store" });
    requireOk(queueResponse, "A private reply queue could not be created");
    const queue = new Uint8Array(await queueResponse.arrayBuffer());
    if (queue.length !== 64) throw new Error("The gateway returned an invalid reply queue");
    const guestQueueResponse = await fetch(`${gatewayOrigin}/v1/queues`, { method: "POST", cache: "no-store" });
    requireOk(guestQueueResponse, "A private continuation queue could not be created");
    const guestQueue = new Uint8Array(await guestQueueResponse.arrayBuffer());
    if (guestQueue.length !== 64) throw new Error("The gateway returned an invalid continuation queue");
    const writtenMessage = document.querySelector("#message").value;
    const firstMessage = nostrPubkey ? `[Nostr ${nostrPubkey}]\n${writtenMessage}` : writtenMessage;
    const session = new WebGuestSession(
      descriptor,
      Math.floor(Date.now() / 1000),
      keyPackage,
      new Date().toISOString(),
      firstMessage,
      queue.slice(0, 32),
      queue.slice(32),
      guestQueue.slice(0, 32),
      guestQueue.slice(32)
    );
    const capability = hex(session.ownerWriteCapability());
    const sent = await fetch(`${session.gatewayUrl().replace(/\/$/, "")}/queues/${capability}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: session.takeFirstEnvelope()
    });
    requireOk(sent, "The encrypted message could not be queued");
    activeSession = session;
    recoveryPassphrase = document.querySelector("#passphrase").value;
    history.push({ author: "You", text: writtenMessage });
    renderHistory();
    await persistSession();
    form.hidden = true;
    download.hidden = false;
    keep.hidden = false;
    clear.hidden = false;
    document.querySelector("#conversation").hidden = false;
    status.textContent = "Sent privately. It will wait securely if the recipient is offline.";
    scheduleReplyPoll();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    button.disabled = false;
  }
});

continuation.addEventListener("submit", async event => {
  event.preventDefault();
  const button = continuation.querySelector("button");
  button.disabled = true;
  try {
    const text = document.querySelector("#next-message").value.trim();
    const file = document.querySelector("#attachment").files[0];
    if (!text && !file) throw new Error("Write a message or choose an attachment.");
    const base = activeSession.gatewayUrl().replace(/\/$/, "");
    const queue = `${base}/queues/${hex(activeSession.guestWriteCapability())}`;
    if (file) {
      if (file.size === 0) throw new Error("Empty attachments are not supported.");
      if (file.size > attachmentLimit) throw new Error("That attachment is larger than the 10 GiB limit.");
      status.textContent = "Checking attachment integrity…";
      const contentHash = await hashFile(file);
      const metadata = activeSession.encryptGatewayAttachment(
        new Date().toISOString(),
        file.name,
        file.type || "application/octet-stream",
        file.size,
        contentHash,
        text
      );
      await enqueue(queue, metadata);
      await persistSession();
      for (let offset = 0; offset < file.size; offset += attachmentChunkBytes) {
        const bytes = new Uint8Array(await file.slice(offset, offset + attachmentChunkBytes).arrayBuffer());
        const envelope = activeSession.encryptGatewayAttachmentChunk(contentHash, file.size, offset, bytes);
        await enqueue(queue, envelope);
        await persistSession();
        status.textContent = `Sending attachment… ${Math.min(100, Math.round(((offset + bytes.length) / file.size) * 100))}%`;
      }
      history.push({ author: "You", text: `${text ? `${text} — ` : ""}Attachment: ${file.name} (${formatBytes(file.size)})` });
    } else {
      await enqueue(queue, activeSession.encryptGatewayText(new Date().toISOString(), text));
      history.push({ author: "You", text });
    }
    renderHistory();
    await persistSession();
    document.querySelector("#next-message").value = "";
    document.querySelector("#attachment").value = "";
    status.textContent = "Sent privately.";
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    button.disabled = false;
  }
});

unlock.addEventListener("submit", async event => {
  event.preventDefault();
  const button = unlock.querySelector("button");
  button.disabled = true;
  try {
    await init();
    recoveryPassphrase = document.querySelector("#unlock-passphrase").value;
    const recovered = decodeRecoveryClear(await unseal(encryptedRecovery, recoveryPassphrase));
    activeSession = WebGuestSession.restore(recovered.session);
    history = recovered.history;
    await restoreIncomingAttachments();
    renderHistory();
    resume.hidden = true;
    conversation.hidden = false;
    download.hidden = false;
    keep.hidden = false;
    clear.hidden = false;
    status.removeAttribute("data-error");
    status.textContent = "Conversation unlocked.";
    scheduleReplyPoll();
  } catch {
    fail("That passphrase could not unlock this conversation.");
    button.disabled = false;
  }
});

download.addEventListener("click", () => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([encryptedRecovery], { type: "application/octet-stream" }));
  link.download = "yosemite-browser-recovery.bin";
  link.click();
  URL.revokeObjectURL(link.href);
});

keep.addEventListener("click", async () => {
  keep.disabled = true;
  try {
    const source = activeSession.exportPromotionSource();
    await persistSession();
    const sealed = await seal(source, recoveryPassphrase);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([sealed], { type: "application/octet-stream" }));
    link.download = "yosemite-keep-contact.bin";
    link.click();
    URL.revokeObjectURL(link.href);
    status.removeAttribute("data-error");
    status.textContent = "Promotion file downloaded. Open it in the Yosemite app to keep this identity and conversation.";
    promotion.hidden = false;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    keep.disabled = false;
  }
});

verifyPromotion.addEventListener("click", async () => {
  verifyPromotion.disabled = true;
  try {
    const receipt = document.querySelector("#promotion-receipt").files[0];
    if (!receipt) throw new Error("Choose the receipt created by Yosemite.");
    const result = activeSession.verifyPromotionReceipt(
      new Uint8Array(await receipt.arrayBuffer()),
      new Date().toISOString()
    );
    promotionInProgress = true;
    const queue = `${activeSession.gatewayUrl().replace(/\/$/, "")}/queues/${hex(activeSession.guestWriteCapability())}`;
    await enqueue(queue, result.envelope);
    await persistSession();
    document.querySelector("#promotion-code").textContent = `Comparison code: ${result.code}`;
    retireBrowser.hidden = false;
    status.removeAttribute("data-error");
    status.textContent = "If the native app shows the same code, enter it there to finish.";
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  } finally {
    verifyPromotion.disabled = false;
  }
});

retireBrowser.addEventListener("click", async () => {
  if (!confirm("Has native Yosemite reported that promotion finished? This clears the retired browser keys and local chat copy.")) return;
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(recoveryFileName).catch(() => {});
  activeSession = undefined;
  recoveryKey = undefined;
  recoveryPassphrase = undefined;
  encryptedRecovery = undefined;
  location.reload();
});

clear.addEventListener("click", async () => {
  if (!confirm("Clear this browser identity and its local conversation state?")) return;
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(recoveryFileName).catch(() => {});
  encryptedRecovery = undefined;
  location.reload();
});

function requireOk(response, message) {
  if (!response.ok) throw new Error(`${message} (${response.status})`);
}

function fail(message) {
  status.dataset.error = "true";
  status.textContent = message;
}

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function seal(cleartext, passphrase) {
  recoverySalt ||= crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  recoveryKey ||= await deriveRecoveryKey(passphrase, recoverySalt);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, recoveryKey, cleartext));
  const output = new Uint8Array(57 + ciphertext.length);
  output.set(new TextEncoder().encode("yosemite.browser-recovery.v1\0"));
  output.set(recoverySalt, 29);
  output.set(nonce, 45);
  output.set(ciphertext, 57);
  return output;
}

async function unseal(sealed, passphrase) {
  if (!sealed || sealed.length < 58) throw new Error("Invalid recovery data");
  const magic = new TextEncoder().encode("yosemite.browser-recovery.v1\0");
  if (!magic.every((byte, index) => sealed[index] === byte)) throw new Error("Invalid recovery data");
  recoverySalt = sealed.slice(29, 45);
  recoveryKey = await deriveRecoveryKey(passphrase, recoverySalt);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.slice(45, 57) }, recoveryKey, sealed.slice(57)));
}

async function deriveRecoveryKey(passphrase, salt) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 600000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function hashFile(file) {
  const hasher = new WebAttachmentHasher();
  for (let offset = 0; offset < file.size; offset += attachmentChunkBytes) {
    hasher.update(new Uint8Array(await file.slice(offset, offset + attachmentChunkBytes).arrayBuffer()));
  }
  return hasher.contentHash();
}

async function enqueue(url, envelope) {
  for (;;) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: envelope
    });
    if (response.status !== 429) {
      requireOk(response, "The encrypted message could not be queued");
      return;
    }
    status.textContent = "Waiting for the recipient to make queue space…";
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function startBrowserCall(video) {
  const relay = relayInput.value.trim().replace(/\/$/, "");
  try {
    if (!activeSession) throw new Error("Unlock or start the private conversation first.");
    if (pendingCall || peerConnection) throw new Error("A call is already active.");
    if (!supportsPrivateCalling()) throw new Error("This browser cannot apply end-to-end encryption to WebRTC encoded frames. Private calling is unavailable.");
    const parsed = new URL(relay);
    if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
      throw new Error("The call relay must use HTTPS.");
    }
    localStorage.setItem("yosemite.call-relay", relay);
    setCallButtons(true);
    callStatus.textContent = "Requesting microphone access…";
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
    document.querySelector("#local-video").srcObject = stream;
    document.querySelector("#call-video").hidden = !video;
    const callId = newCallId();
    const expires = new Date(Date.now() + 5 * 60_000);
    const admission = await fetch(`${relay}/v1/admissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callId: hex(callId),
        expiresAtUnixSeconds: Math.floor(expires.getTime() / 1000),
        participants: 2
      })
    });
    requireOk(admission, "The selected relay refused call admission");
    const allocation = await admission.json();
    if (!Array.isArray(allocation.credentials) || allocation.credentials.length !== 2 || !allocation.mediaAddress) {
      throw new Error("The relay returned invalid call credentials.");
    }
    const localTurn = turnFromAllocation(allocation, 0);
    const ownerTurn = turnFromAllocation(allocation, 1);
    const invitation = activeSession.beginCall(
      callId,
      relay,
      allocation.mediaAddress,
      unhex(allocation.credentials[0]),
      unhex(allocation.credentials[1]),
      localTurn?.url || "",
      localTurn?.username || "",
      localTurn?.credential || "",
      ownerTurn?.url || "",
      ownerTurn?.username || "",
      ownerTurn?.credential || "",
      new Date().toISOString(),
      expires.toISOString(),
      Math.floor(Date.now() / 1000),
      video
    );
    await enqueue(
      `${activeSession.gatewayUrl().replace(/\/$/, "")}/queues/${hex(activeSession.guestWriteCapability())}`,
      invitation
    );
    pendingCall = { stream, video, callId };
    await persistSession();
    callStatus.textContent = "Calling privately…";
    document.querySelector("#end-call").hidden = false;
  } catch (error) {
    pendingCall?.stream.getTracks().forEach(track => track.stop());
    pendingCall = undefined;
    setCallButtons(false);
    callStatus.textContent = error instanceof Error ? error.message : String(error);
    callStatus.dataset.error = "true";
  }
}

function turnFromAllocation(allocation, index) {
  if (allocation.turnCredentials === undefined) return undefined;
  if (!Array.isArray(allocation.turnCredentials)
      || allocation.turnCredentials.length !== allocation.credentials.length) {
    throw new Error("The relay returned invalid TURN credentials.");
  }
  const turn = allocation.turnCredentials[index];
  if (turn === null) return undefined;
  if (!turn
      || typeof turn.url !== "string"
      || !/^turns?:/.test(turn.url)
      || typeof turn.username !== "string"
      || !turn.username
      || typeof turn.credential !== "string"
      || !turn.credential) {
    throw new Error("The relay returned invalid TURN credentials.");
  }
  return turn;
}

function supportsPrivateCalling() {
  return Boolean(window.RTCPeerConnection && navigator.mediaDevices?.getUserMedia && (
    window.RTCRtpScriptTransform || RTCRtpSender.prototype.createEncodedStreams
  ));
}

async function connectBrowserMedia(ready, room = false) {
  const stream = pendingCall?.stream;
  if (!stream) throw new Error("The local call devices are no longer available.");
  const turn = ready.turnUrl ? {
    urls: ready.turnUrl,
    username: ready.turnUsername,
    credential: ready.turnCredential
  } : undefined;
  const pc = new RTCPeerConnection({
    iceServers: turn ? [turn] : [],
    iceTransportPolicy: turn ? "relay" : "all"
  });
  peerConnection = pc;
  const remote = new MediaStream();
  document.querySelector("#remote-video").srcObject = remote;
  pc.ontrack = event => {
    remote.addTrack(event.track);
    if (event.track.kind === "video") document.querySelector("#call-video").hidden = false;
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") callStatus.textContent = "Encrypted call connected.";
    if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
      callStatus.textContent = "The encrypted call ended.";
    }
  };
  for (const track of stream.getTracks()) {
    const transceiver = pc.addTransceiver(track, { direction: "sendrecv", streams: [stream] });
    if (room) {
      installRoomEncodedTransform(transceiver.sender, "encrypt", track.kind, roomEpoch);
      installRoomEncodedTransform(transceiver.receiver, "decrypt", track.kind, roomEpoch);
    } else {
      installEncodedTransform(transceiver.sender, "encrypt", track.kind, ready);
      installEncodedTransform(transceiver.receiver, "decrypt", track.kind, ready);
    }
  }
  await pc.setLocalDescription(await pc.createOffer());
  await waitForIceGathering(pc);
  const joined = await fetch(`${ready.relay.replace(/\/$/, "")}/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      credential: hex(ready.relayCredential),
      offer: pc.localDescription.sdp
    })
  });
  requireOk(joined, "The relay could not connect this browser");
  const response = await joined.json();
  relaySession = { endpoint: ready.relay.replace(/\/$/, ""), token: response.session };
  if (!room) {
    activeCallSignal = {
      callId: ready.callId,
      establishmentHash: ready.establishmentHash
    };
  }
  await pc.setRemoteDescription({ type: "answer", sdp: response.answer });
  scheduleSignalPoll();
  pendingCall = undefined;
}

function createRoomCryptor(options) {
  const cryptor = new WebMediaCryptor(
    options.callId,
    options.cryptographicInstance,
    options.localDevice,
    options.localKey,
    options.remoteDevice,
    options.remoteKey
  );
  for (let cursor = 48; cursor < options.remoteKeys.length; cursor += 48) {
    cryptor.addRemoteSender(
      options.remoteKeys.slice(cursor, cursor + 32),
      options.remoteKeys.slice(cursor + 32, cursor + 48)
    );
  }
  return cryptor;
}

function installRoomEncodedTransform(endpoint, direction, media, epoch) {
  const kind = media === "audio" ? 1 : 2;
  const options = roomCryptorOptions(epoch, direction, kind);
  if (window.RTCRtpScriptTransform) {
    const worker = new Worker("./media-worker.js", { type: "module" });
    endpoint.transform = new RTCRtpScriptTransform(worker, options);
    roomTransforms.push({ worker, direction, kind });
    return;
  }
  const holder = { cryptor: createRoomCryptor(options) };
  roomTransforms.push({ holder, direction, kind });
  const streams = endpoint.createEncodedStreams();
  streams.readable
    .pipeThrough(new TransformStream({
      transform(frame, controller) {
        encodedTransform(holder.cryptor, direction, kind)(frame, controller);
      }
    }))
    .pipeTo(streams.writable)
    .catch(error => {
      status.textContent = `Encrypted Room media stopped: ${error.message || error}`;
      leaveBrowserRoom();
    });
}

function installEncodedTransform(endpoint, direction, media, ready) {
  const options = {
    direction,
    kind: media === "audio" ? 1 : 2,
    callId: ready.callId,
    cryptographicInstance: ready.cryptographicInstance,
    localDevice: ready.localDevice,
    localKey: ready.localKey,
    remoteDevice: ready.remoteDevice,
    remoteKey: ready.remoteKey
  };
  if (window.RTCRtpScriptTransform) {
    endpoint.transform = new RTCRtpScriptTransform(new Worker("./media-worker.js", { type: "module" }), options);
    return;
  }
  const cryptor = new WebMediaCryptor(
    options.callId,
    options.cryptographicInstance,
    options.localDevice,
    options.localKey,
    options.remoteDevice,
    options.remoteKey
  );
  const streams = endpoint.createEncodedStreams();
  streams.readable
    .pipeThrough(new TransformStream({ transform: encodedTransform(cryptor, direction, options.kind) }))
    .pipeTo(streams.writable)
    .catch(error => {
      callStatus.textContent = `Encrypted media stopped: ${error.message || error}`;
      endBrowserCall();
    });
}

function encodedTransform(cryptor, direction, kind) {
  return (frame, controller) => {
    const bytes = new Uint8Array(frame.data);
    if (direction === "encrypt") {
      const encrypted = cryptor.encrypt(kind, Number(frame.timestamp), frame.type === "key", bytes);
      frame.data = encrypted.buffer.slice(encrypted.byteOffset, encrypted.byteOffset + encrypted.byteLength);
    } else {
      const clear = cryptor.decrypt(bytes);
      const payload = clear.payload;
      frame.data = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
    }
    controller.enqueue(frame);
  };
}

async function waitForIceGathering(pc) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebRTC candidate gathering timed out.")), 10_000);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") { clearTimeout(timeout); resolve(); }
    });
  });
}

function scheduleSignalPoll() {
  clearTimeout(signalTimer);
  signalTimer = setTimeout(pollCallSignals, 100);
}

async function pollCallSignals() {
  if (!relaySession || !peerConnection) return;
  try {
    const events = await relaySignal({ type: "poll" });
    for (const event of events) {
      if (event.type === "session_description" && event.sdp?.type === "offer") {
        await peerConnection.setRemoteDescription(event.sdp);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await relaySignal({
          type: "session_description",
          negotiation_id: event.negotiation_id,
          sdp: peerConnection.localDescription
        });
      } else if (event.type === "candidate" && event.candidate) {
        await peerConnection.addIceCandidate(event.candidate);
      } else if (event.type === "error") {
        throw new Error(event.reason || "Relay signaling failed.");
      }
    }
  } catch (error) {
    callStatus.textContent = error instanceof Error ? error.message : String(error);
    await endBrowserCall();
    return;
  }
  scheduleSignalPoll();
}

async function relaySignal(signal) {
  const response = await fetch(`${relaySession.endpoint}/v1/signal?session=${relaySession.token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signal)
  });
  requireOk(response, "Relay signaling failed");
  return response.json();
}

async function endBrowserCall() {
  clearTimeout(signalTimer);
  if (activeSession && activeCallSignal) {
    try {
      const envelope = activeSession.endCall(
        activeCallSignal.callId,
        activeCallSignal.establishmentHash,
        new Date().toISOString()
      );
      await enqueue(
        `${activeSession.gatewayUrl().replace(/\/$/, "")}/queues/${hex(activeSession.guestWriteCapability())}`,
        envelope
      );
      await persistSession();
    } catch {}
  }
  activeCallSignal = undefined;
  if (relaySession) await relaySignal({ type: "leave" }).catch(() => {});
  relaySession = undefined;
  peerConnection?.close();
  peerConnection = undefined;
  pendingCall?.stream.getTracks().forEach(track => track.stop());
  const local = document.querySelector("#local-video").srcObject;
  local?.getTracks().forEach(track => track.stop());
  document.querySelector("#local-video").srcObject = null;
  document.querySelector("#remote-video").srcObject = null;
  document.querySelector("#call-video").hidden = true;
  document.querySelector("#end-call").hidden = true;
  pendingCall = undefined;
  setCallButtons(false);
}

function setCallButtons(disabled) {
  document.querySelector("#voice-call").disabled = disabled;
  document.querySelector("#video-call").disabled = disabled;
}

function unhex(value) {
  if (typeof value !== "string" || value.length % 2) throw new Error("The relay returned invalid credentials.");
  return Uint8Array.from(value.match(/../g), pair => Number.parseInt(pair, 16));
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}

function encodeRecoveryClear(session, messages) {
  return new TextEncoder().encode(JSON.stringify({
    version: 1,
    session: base64(session),
    messages
  }));
}

function decodeRecoveryClear(bytes) {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (value.version !== 1 || typeof value.session !== "string" || !Array.isArray(value.messages)) throw new Error();
    return { session: unbase64(value.session), history: value.messages };
  } catch {
    return { session: bytes, history: [] };
  }
}

function base64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + 32768));
  }
  return btoa(binary);
}

function unbase64(value) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function persistSession() {
  encryptedRecovery = await seal(
    encodeRecoveryClear(activeSession.exportPrivateState(), history),
    recoveryPassphrase
  );
  await storeRecovery(encryptedRecovery);
}

function renderHistory() {
  const messages = document.querySelector("#messages");
  messages.replaceChildren();
  for (const message of history) {
    const item = document.createElement("li");
    item.textContent = `${safeDisplay(message.author)}: ${safeDisplay(message.text)}`;
    if (message.attachment?.verified) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `Save ${safeDisplay(message.attachment.filename)}`;
      button.addEventListener("click", () => downloadIncomingAttachment(message.attachment));
      item.append(document.createElement("br"), button);
    }
    messages.append(item);
  }
}

async function receiveAttachmentMetadata(reply) {
  const hash = hex(reply.contentHash);
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(`${hash}.part`, { create: true });
  const writer = await handle.createWritable();
  await writer.truncate(0);
  await writer.close();
  const record = {
    author: "Owner",
    text: `${reply.text ? `${reply.text} — ` : ""}Attachment: ${reply.filename} (${formatBytes(reply.byteSize)})`,
    attachment: {
      hash,
      filename: reply.filename,
      mediaType: reply.mediaType,
      byteSize: reply.byteSize,
      received: 0,
      verified: false
    }
  };
  history.push(record);
  const hasher = new WebAttachmentHasher();
  if (reply.byteSize === 0) {
    if (hex(hasher.contentHash()) !== hash) throw new Error("The empty attachment hash is invalid.");
    record.attachment.verified = true;
  }
  incomingAttachments.set(hash, { record, handle, hasher });
  renderHistory();
}

async function receiveAttachmentChunk(reply) {
  const hash = hex(reply.contentHash);
  const incoming = incomingAttachments.get(hash);
  if (!incoming
      || incoming.record.attachment.byteSize !== reply.byteSize
      || incoming.record.attachment.received !== reply.offset) {
    throw new Error("The attachment stream is out of order.");
  }
  incoming.hasher.update(reply.bytes);
  const writer = await incoming.handle.createWritable({ keepExistingData: true });
  await writer.seek(reply.offset);
  await writer.write(reply.bytes);
  await writer.close();
  incoming.record.attachment.received += reply.bytes.length;
  if (incoming.record.attachment.received === reply.byteSize) {
    if (hex(incoming.hasher.contentHash()) !== hash) throw new Error("The attachment failed final integrity verification.");
    incoming.record.attachment.verified = true;
    renderHistory();
  }
}

async function restoreIncomingAttachments() {
  if (!navigator.storage?.getDirectory) return;
  const root = await navigator.storage.getDirectory();
  for (const record of history.filter(message => message.attachment)) {
    try {
      const handle = await root.getFileHandle(`${record.attachment.hash}.part`);
      const hasher = new WebAttachmentHasher();
      if (!record.attachment.verified) {
        const file = await handle.getFile();
        for (let offset = 0; offset < file.size; offset += attachmentChunkBytes) {
          hasher.update(new Uint8Array(await file.slice(offset, offset + attachmentChunkBytes).arrayBuffer()));
        }
        record.attachment.received = file.size;
      }
      incomingAttachments.set(record.attachment.hash, { record, handle, hasher });
    } catch {
      record.attachment.received = 0;
      record.attachment.verified = false;
    }
  }
}

async function downloadIncomingAttachment(attachment) {
  const incoming = incomingAttachments.get(attachment.hash);
  if (!incoming || !attachment.verified) return;
  const file = await incoming.handle.getFile();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = safeFilename(attachment.filename);
  link.click();
  URL.revokeObjectURL(link.href);
}

function safeFilename(value) {
  return value.replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "_");
}

function safeDisplay(value) {
  const visible = value.replace(
    /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu,
    character => `<U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}>`,
  );
  return `\u2068${visible}\u2069`;
}

async function initializeRecovery() {
  if (!navigator.storage?.getDirectory) return;
  try {
    const root = await navigator.storage.getDirectory();
    const file = await root.getFileHandle(recoveryFileName);
    encryptedRecovery = new Uint8Array(await (await file.getFile()).arrayBuffer());
    form.hidden = true;
    resume.hidden = false;
    clear.hidden = false;
    status.textContent = "Unlock your saved conversation to continue.";
  } catch (error) {
    if (error?.name !== "NotFoundError") fail("Saved conversation state could not be read.");
  }
}

async function storeRecovery(bytes) {
  if (!navigator.storage?.getDirectory) return;
  const root = await navigator.storage.getDirectory();
  const file = await root.getFileHandle(recoveryFileName, { create: true });
  const writer = await file.createWritable();
  await writer.write(bytes);
  await writer.close();
}

function scheduleReplyPoll() {
  setTimeout(pollReplies, 3000);
}

async function pollReplies() {
  if (!activeSession || promotionInProgress) return;
  try {
    const base = activeSession.gatewayUrl().replace(/\/$/, "");
    const capability = hex(activeSession.replyWriteCapability());
    const readKey = hex(activeSession.replyReadKey());
    for (let index = 0; index < 128; index += 1) {
      const response = await fetch(`${base}/queues/${capability}`, {
        headers: { "Authorization": `Bearer ${readKey}` },
        cache: "no-store"
      });
      requireOk(response, "Encrypted replies could not be checked");
      const envelopes = decodeBatch(new Uint8Array(await response.arrayBuffer()));
      const envelope = envelopes[0];
      if (!envelope) break;
      const reply = activeSession.decryptGatewayReplyItem(envelope);
      if (reply.kind === "text") {
        history.push({ author: "Owner", text: reply.text });
        renderHistory();
      } else if (reply.kind === "attachment") {
        await receiveAttachmentMetadata(reply);
      } else if (reply.kind === "attachment_chunk") {
        await receiveAttachmentChunk(reply);
      } else if (reply.kind === "call_acceptance") {
        const ready = activeSession.finishCall(reply.bytes, new Date().toISOString());
        await enqueue(
          `${base}/queues/${hex(activeSession.guestWriteCapability())}`,
          ready.envelope
        );
        await connectBrowserMedia(ready);
      } else {
        throw new Error("The native client sent an unsupported reply.");
      }
      document.querySelector("#conversation").hidden = false;
      await persistSession();
      const acknowledged = await fetch(`${base}/queues/${capability}/ack`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${readKey}` }
      });
      requireOk(acknowledged, "The encrypted reply could not be acknowledged");
    }
  } catch (error) {
    status.dataset.error = "true";
    status.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    if (!promotionInProgress) scheduleReplyPoll();
  }
}

function decodeBatch(bytes) {
  let cursor = 0;
  const readLength = () => {
    if (cursor + 4 > bytes.length) throw new Error("The gateway returned a truncated reply batch");
    const value = new DataView(bytes.buffer, bytes.byteOffset + cursor, 4).getUint32(0);
    cursor += 4;
    return value;
  };
  const count = readLength();
  if (count > 128) throw new Error("The gateway returned too many replies");
  const output = [];
  for (let index = 0; index < count; index += 1) {
    const length = readLength();
    if (cursor + length > bytes.length) throw new Error("The gateway returned a truncated reply");
    output.push(bytes.slice(cursor, cursor + length));
    cursor += length;
  }
  if (cursor !== bytes.length) throw new Error("The gateway returned trailing reply data");
  return output;
}
