// src/mls/wasm/src/lib.rs
// Real MLS implementation using OpenMLS 0.7

use std::collections::HashMap;

use hex;
use openmls::prelude::*;
use openmls::prelude::tls_codec::{Deserialize as TlsDeserializeTrait, Serialize as TlsSerializeTrait};
use openmls_traits::OpenMlsProvider;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

mod storage;
mod provider;

use storage::{get_or_create_signer, store_group, take_group, store_key_package, get_key_package};
use provider::BACKEND;

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
}

#[wasm_bindgen]
pub fn greet(name: &str) {
    alert(&format!("Hello, {}!", name));
}

#[derive(Serialize, Deserialize)]
#[wasm_bindgen]
pub struct MlsGroupState {
    group_id: String,
    epoch: u64,
    tree_hash: String,
    epoch_authenticator: String,
}

#[derive(Serialize, Deserialize)]
#[wasm_bindgen]
pub struct CommitOutput {
    proposals: Vec<String>,
    commit: String,
    welcome: Option<String>,
    epoch_authenticator: String,
}

/// Create a new MLS group
#[wasm_bindgen]
pub fn create_group(credential_identity: &[u8]) -> Result<String, JsValue> {
    BACKEND.with(|b| {
        let backend = b.borrow();
        let ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;

        let signer = get_or_create_signer(ciphersuite)
            .map_err(|e| JsValue::from_str(&e))?;

        let credential = BasicCredential::new(credential_identity.to_vec());
        let credential_with_key = CredentialWithKey {
            credential: credential.into(),
            signature_key: signer.public().into(),
        };

        let group_config = MlsGroupCreateConfig::default();
        let group = MlsGroup::new(
            &*backend,
            &signer,
            &group_config,
            credential_with_key,
        ).map_err(|e| JsValue::from_str(&format!("Failed to create group: {:?}", e)))?;

        let group_id = group.group_id().as_slice().to_vec();

        let state = MlsGroupState {
            group_id: hex::encode(&group_id),
            epoch: group.epoch().as_u64(),
            tree_hash: hex::encode(&group_id),
            epoch_authenticator: hex::encode(group.epoch_authenticator().as_slice()),
        };

        store_group(group_id, group);

        serde_json::to_string(&state)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))
    })
}

/// Generate a key package for joining groups
#[wasm_bindgen]
pub fn generate_key_package(credential_identity: &[u8]) -> Result<JsValue, JsValue> {
    BACKEND.with(|b| {
        let backend = b.borrow();
        let ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;

        let signer = get_or_create_signer(ciphersuite)
            .map_err(|e| JsValue::from_str(&e))?;

        let credential = BasicCredential::new(credential_identity.to_vec());
        let credential_with_key = CredentialWithKey {
            credential: credential.clone().into(),
            signature_key: signer.public().into(),
        };

        let key_package = KeyPackage::builder()
            .build(ciphersuite, &*backend, &signer, credential_with_key)
            .map_err(|e| JsValue::from_str(&format!("Failed to build key package: {:?}", e)))?;

        let hash_ref = key_package.key_package().hash_ref(backend.crypto())
            .map_err(|e| JsValue::from_str(&format!("Failed to compute hash ref: {:?}", e)))?;
        store_key_package(hash_ref.as_slice().to_vec(), key_package.clone());

        let leaf_node = key_package.key_package().leaf_node();
        let output = serde_json::json!({
            "data": hex::encode(
                key_package
                    .key_package()
                    .tls_serialize_detached()
                    .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))?
            ),
            "signature": hex::encode(
                leaf_node.signature()
                    .tls_serialize_detached()
                    .map_err(|e| JsValue::from_str(&format!("Signature serialization error: {:?}", e)))?
            ),
            "hpke_public_key": hex::encode(
                leaf_node.encryption_key()
                    .tls_serialize_detached()
                    .map_err(|e| JsValue::from_str(&format!("Public key serialization error: {:?}", e)))?
            ),
            "credential": hex::encode(credential.identity()),
            "extensions": {
                "capabilities": {
                    "versions": ["1.0"],
                    "cipher_suites": ["MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519"],
                    "extensions": ["application_id", "ratchet_tree"]
                },
                "lifetime": {
                    "not_before": 0,
                    "not_after": 7 * 24 * 60 * 60 * 1000u64
                }
            }
        });

        serde_wasm_bindgen::to_value(&output)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))
    })
}

