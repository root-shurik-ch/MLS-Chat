use openmls::prelude::*;
use openmls_basic_credential::SignatureKeyPair;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
}

#[wasm_bindgen]
pub fn greet(name: &str) {
    alert(&format!("Hello, {}!", name));
}

#[wasm_bindgen]
pub fn create_group() -> String {
    "Group created".to_string()
}

#[wasm_bindgen]
pub fn encrypt(message: &str) -> String {
    format!("Encrypted: {}", message)
}
