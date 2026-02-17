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

// Thread-local counter to ensure we generate a consistent keypair per session
// In a production system, this would be stored persistently
thread_local! {
    pub static SIGNER_CREATED: RefCell<bool> = RefCell::new(false);
    pub static CACHED_SIGNER: RefCell<Option<Vec<u8>>> = RefCell::new(None);
}

/// Get or create a signature keypair for the given ciphersuite
/// Note: In production, the keypair should be stored persistently (e.g., IndexedDB)
/// For this WASM implementation, we create it once per session
pub fn get_or_create_signer(ciphersuite: Ciphersuite) -> Result<SignatureKeyPair, CryptoError> {
    // For simplicity in WASM, we just create a new keypair
    // TODO: In production, serialize and store the keypair persistently
    SignatureKeyPair::new(ciphersuite.signature_algorithm())
}

/// Store a group in thread-local storage
pub fn store_group(group_id: Vec<u8>, group: MlsGroup) {
    GROUPS.with(|g| {
        g.borrow_mut().insert(group_id, group);
    });
}

/// Remove and return a group from thread-local storage
/// This is useful for operations that need mutable access
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

/// Clear all stored data (useful for testing)
#[cfg(test)]
pub fn clear_storage() {
    GROUPS.with(|g| g.borrow_mut().clear());
    KEY_PACKAGES.with(|kp| kp.borrow_mut().clear());
    SIGNER_CREATED.with(|sc| *sc.borrow_mut() = false);
    CACHED_SIGNER.with(|cs| *cs.borrow_mut() = None);
}
