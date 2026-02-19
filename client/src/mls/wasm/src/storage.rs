// src/mls/wasm/src/storage.rs
// Thread-local storage for MLS groups, key packages, and signature keypairs
// This storage persists for the duration of the WASM session

use std::cell::RefCell;
use std::collections::HashMap;
use openmls::prelude::*;
use openmls_basic_credential::SignatureKeyPair;

// Thread-local storage for MLS groups indexed by group_id
thread_local! {
    pub static GROUPS: RefCell<HashMap<Vec<u8>, MlsGroup>> = RefCell::new(HashMap::new());
}

// Thread-local storage for KeyPackageBundle indexed by hash_ref
thread_local! {
    pub static KEY_PACKAGES: RefCell<HashMap<Vec<u8>, KeyPackageBundle>> = RefCell::new(HashMap::new());
}

// Cached signer as JSON string for cross-session persistence.
// The same signer must be used across sessions because the group's leaf node
// contains the signer's public key.
thread_local! {
    static SIGNER_JSON: RefCell<Option<String>> = RefCell::new(None);
}

/// Get or create a signature keypair for the given ciphersuite.
/// The keypair is cached in-session and serializable for cross-session persistence.
pub fn get_or_create_signer(ciphersuite: Ciphersuite) -> Result<SignatureKeyPair, String> {
    SIGNER_JSON.with(|sj| {
        let mut opt = sj.borrow_mut();
        if let Some(ref json) = *opt {
            return serde_json::from_str(json)
                .map_err(|e| format!("Failed to deserialize signer: {}", e));
        }
        let signer = SignatureKeyPair::new(ciphersuite.signature_algorithm())
            .map_err(|e| format!("Failed to create signer: {:?}", e))?;
        let json = serde_json::to_string(&signer)
            .map_err(|e| format!("Failed to serialize signer: {}", e))?;
        *opt = Some(json);
        Ok(signer)
    })
}

/// Get the serialized signer JSON for persistence (None if no signer yet)
pub fn get_signer_json() -> Option<String> {
    SIGNER_JSON.with(|sj| sj.borrow().clone())
}

/// Restore the signer from a serialized JSON string (called during import_state)
pub fn set_signer_json(json: String) {
    SIGNER_JSON.with(|sj| *sj.borrow_mut() = Some(json));
}

/// Store a group in thread-local storage
pub fn store_group(group_id: Vec<u8>, group: MlsGroup) {
    GROUPS.with(|g| {
        g.borrow_mut().insert(group_id, group);
    });
}

/// Remove and return a group from thread-local storage
/// This is used for operations that need mutable access (take → mutate → store back)
pub fn take_group(group_id: &[u8]) -> Option<MlsGroup> {
    GROUPS.with(|g| {
        g.borrow_mut().remove(group_id)
    })
}

/// Store a key package bundle in thread-local storage
pub fn store_key_package(hash_ref: Vec<u8>, bundle: KeyPackageBundle) {
    KEY_PACKAGES.with(|kp| {
        kp.borrow_mut().insert(hash_ref, bundle);
    });
}

/// Retrieve a key package bundle from thread-local storage
pub fn get_key_package(hash_ref: &[u8]) -> Option<KeyPackageBundle> {
    KEY_PACKAGES.with(|kp| {
        kp.borrow().get(hash_ref).cloned()
    })
}
