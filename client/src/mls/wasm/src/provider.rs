// src/mls/wasm/src/provider.rs
// Shared OpenMLS crypto backend for the WASM session

use std::cell::RefCell;
use openmls_rust_crypto::OpenMlsRustCrypto;

thread_local! {
    /// Shared backend instance for the WASM session.
    /// Using a shared instance ensures all group operations write to the same storage,
    /// enabling full state persistence via export_state/import_state.
    pub static BACKEND: RefCell<OpenMlsRustCrypto> = RefCell::new(OpenMlsRustCrypto::default());
}