/// Add a member to the group
#[wasm_bindgen]
pub fn add_member(group_id_hex: &str, key_package_hex: &str) -> Result<String, JsValue> {
    let group_id = hex::decode(group_id_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid group ID hex: {:?}", e)))?;

    BACKEND.with(|b| {
        let backend = b.borrow();

        let mut group = take_group(&group_id)
            .ok_or_else(|| JsValue::from_str("Group not found"))?;

        let result = (|| -> Result<String, JsValue> {
            let kp_bytes = hex::decode(key_package_hex)
                .map_err(|e| JsValue::from_str(&format!("Invalid key package hex: {:?}", e)))?;
            let key_package_in = KeyPackageIn::tls_deserialize(&mut kp_bytes.as_slice())
                .map_err(|e| JsValue::from_str(&format!("Invalid key package: {:?}", e)))?;

            let key_package = key_package_in.validate(backend.crypto(), ProtocolVersion::default())
                .map_err(|e| JsValue::from_str(&format!("Key package validation failed: {:?}", e)))?;

            let signer = get_or_create_signer(group.ciphersuite())
                .map_err(|e| JsValue::from_str(&e))?;

            let (commit, welcome, _group_info) = group.add_members(&*backend, &signer, &[key_package])
                .map_err(|e| JsValue::from_str(&format!("Failed to add member: {:?}", e)))?;

            group.merge_pending_commit(&*backend)
                .map_err(|e| JsValue::from_str(&format!("Failed to merge commit: {:?}", e)))?;

            let output = CommitOutput {
                proposals: vec![],
                commit: hex::encode(commit.tls_serialize_detached()
                    .map_err(|e| JsValue::from_str(&format!("Commit serialization error: {:?}", e)))?),
                welcome: Some(hex::encode(welcome.tls_serialize_detached()
                    .map_err(|e| JsValue::from_str(&format!("Welcome serialization error: {:?}", e)))?)),
                epoch_authenticator: hex::encode(group.epoch_authenticator().as_slice()),
            };

            serde_json::to_string(&output)
                .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))
        })();

        // Always restore group to WASM storage, even on error
        store_group(group_id.clone(), group);

        result
    })
}

/// Process a welcome message to join a group
#[wasm_bindgen]
pub fn process_welcome(welcome_hex: &str, key_package_ref_hex: &str) -> Result<String, JsValue> {
    BACKEND.with(|b| {
        let backend = b.borrow();

        let welcome_bytes = hex::decode(welcome_hex)
            .map_err(|e| JsValue::from_str(&format!("Invalid welcome hex: {:?}", e)))?;
        let welcome_msg = MlsMessageIn::tls_deserialize(&mut welcome_bytes.as_slice())
            .map_err(|e| JsValue::from_str(&format!("Invalid welcome message: {:?}", e)))?;

        let welcome = match welcome_msg.extract() {
            MlsMessageBodyIn::Welcome(w) => w,
            _ => return Err(JsValue::from_str("Not a welcome message")),
        };

        let kp_ref = hex::decode(key_package_ref_hex)
            .map_err(|e| JsValue::from_str(&format!("Invalid key package ref hex: {:?}", e)))?;
        let _bundle = get_key_package(&kp_ref)
            .ok_or_else(|| JsValue::from_str("Key package bundle not found in storage"))?;

        let join_config = MlsGroupJoinConfig::default();
        let staged_welcome = StagedWelcome::new_from_welcome(
            &*backend,
            &join_config,
            welcome,
            None,
        ).map_err(|e| JsValue::from_str(&format!("Failed to stage welcome: {:?}", e)))?;

        let group = staged_welcome.into_group(&*backend)
            .map_err(|e| JsValue::from_str(&format!("Failed to join group: {:?}", e)))?;

        let group_id = group.group_id().as_slice().to_vec();

        let state = MlsGroupState {
            group_id: hex::encode(&group_id),
            epoch: group.epoch().as_u64(),
            tree_hash: hex::encode(&group_id),
            epoch_authenticator: hex::encode(group.epoch_authenticator().as_slice()),
        };

        store_group(group_id, group);

        serde_json::to_string(&state)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))
    })
}

