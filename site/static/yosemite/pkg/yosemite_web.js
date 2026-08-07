/**
 * Incremental BLAKE3 for large browser Files without whole-file buffering.
 */
export class WebAttachmentHasher {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebAttachmentHasherFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_webattachmenthasher_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    byteSize() {
        const ret = wasm.webattachmenthasher_byteSize(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Uint8Array}
     */
    contentHash() {
        const ret = wasm.webattachmenthasher_contentHash(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    constructor() {
        const ret = wasm.webattachmenthasher_new();
        this.__wbg_ptr = ret;
        WebAttachmentHasherFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Add one browser-read chunk.
     *
     * # Errors
     * Returns an error only if the total byte count overflows.
     * @param {Uint8Array} bytes
     */
    update(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webattachmenthasher_update(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) WebAttachmentHasher.prototype[Symbol.dispose] = WebAttachmentHasher.prototype.free;

/**
 * Browser call signaling result plus endpoint-only media key material.
 */
export class WebCallReady {
    static __wrap(ptr) {
        const obj = Object.create(WebCallReady.prototype);
        obj.__wbg_ptr = ptr;
        WebCallReadyFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebCallReadyFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_webcallready_free(ptr, 0);
    }
    /**
     * @returns {Uint8Array}
     */
    get callId() {
        const ret = wasm.webcallready_callId(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get cryptographicInstance() {
        const ret = wasm.webcallready_cryptographicInstance(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get envelope() {
        const ret = wasm.webcallready_envelope(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get establishmentHash() {
        const ret = wasm.webcallready_establishmentHash(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get localDevice() {
        const ret = wasm.webcallready_localDevice(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get localKey() {
        const ret = wasm.webcallready_localKey(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {string}
     */
    get mediaAddress() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webcallready_mediaAddress(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get relay() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webcallready_relay(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    get relayCredential() {
        const ret = wasm.webcallready_relayCredential(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get remoteDevice() {
        const ret = wasm.webcallready_remoteDevice(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get remoteKey() {
        const ret = wasm.webcallready_remoteKey(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {string}
     */
    get turnCredential() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webcallready_turnCredential(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get turnUrl() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webcallready_turnUrl(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get turnUsername() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webcallready_turnUsername(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {boolean}
     */
    get video() {
        const ret = wasm.webcallready_video(this.__wbg_ptr);
        return ret !== 0;
    }
}
if (Symbol.dispose) WebCallReady.prototype[Symbol.dispose] = WebCallReady.prototype.free;

export class WebDecryptedFrame {
    static __wrap(ptr) {
        const obj = Object.create(WebDecryptedFrame.prototype);
        obj.__wbg_ptr = ptr;
        WebDecryptedFrameFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebDecryptedFrameFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_webdecryptedframe_free(ptr, 0);
    }
    /**
     * @returns {boolean}
     */
    get keyframe() {
        const ret = wasm.webdecryptedframe_keyframe(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get kind() {
        const ret = wasm.webdecryptedframe_kind(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Uint8Array}
     */
    get payload() {
        const ret = wasm.webdecryptedframe_payload(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {number}
     */
    get timestamp() {
        const ret = wasm.webdecryptedframe_timestamp(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WebDecryptedFrame.prototype[Symbol.dispose] = WebDecryptedFrame.prototype.free;

/**
 * One authenticated native reply decoded for the browser UI.
 */
export class WebGatewayReply {
    static __wrap(ptr) {
        const obj = Object.create(WebGatewayReply.prototype);
        obj.__wbg_ptr = ptr;
        WebGatewayReplyFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebGatewayReplyFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_webgatewayreply_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get byteSize() {
        const ret = wasm.webgatewayreply_byteSize(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Uint8Array}
     */
    get bytes() {
        const ret = wasm.webgatewayreply_bytes(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get contentHash() {
        const ret = wasm.webgatewayreply_contentHash(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {string}
     */
    get filename() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webgatewayreply_filename(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get kind() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webgatewayreply_kind(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get mediaType() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webgatewayreply_mediaType(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {number}
     */
    get offset() {
        const ret = wasm.webgatewayreply_offset(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    get text() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webgatewayreply_text(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) WebGatewayReply.prototype[Symbol.dispose] = WebGatewayReply.prototype.free;

/**
 * One browser-local guest identity and provisional two-leaf MLS Conversation.
 */
export class WebGuestSession {
    static __wrap(ptr) {
        const obj = Object.create(WebGuestSession.prototype);
        obj.__wbg_ptr = ptr;
        WebGuestSessionFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebGuestSessionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_webguestsession_free(ptr, 0);
    }
    /**
     * Start an ephemeral call group and encrypt its signed invitation through
     * the existing website Conversation.
     * @param {Uint8Array} call_id
     * @param {string} relay
     * @param {string} media_address
     * @param {Uint8Array} local_relay_credential
     * @param {Uint8Array} owner_relay_credential
     * @param {string} local_turn_url
     * @param {string} local_turn_username
     * @param {string} local_turn_credential
     * @param {string} owner_turn_url
     * @param {string} owner_turn_username
     * @param {string} owner_turn_credential
     * @param {string} sent_at
     * @param {string} expires_at
     * @param {number} now_unix_seconds
     * @param {boolean} video
     * @returns {Uint8Array}
     */
    beginCall(call_id, relay, media_address, local_relay_credential, owner_relay_credential, local_turn_url, local_turn_username, local_turn_credential, owner_turn_url, owner_turn_username, owner_turn_credential, sent_at, expires_at, now_unix_seconds, video) {
        const ptr0 = passArray8ToWasm0(call_id, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(relay, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(media_address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray8ToWasm0(local_relay_credential, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArray8ToWasm0(owner_relay_credential, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passStringToWasm0(local_turn_url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len5 = WASM_VECTOR_LEN;
        const ptr6 = passStringToWasm0(local_turn_username, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len6 = WASM_VECTOR_LEN;
        const ptr7 = passStringToWasm0(local_turn_credential, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len7 = WASM_VECTOR_LEN;
        const ptr8 = passStringToWasm0(owner_turn_url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len8 = WASM_VECTOR_LEN;
        const ptr9 = passStringToWasm0(owner_turn_username, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len9 = WASM_VECTOR_LEN;
        const ptr10 = passStringToWasm0(owner_turn_credential, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len10 = WASM_VECTOR_LEN;
        const ptr11 = passStringToWasm0(sent_at, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len11 = WASM_VECTOR_LEN;
        const ptr12 = passStringToWasm0(expires_at, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len12 = WASM_VECTOR_LEN;
        const ret = wasm.webguestsession_beginCall(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7, ptr8, len8, ptr9, len9, ptr10, len10, ptr11, len11, ptr12, len12, now_unix_seconds, video);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v14 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v14;
    }
    /**
     * @returns {Uint8Array}
     */
    conversationId() {
        const ret = wasm.webguestsession_conversationId(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Validate and decrypt one gateway-framed native reply.
     *
     * # Errors
     * Returns an error for the wrong Conversation, unexpected Welcome, or MLS failure.
     * @param {Uint8Array} wire
     * @returns {Uint8Array}
     */
    decryptGatewayReply(wire) {
        const ptr0 = passArray8ToWasm0(wire, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webguestsession_decryptGatewayReply(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * Decrypt and authenticate a native text, attachment announcement, or chunk.
     *
     * # Errors
     * Returns an error for framing, MLS, owner authorization, or invalid content.
     * @param {Uint8Array} wire
     * @returns {WebGatewayReply}
     */
    decryptGatewayReplyItem(wire) {
        const ptr0 = passArray8ToWasm0(wire, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webguestsession_decryptGatewayReplyItem(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WebGatewayReply.__wrap(ret[0]);
    }
    /**
     * Decrypt and application-authenticate one native text reply.
     *
     * # Errors
     * Returns an error for invalid framing, MLS, author binding, signature, or body.
     * @param {Uint8Array} wire
     * @returns {string}
     */
    decryptGatewayReplyText(wire) {
        let deferred3_0;
        let deferred3_1;
        try {
            const ptr0 = passArray8ToWasm0(wire, wasm.__wbindgen_malloc);
            const len0 = WASM_VECTOR_LEN;
            const ret = wasm.webguestsession_decryptGatewayReplyText(this.__wbg_ptr, ptr0, len0);
            var ptr2 = ret[0];
            var len2 = ret[1];
            if (ret[3]) {
                ptr2 = 0; len2 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred3_0 = ptr2;
            deferred3_1 = len2;
            return getStringFromWasm0(ptr2, len2);
        } finally {
            wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
        }
    }
    /**
     * Decrypt one native reply and return its canonical signed Object wire.
     *
     * # Errors
     * Returns an error when MLS authentication or decryption fails.
     * @param {Uint8Array} ciphertext
     * @returns {Uint8Array}
     */
    decryptReply(ciphertext) {
        const ptr0 = passArray8ToWasm0(ciphertext, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webguestsession_decryptReply(this.__wbg_ptr, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * Sign and encrypt attachment metadata before streaming its bytes.
     *
     * # Errors
     * Returns an error for unsafe metadata, bounds, signing, MLS, or framing.
     * @param {string} sent_at
     * @param {string} filename
     * @param {string} media_type
     * @param {number} byte_size
     * @param {Uint8Array} content_hash
     * @param {string} caption
     * @returns {Uint8Array}
     */
    encryptGatewayAttachment(sent_at, filename, media_type, byte_size, content_hash, caption) {
        const ptr0 = passStringToWasm0(sent_at, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(filename, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(media_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray8ToWasm0(content_hash, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passStringToWasm0(caption, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len4 = WASM_VECTOR_LEN;
        const ret = wasm.webguestsession_encryptGatewayAttachment(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, byte_size, ptr3, len3, ptr4, len4);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v6 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v6;
    }
    /**
     * Encrypt one bounded, independently hashed attachment chunk.
     *
     * # Errors
     * Returns an error for invalid bounds, integrity, MLS, or framing.
     * @param {Uint8Array} content_hash
     * @param {number} byte_size
     * @param {number} offset
     * @param {Uint8Array} bytes
     * @returns {Uint8Array}
     */
    encryptGatewayAttachmentChunk(content_hash, byte_size, offset, bytes) {
        const ptr0 = passArray8ToWasm0(content_hash, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.webguestsession_encryptGatewayAttachmentChunk(this.__wbg_ptr, ptr0, len0, byte_size, offset, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * Sign, encrypt, and frame a later message for the guest-specific queue.
     *
     * # Errors
     * Returns an error for signing-state exhaustion, MLS, or framing failure.
     * @param {string} sent_at
     * @param {string} text
     * @returns {Uint8Array}
     */
    encryptGatewayText(sent_at, text) {
        const ptr0 = passStringToWasm0(sent_at, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.webguestsession_encryptGatewayText(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * Encrypt a later signed text Object inside the same provisional MLS group.
     *
     * # Errors
     * Returns an error for exhausted state or MLS encryption failure.
     * @param {string} sent_at
     * @param {string} text
     * @returns {Uint8Array}
     */
    encryptText(sent_at, text) {
        const ptr0 = passStringToWasm0(sent_at, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.webguestsession_encryptText(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v3;
    }
    /**
     * Sign and encrypt a browser hangup through the website Conversation.
     * @param {Uint8Array} call_id
     * @param {Uint8Array} related_signal_hash
     * @param {string} sent_at
     * @returns {Uint8Array}
     */
    endCall(call_id, related_signal_hash, sent_at) {
        const ptr0 = passArray8ToWasm0(call_id, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(related_signal_hash, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(sent_at, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.webguestsession_endCall(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v4;
    }
    /**
     * Export browser-private state for caller-side encryption into OPFS.
     *
     * # Errors
     * Returns an error if the MLS state cannot be serialized.
     * @returns {Uint8Array}
     */
    exportPrivateState() {
        const ret = wasm.webguestsession_exportPrivateState(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Export the minimum browser authority needed for a native promotion.
     * The caller must encrypt this value before writing it outside origin-local storage.
     * MLS sender state is deliberately excluded.
     *
     * # Errors
     * Returns an error for a legacy session without its signed owner descriptor or oversized history.
     * @returns {Uint8Array}
     */
    exportPromotionSource() {
        const ret = wasm.webguestsession_exportPromotionSource(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Authenticate a native acceptance, finalize the ephemeral MLS group, and
     * return the establishment envelope plus `SFrame` endpoint keys.
     * @param {Uint8Array} clear_acceptance
     * @param {string} sent_at
     * @returns {WebCallReady}
     */
    finishCall(clear_acceptance, sent_at) {
        const ptr0 = passArray8ToWasm0(clear_acceptance, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(sent_at, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.webguestsession_finishCall(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WebCallReady.__wrap(ret[0]);
    }
    /**
     * @returns {string}
     */
    gatewayUrl() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webguestsession_gatewayUrl(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    guestWriteCapability() {
        const ret = wasm.webguestsession_guestWriteCapability(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {string}
     */
    keyPackageUrl() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webguestsession_keyPackageUrl(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Create a local guest, authenticate the claimed owner `KeyPackage`, and
     * return Welcome plus an encrypted Pending Contact Object.
     *
     * # Errors
     * Returns a JavaScript error for invalid descriptor material or MLS failure.
     * @param {Uint8Array} signed_descriptor
     * @param {number} now_unix_seconds
     * @param {Uint8Array} owner_key_package
     * @param {string} sent_at
     * @param {string} text
     * @param {Uint8Array} reply_write_capability
     * @param {Uint8Array} reply_read_key
     * @param {Uint8Array} guest_write_capability
     * @param {Uint8Array} guest_read_key
     */
    constructor(signed_descriptor, now_unix_seconds, owner_key_package, sent_at, text, reply_write_capability, reply_read_key, guest_write_capability, guest_read_key) {
        const ptr0 = passArray8ToWasm0(signed_descriptor, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(owner_key_package, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(sent_at, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArray8ToWasm0(reply_write_capability, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passArray8ToWasm0(reply_read_key, wasm.__wbindgen_malloc);
        const len5 = WASM_VECTOR_LEN;
        const ptr6 = passArray8ToWasm0(guest_write_capability, wasm.__wbindgen_malloc);
        const len6 = WASM_VECTOR_LEN;
        const ptr7 = passArray8ToWasm0(guest_read_key, wasm.__wbindgen_malloc);
        const len7 = WASM_VECTOR_LEN;
        const ret = wasm.webguestsession_new(ptr0, len0, now_unix_seconds, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6, ptr7, len7);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WebGuestSessionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {Uint8Array}
     */
    ownerWriteCapability() {
        const ret = wasm.webguestsession_ownerWriteCapability(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {string}
     */
    personId() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webguestsession_personId(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    replyReadKey() {
        const ret = wasm.webguestsession_replyReadKey(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    replyWriteCapability() {
        const ret = wasm.webguestsession_replyWriteCapability(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Restore decrypted origin-local state after suspension.
     *
     * # Errors
     * Returns an error for malformed identity or MLS state.
     * @param {Uint8Array} bytes
     * @returns {WebGuestSession}
     */
    static restore(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webguestsession_restore(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WebGuestSession.__wrap(ret[0]);
    }
    /**
     * Take the constructor-produced first gateway envelope exactly once.
     *
     * # Errors
     * Returns an error after the envelope has already been taken.
     * @returns {Uint8Array}
     */
    takeFirstEnvelope() {
        const ret = wasm.webguestsession_takeFirstEnvelope(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Decrypt and validate the native promotion receipt, returning its six-digit comparison code.
     *
     * # Errors
     * Returns an error for tampering, a different browser identity, or invalid continuity records.
     * @param {Uint8Array} sealed
     * @param {string} sent_at
     * @returns {WebPromotionResult}
     */
    verifyPromotionReceipt(sealed, sent_at) {
        const ptr0 = passArray8ToWasm0(sealed, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(sent_at, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.webguestsession_verifyPromotionReceipt(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WebPromotionResult.__wrap(ret[0]);
    }
}
if (Symbol.dispose) WebGuestSession.prototype[Symbol.dispose] = WebGuestSession.prototype.free;

/**
 * RFC 9605 transform state for one browser RTCRtpSender/Receiver pair.
 * Each outbound audio/video stream owns an independent KID and counter.
 */
export class WebMediaCryptor {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebMediaCryptorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_webmediacryptor_free(ptr, 0);
    }
    /**
     * @param {Uint8Array} remote_device
     * @param {Uint8Array} remote_key
     */
    addRemoteSender(remote_device, remote_key) {
        const ptr0 = passArray8ToWasm0(remote_device, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(remote_key, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.webmediacryptor_addRemoteSender(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Authenticate one complete Yosemite relay packet before returning codec
     * bytes to the browser decoder.
     * @param {Uint8Array} wire
     * @returns {WebDecryptedFrame}
     */
    decrypt(wire) {
        const ptr0 = passArray8ToWasm0(wire, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webmediacryptor_decrypt(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WebDecryptedFrame.__wrap(ret[0]);
    }
    /**
     * Replace one browser encoded frame payload with Yosemite's complete
     * relay-forwardable `SFrame` packet.
     * @param {number} kind
     * @param {number} timestamp
     * @param {boolean} keyframe
     * @param {Uint8Array} payload
     * @returns {Uint8Array}
     */
    encrypt(kind, timestamp, keyframe, payload) {
        const ptr0 = passArray8ToWasm0(payload, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webmediacryptor_encrypt(this.__wbg_ptr, kind, timestamp, keyframe, ptr0, len0);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * @param {Uint8Array} call_id
     * @param {Uint8Array} cryptographic_instance
     * @param {Uint8Array} local_device
     * @param {Uint8Array} local_key
     * @param {Uint8Array} remote_device
     * @param {Uint8Array} remote_key
     */
    constructor(call_id, cryptographic_instance, local_device, local_key, remote_device, remote_key) {
        const ptr0 = passArray8ToWasm0(call_id, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(cryptographic_instance, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(local_device, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray8ToWasm0(local_key, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArray8ToWasm0(remote_device, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ptr5 = passArray8ToWasm0(remote_key, wasm.__wbindgen_malloc);
        const len5 = WASM_VECTOR_LEN;
        const ret = wasm.webmediacryptor_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WebMediaCryptorFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) WebMediaCryptor.prototype[Symbol.dispose] = WebMediaCryptor.prototype.free;

/**
 * Verified promotion result: matching code plus ordered MLS artifacts for the owner.
 */
export class WebPromotionResult {
    static __wrap(ptr) {
        const obj = Object.create(WebPromotionResult.prototype);
        obj.__wbg_ptr = ptr;
        WebPromotionResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebPromotionResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_webpromotionresult_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get code() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webpromotionresult_code(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    get envelope() {
        const ret = wasm.webpromotionresult_envelope(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
}
if (Symbol.dispose) WebPromotionResult.prototype[Symbol.dispose] = WebPromotionResult.prototype.free;

export class WebRoomEpoch {
    static __wrap(ptr) {
        const obj = Object.create(WebRoomEpoch.prototype);
        obj.__wbg_ptr = ptr;
        WebRoomEpochFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebRoomEpochFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_webroomepoch_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get epoch() {
        const ret = wasm.webroomepoch_epoch(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Uint8Array}
     */
    get instanceId() {
        const ret = wasm.webroomepoch_instanceId(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get localDevice() {
        const ret = wasm.webroomepoch_localDevice(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get localKey() {
        const ret = wasm.webroomepoch_localKey(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {string}
     */
    get mediaAddress() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webroomepoch_mediaAddress(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    get relayCredential() {
        const ret = wasm.webroomepoch_relayCredential(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get remoteKeys() {
        const ret = wasm.webroomepoch_remoteKeys(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {Uint8Array}
     */
    get session() {
        const ret = wasm.webroomepoch_session(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
}
if (Symbol.dispose) WebRoomEpoch.prototype[Symbol.dispose] = WebRoomEpoch.prototype.free;

export class WebRoomJoin {
    static __wrap(ptr) {
        const obj = Object.create(WebRoomJoin.prototype);
        obj.__wbg_ptr = ptr;
        WebRoomJoinFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebRoomJoinFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_webroomjoin_free(ptr, 0);
    }
    /**
     * @returns {Uint8Array}
     */
    get candidate() {
        const ret = wasm.webroomjoin_candidate(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {WebRoomEpoch}
     */
    takeEpoch() {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.webroomjoin_takeEpoch(ptr);
        return WebRoomEpoch.__wrap(ret);
    }
}
if (Symbol.dispose) WebRoomJoin.prototype[Symbol.dispose] = WebRoomJoin.prototype.free;

/**
 * Ephemeral browser endpoint for one durable public or invitation-only Room.
 */
export class WebRoomSession {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WebRoomSessionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_webroomsession_free(ptr, 0);
    }
    /**
     * Apply every sequencer-selected external Commit since the last poll and
     * return a complete replacement `SFrame` key set for the new epoch.
     * @param {Uint8Array} wire
     * @returns {WebRoomEpoch | undefined}
     */
    applyEvents(wire) {
        const ptr0 = passArray8ToWasm0(wire, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webroomsession_applyEvents(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] === 0 ? undefined : WebRoomEpoch.__wrap(ret[0]);
    }
    /**
     * @returns {boolean}
     */
    get audio() {
        const ret = wasm.webroomsession_audio(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Instantiate a new live Room MLS group after obtaining one-use relay
     * credentials for the descriptor's full capacity.
     * @param {Uint8Array} instance_id
     * @param {string} media_address
     * @param {Uint8Array} relay_credentials
     * @returns {Uint8Array}
     */
    beginRoom(instance_id, media_address, relay_credentials) {
        const ptr0 = passArray8ToWasm0(instance_id, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(media_address, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(relay_credentials, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.webroomsession_beginRoom(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v4;
    }
    /**
     * @returns {Uint8Array}
     */
    get descriptorId() {
        const ret = wasm.webroomsession_descriptorId(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Bind the gateway's first-endpoint admission to the locally created
     * instance and return its current media epoch.
     * @param {Uint8Array} admission
     * @returns {WebRoomEpoch}
     */
    finishBootstrap(admission) {
        const ptr0 = passArray8ToWasm0(admission, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webroomsession_finishBootstrap(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WebRoomEpoch.__wrap(ret[0]);
    }
    /**
     * @returns {string}
     */
    get gatewayUrl() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webroomsession_gatewayUrl(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Build a candidate external Commit for the gateway's currently
     * advertised epoch.
     * @param {Uint8Array} admission
     * @returns {WebRoomJoin}
     */
    joinRoom(admission) {
        const ptr0 = passArray8ToWasm0(admission, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.webroomsession_joinRoom(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WebRoomJoin.__wrap(ret[0]);
    }
    /**
     * @returns {number}
     */
    get maximumOccupancy() {
        const ret = wasm.webroomsession_maximumOccupancy(this.__wbg_ptr);
        return ret;
    }
    /**
     * Validate a signed static Room descriptor and create one ephemeral
     * browser Device. No long-lived Yosemite account is required.
     * @param {string} descriptor_yaml
     * @param {number} now_unix_seconds
     * @param {Uint8Array} invitation_capability
     */
    constructor(descriptor_yaml, now_unix_seconds, invitation_capability) {
        const ptr0 = passStringToWasm0(descriptor_yaml, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(invitation_capability, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.webroomsession_new(ptr0, len0, now_unix_seconds, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WebRoomSessionFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    get relayUrl() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webroomsession_relayUrl(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get title() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.webroomsession_title(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {boolean}
     */
    get video() {
        const ret = wasm.webroomsession_video(this.__wbg_ptr);
        return ret !== 0;
    }
}
if (Symbol.dispose) WebRoomSession.prototype[Symbol.dispose] = WebRoomSession.prototype.free;

/**
 * Generate a CSPRNG call ID before asking the selected relay for one-use
 * endpoint credentials.
 * @returns {Uint8Array}
 */
export function newCallId() {
    const ret = wasm.newCallId();
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_ef53bc310eb298a0: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_is_function_754e9f305ff6029e: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_56732c2bc353f41d: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_c236cabd84a4d769: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_67b456be8673d3d7: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_throw_1506f2235d1bdba0: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_call_9c758de292015997: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_crypto_38df2bab126b63dc: function(arg0) {
            const ret = arg0.crypto;
            return ret;
        },
        __wbg_getRandomValues_c44a50d8cfdaebeb: function() { return handleError(function (arg0, arg1) {
            arg0.getRandomValues(arg1);
        }, arguments); },
        __wbg_getRandomValues_cc7f052a444bb2ce: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_getRandomValues_ceb34d8ffce7e87f: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_length_4a591ecaa01354d9: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_msCrypto_bd5a034af96bcba6: function(arg0) {
            const ret = arg0.msCrypto;
            return ret;
        },
        __wbg_new_with_length_36a4998e27b014c5: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_node_84ea875411254db1: function(arg0) {
            const ret = arg0.node;
            return ret;
        },
        __wbg_now_190933fa139cc119: function() {
            const ret = Date.now();
            return ret;
        },
        __wbg_now_f663ab0a5177b799: function() { return handleError(function () {
            const ret = Date.now();
            return ret;
        }, arguments); },
        __wbg_process_44c7a14e11e9f69e: function(arg0) {
            const ret = arg0.process;
            return ret;
        },
        __wbg_prototypesetcall_3249fc62a0fafa30: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_randomFillSync_6c25eac9869eb53c: function() { return handleError(function (arg0, arg1) {
            arg0.randomFillSync(arg1);
        }, arguments); },
        __wbg_require_b4edbdcf3e2a1ef0: function() { return handleError(function () {
            const ret = module.require;
            return ret;
        }, arguments); },
        __wbg_static_accessor_GLOBAL_9d53f2689e622ca1: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_a1a35cec07001a8a: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_4c59f6c7ea29a144: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_e70ae9f2eb052253: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_subarray_4aa221f6a4f5ab22: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_versions_276b2795b1c6a219: function(arg0) {
            const ret = arg0.versions;
            return ret;
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./yosemite_web_bg.js": import0,
    };
}

const WebAttachmentHasherFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webattachmenthasher_free(ptr, 1));
const WebCallReadyFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webcallready_free(ptr, 1));
const WebDecryptedFrameFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webdecryptedframe_free(ptr, 1));
const WebGatewayReplyFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webgatewayreply_free(ptr, 1));
const WebGuestSessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webguestsession_free(ptr, 1));
const WebMediaCryptorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webmediacryptor_free(ptr, 1));
const WebPromotionResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webpromotionresult_free(ptr, 1));
const WebRoomEpochFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webroomepoch_free(ptr, 1));
const WebRoomJoinFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webroomjoin_free(ptr, 1));
const WebRoomSessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_webroomsession_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('yosemite_web_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
