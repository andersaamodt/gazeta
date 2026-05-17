(function () {
  function normalizePublishDestination(raw) {
    var value = String(raw || '').trim().toLowerCase();
    return value === 'nostr_now' ? 'nostr_now' : 'local_only';
  }

  function normalizePublishMode(raw) {
    var value = String(raw || '').trim().toLowerCase();
    if (value === 'scheduled' || value === 'drip' || value === 'immediate') {
      return value;
    }
    return 'immediate';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function primaryPublishLabel(mode, destination, opts) {
    var options = opts || {};
    if (options.postTypeLocked) {
      return 'Publish Changes';
    }
    var pickedMode = normalizePublishMode(mode);
    if (pickedMode === 'scheduled') {
      return 'Schedule Post';
    }
    if (pickedMode === 'drip') {
      return 'Enqueue Post';
    }
    return normalizePublishDestination(destination) === 'local_only' ? 'Publish to Server' : 'Publish to Nostr';
  }

  function renderPublishDestinationField(opts) {
    var options = opts || {};
    var inputName = String(options.inputName || 'compose-destination');
    var destination = normalizePublishDestination(options.destination);
    return '' +
      '<strong>Publish to</strong>' +
      '<div class="mode-row">' +
        '<label><input type="radio" name="' + escapeHtml(inputName) + '" value="local_only"' + (destination === 'local_only' ? ' checked' : '') + '> Server only</label>' +
        '<label><input type="radio" name="' + escapeHtml(inputName) + '" value="nostr_now"' + (destination === 'nostr_now' ? ' checked' : '') + '> Server + Nostr</label>' +
      '</div>';
  }

  window.BlogComposeShared = {
    normalizePublishDestination: normalizePublishDestination,
    normalizePublishMode: normalizePublishMode,
    primaryPublishLabel: primaryPublishLabel,
    renderPublishDestinationField: renderPublishDestinationField
  };
})();
