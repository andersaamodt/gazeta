import init, { WebMediaCryptor } from "./pkg/yosemite_web.js";

let replaceOptions;
self.onmessage = event => { replaceOptions = event.data; };

function createCryptor(options) {
  const cryptor = new WebMediaCryptor(
    options.callId,
    options.cryptographicInstance,
    options.localDevice,
    options.localKey,
    options.remoteDevice,
    options.remoteKey
  );
  for (let cursor = 48; cursor < (options.remoteKeys?.length || 0); cursor += 48) {
    cryptor.addRemoteSender(
      options.remoteKeys.slice(cursor, cursor + 32),
      options.remoteKeys.slice(cursor + 32, cursor + 48)
    );
  }
  return cryptor;
}

self.onrtctransform = async event => {
  await init();
  let options = event.transformer.options;
  let cryptor = createCryptor(options);
  event.transformer.readable
    .pipeThrough(new TransformStream({
      transform(frame, controller) {
        if (replaceOptions) {
          options = replaceOptions;
          replaceOptions = undefined;
          cryptor = createCryptor(options);
        }
        const bytes = new Uint8Array(frame.data);
        if (options.direction === "encrypt") {
          const encrypted = cryptor.encrypt(
            options.kind,
            Number(frame.timestamp),
            frame.type === "key",
            bytes
          );
          frame.data = encrypted.buffer.slice(
            encrypted.byteOffset,
            encrypted.byteOffset + encrypted.byteLength
          );
        } else {
          const payload = cryptor.decrypt(bytes).payload;
          frame.data = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
        }
        controller.enqueue(frame);
      }
    }))
    .pipeTo(event.transformer.writable);
};
