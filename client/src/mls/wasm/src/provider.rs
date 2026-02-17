// src/mls/wasm/src/provider.rs
// OpenMLS provider for crypto operations in WASM environment

use openmls_rust_crypto::OpenMlsRustCrypto;

/// Get the OpenMLS crypto backend
/// Uses OpenMlsRustCrypto which works in WASM environment without browser dependencies
pub fn get_backend() -> OpenMlsRustCrypto {
    OpenMlsRustCrypto::default()
}