/// Apply a commit to advance the group epoch
#[wasm_bindgen]
pub fn apply_commit(group_id_hex: &str, commit_hex: &str) -> Result<String, JsValue> {
    let group_id = hex::decode(group_id_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid group ID hex: {:?}", e)))?;

    BACKEND.with(|b| {
        let backend = b.borrow();

        let mut group = take_group(&group_id)
            .ok_or_else(|| JsValue::from_str("Group not found"))?;

        let result = (|| -> Result<String, JsValue> {
            let commit_bytes = hex::decode(commit_hex)
                .map_err(|e| JsValue::from_str(&format!("Invalid commit hex: {:?}", e)))?;
            let message = MlsMessageIn::tls_deserialize(&mut commit_bytes.as_slice())
                .map_err(|e| JsValue::from_str(&format!("Invalid commit message: {:?}", e)))?;

            let protocol_message = match message.extract() {
                MlsMessageBodyIn::PublicMessage(pm) => ProtocolMessage::from(pm),
                MlsMessageBodyIn::PrivateMessage(pm) => ProtocolMessage::from(pm),
                _ => return Err(JsValue::from_str("Unexpected message type")),
            };

            let processed = group.process_message(&*backend, protocol_message)
                .map_err(|e| JsValue::from_str(&format!("Failed to process commit: {:?}", e)))?;

            match processed.into_content() {
                ProcessedMessageContent::StagedCommitMessage(staged_commit) => {
                    group.merge_staged_commit(&*backend, *staged_commit)
                        .map_err(|e| JsValue::from_str(&format!("Failed to merge commit: {:?}", e)))?;
                },
                _ => return Err(JsValue::from_str("Expected a commit message")),
            }

            let state = MlsGroupState {
                group_id: hex::encode(&group_id),
                epoch: group.epoch().as_u64(),
                tree_hash: hex::encode(&group_id),
                epoch_authenticator: hex::encode(group.epoch_authenticator().as_slice()),
            };

            serde_json::to_string(&state)
                .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))
        })();

        // Always restore group to WASM storage, even on error
        store_group(group_id.clone(), group);

        result
    })
}

/// Encrypt a message for the group
#[wasm_bindgen]
pub fn encrypt(group_id_hex: &str, plaintext: &str) -> Result<String, JsValue> {
    let group_id = hex::decode(group_id_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid group ID hex: {:?}", e)))?;

    BACKEND.with(|b| {
        let backend = b.borrow();

        let mut group = take_group(&group_id)
            .ok_or_else(|| JsValue::from_str("Group not found"))?;

        let result = (|| -> Result<String, JsValue> {
            let signer = get_or_create_signer(group.ciphersuite())
                .map_err(|e| JsValue::from_str(&e))?;

            let message = group.create_message(&*backend, &signer, plaintext.as_bytes())
                .map_err(|e| JsValue::from_str(&format!("Encryption failed: {:?}", e)))?;

            let ciphertext = message.tls_serialize_detached()
                .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))?;
            Ok(hex::encode(ciphertext))
        })();

        // Always restore group to WASM storage, even on error
        store_group(group_id.clone(), group);

        result
    })
}

/// Decrypt a message from the group
#[wasm_bindgen]
pub fn decrypt(group_id_hex: &str, ciphertext_hex: &str) -> Result<String, JsValue> {
    let group_id = hex::decode(group_id_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid group ID hex: {:?}", e)))?;

    BACKEND.with(|b| {
        let backend = b.borrow();

        let mut group = take_group(&group_id)
            .ok_or_else(|| JsValue::from_str("Group not found"))?;

        let result = (|| -> Result<String, JsValue> {
            let ct_bytes = hex::decode(ciphertext_hex)
                .map_err(|e| JsValue::from_str(&format!("Invalid ciphertext hex: {:?}", e)))?;
            let message = MlsMessageIn::tls_deserialize(&mut ct_bytes.as_slice())
                .map_err(|e| JsValue::from_str(&format!("Invalid message: {:?}", e)))?;

            let protocol_message = match message.extract() {
                MlsMessageBodyIn::PublicMessage(pm) => ProtocolMessage::from(pm),
                MlsMessageBodyIn::PrivateMessage(pm) => ProtocolMessage::from(pm),
                _ => return Err(JsValue::from_str("Unexpected message type")),
            };

            let processed = group.process_message(&*backend, protocol_message)
                .map_err(|e| JsValue::from_str(&format!("Decryption failed: {:?}", e)))?;

            match processed.into_content() {
                ProcessedMessageContent::ApplicationMessage(app_msg) => {
                    let plaintext = String::from_utf8(app_msg.into_bytes())
                        .map_err(|_| JsValue::from_str("Invalid UTF-8 in plaintext"))?;
                    Ok(plaintext)
                },
                _ => Err(JsValue::from_str("Not an application message")),
            }
        })();

        // Always restore group to WASM storage, even on error
        store_group(group_id.clone(), group);

        result
    })
}

/// Create an update proposal for forward secrecy
#[wasm_bindgen]
pub fn create_update_proposal(group_id_hex: &str) -> Result<String, JsValue> {
    let group_id = hex::decode(group_id_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid group ID hex: {:?}", e)))?;

    BACKEND.with(|b| {
        let backend = b.borrow();

        let mut group = take_group(&group_id)
            .ok_or_else(|| JsValue::from_str("Group not found"))?;

        let result = (|| -> Result<String, JsValue> {
            let signer = get_or_create_signer(group.ciphersuite())
                .map_err(|e| JsValue::from_str(&e))?;

            let leaf_node_params = LeafNodeParameters::default();
            let (proposal, _proposal_ref) = group.propose_self_update(&*backend, &signer, leaf_node_params)
                .map_err(|e| JsValue::from_str(&format!("Failed to create update proposal: {:?}", e)))?;

            let proposal_bytes = proposal.tls_serialize_detached()
                .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))?;
            Ok(hex::encode(proposal_bytes))
        })();

        // Always restore group to WASM storage, even on error
        store_group(group_id.clone(), group);

        result
    })
}

