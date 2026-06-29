#[derive(Clone, Copy)]
pub(crate) enum RuntimeDomain {
    Read,
    AdminRead,
    CommerceRead,
    NostrRead,
    Admin,
}

impl RuntimeDomain {
    fn as_str(self) -> &'static str {
        match self {
            RuntimeDomain::Read => "read",
            RuntimeDomain::AdminRead => "admin-read",
            RuntimeDomain::CommerceRead => "commerce-read",
            RuntimeDomain::NostrRead => "nostr-read",
            RuntimeDomain::Admin => "admin",
        }
    }
}

pub(crate) fn action_allowed(domain: RuntimeDomain, action: &str) -> bool {
    if action.is_empty() {
        return false;
    }
    let expected_domain = domain.as_str();
    for line in include_str!("../cgi/gazeta-action-registry.conf").lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let mut fields = trimmed.split_whitespace();
        let Some(entry_domain) = fields.next() else {
            continue;
        };
        let Some(entry_action) = fields.next() else {
            continue;
        };
        if fields.next().is_some() {
            continue;
        }
        if entry_domain == expected_domain && entry_action == action {
            return true;
        }
    }
    false
}