/// Export the full WASM state (backend storage + signer) as a JSON string.
/// Call this after important operations (create_group, process_welcome, add_member)
/// and save the result to persistent storage (IndexedDB) to enable cross-session restore.
#[wasm_bindgen]
pub fn export_state() -> Result<String, JsValue> {
    // Serialize all key-value pairs from the shared backend's MemoryStorage
    let storage_hex_map: HashMap<String, String> = BACKEND.with(|b| -> Result<HashMap<String, String>, JsValue> {
        let backend = b.borrow();
        let storage = backend.storage();
        let values = storage.values.read()
            .map_err(|_| JsValue::from_str("Storage lock poisoned"))?;
        Ok(values.iter()
            .map(|(k, v)| (hex::encode(k), hex::encode(v)))
            .collect())
    })?;

    let signer_json = storage::get_signer_json();

    let state = serde_json::json!({
        "storage": storage_hex_map,
        "signer": signer_json,
    });

    serde_json::to_string(&state)
        .map_err(|e| JsValue::from_str(&format!("State serialization failed: {}", e)))
}

/// Import previously exported WASM state.
/// Call this on app start before calling load_group to restore groups from storage.
#[wasm_bindgen]
pub fn import_state(state_json: &str) -> Result<(), JsValue> {
    #[derive(Deserialize)]
    struct WasmState {
        storage: HashMap<String, String>,
        signer: Option<String>,
    }

    let state: WasmState = serde_json::from_str(state_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid state JSON: {}", e)))?;

    // Restore backend storage values
    BACKEND.with(|b| -> Result<(), JsValue> {
        let backend = b.borrow();
        let storage = backend.storage();
        let mut values = storage.values.write()
            .map_err(|_| JsValue::from_str("Storage lock poisoned"))?;
        values.clear();
        for (k_hex, v_hex) in &state.storage {
            let k = hex::decode(k_hex)
                .map_err(|e| JsValue::from_str(&format!("Invalid storage key hex: {}", e)))?;
            let v = hex::decode(v_hex)
                .map_err(|e| JsValue::from_str(&format!("Invalid storage value hex: {}", e)))?;
            values.insert(k, v);
        }
        Ok(())
    })?;

    // Restore signer
    if let Some(signer_json) = state.signer {
        storage::set_signer_json(signer_json);
    }

    Ok(())
}

/// Load a previously persisted MLS group from the shared backend's storage.
/// Call this after import_state to restore groups into the in-memory GROUPS map.
/// group_id_hex is the MLS group ID (hex-encoded), as returned by create_group/process_welcome.
#[wasm_bindgen]
pub fn load_group(group_id_hex: &str) -> Result<String, JsValue> {
    let group_id_bytes = hex::decode(group_id_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid group ID hex: {:?}", e)))?;
    let group_id = GroupId::from_slice(&group_id_bytes);

    BACKEND.with(|b| {
        let backend = b.borrow();

        let group = MlsGroup::load(backend.storage(), &group_id)
            .map_err(|e| JsValue::from_str(&format!("Failed to load group from storage: {:?}", e)))?
            .ok_or_else(|| JsValue::from_str("Group not found in storage"))?;

        let state = MlsGroupState {
            group_id: hex::encode(&group_id_bytes),
            epoch: group.epoch().as_u64(),
            tree_hash: hex::encode(&group_id_bytes),
            epoch_authenticator: hex::encode(group.epoch_authenticator().as_slice()),
        };

        store_group(group_id_bytes.clone(), group);

        serde_json::to_string(&state)
            .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))
    })
}
