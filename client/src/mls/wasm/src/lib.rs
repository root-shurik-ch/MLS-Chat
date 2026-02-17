// src/mls/wasm/src/lib.rs
// Real MLS implementation using OpenMLS 0.7

use hex;
use openmls::prelude::*;
use openmls::prelude::tls_codec::{Deserialize as TlsDeserializeTrait, Serialize as TlsSerializeTrait};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

mod storage;
mod provider;

use storage::{get_or_create_signer, store_group, take_group, store_key_package, get_key_package};
use provider::get_backend;

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

// KeyPackageOutput is manually constructed and returned as JsValue
// We don't derive Serialize/Deserialize since it contains JsValue

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
    let backend = get_backend();
    let ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;

    // Get or create signature keypair
    let signer = get_or_create_signer(ciphersuite)
        .map_err(|e| JsValue::from_str(&format!("Failed to create signer: {:?}", e)))?;

    // Create credential
    let credential = BasicCredential::new(credential_identity.to_vec());
    let credential_with_key = CredentialWithKey {
        credential: credential.into(),
        signature_key: signer.public().into(),
    };

    // Create MLS group with default configuration
    let group_config = MlsGroupCreateConfig::default();
    let group = MlsGroup::new(
        &backend,
        &signer,
        &group_config,
        credential_with_key,
    ).map_err(|e| JsValue::from_str(&format!("Failed to create group: {:?}", e)))?;

    // Store group
    let group_id = group.group_id().as_slice().to_vec();

    // Serialize state
    let state = MlsGroupState {
        group_id: hex::encode(&group_id),
        epoch: group.epoch().as_u64(),
        tree_hash: hex::encode(&group_id), // Placeholder - tree_hash API changed in OpenMLS 0.7
        epoch_authenticator: hex::encode(group.epoch_authenticator().as_slice()),
    };

    store_group(group_id, group);

    serde_json::to_string(&state)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))
}

/// Generate a key package for joining groups
#[wasm_bindgen]
pub fn generate_key_package(credential_identity: &[u8]) -> Result<JsValue, JsValue> {
    let backend = get_backend();
    let ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;

    // Get or create signature keypair
    let signer = get_or_create_signer(ciphersuite)
        .map_err(|e| JsValue::from_str(&format!("Failed to create signer: {:?}", e)))?;

    // Create credential
    let credential = BasicCredential::new(credential_identity.to_vec());
    let credential_with_key = CredentialWithKey {
        credential: credential.clone().into(),
        signature_key: signer.public().into(),
    };

    // Create key package
    let key_package = KeyPackage::builder()
        .build(ciphersuite, &backend, &signer, credential_with_key)
        .map_err(|e| JsValue::from_str(&format!("Failed to build key package: {:?}", e)))?;

    // Store key package bundle for later use during welcome processing
    let hash_ref = key_package.key_package().hash_ref(backend.crypto())
        .map_err(|e| JsValue::from_str(&format!("Failed to compute hash ref: {:?}", e)))?;
    store_key_package(hash_ref.as_slice().to_vec(), key_package.clone());

    // Serialize and return as JSON
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
                "not_after": 7 * 24 * 60 * 60 * 1000 // 1 week
            }
        }
    });

    serde_wasm_bindgen::to_value(&output)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))
}

/// Add a member to the group
#[wasm_bindgen]
pub fn add_member(group_id_hex: &str, key_package_hex: &str) -> Result<String, JsValue> {
    let backend = get_backend();
    let group_id = hex::decode(group_id_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid group ID hex: {:?}", e)))?;

    // Get group (mutable borrow by removing from storage)
    let mut group = take_group(&group_id)
        .ok_or(JsValue::from_str("Group not found"))?;

    // Deserialize key package
    let kp_bytes = hex::decode(key_package_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid key package hex: {:?}", e)))?;
    let key_package_in = KeyPackageIn::tls_deserialize(&mut kp_bytes.as_slice())
        .map_err(|e| JsValue::from_str(&format!("Invalid key package: {:?}", e)))?;

    // Validate key package
    let key_package = key_package_in.validate(backend.crypto(), ProtocolVersion::default())
        .map_err(|e| JsValue::from_str(&format!("Key package validation failed: {:?}", e)))?;

    // Add member - this creates a commit and welcome message
    let signer = get_or_create_signer(group.ciphersuite())
        .map_err(|e| JsValue::from_str(&format!("Failed to get signer: {:?}", e)))?;

    let (commit, welcome, _group_info) = group.add_members(&backend, &signer, &[key_package])
        .map_err(|e| JsValue::from_str(&format!("Failed to add member: {:?}", e)))?;

    // Merge commit locally
    group.merge_pending_commit(&backend)
        .map_err(|e| JsValue::from_str(&format!("Failed to merge commit: {:?}", e)))?;

    // Serialize output before storing
    let output = CommitOutput {
        proposals: vec![],
        commit: hex::encode(commit.tls_serialize_detached()
            .map_err(|e| JsValue::from_str(&format!("Commit serialization error: {:?}", e)))?),
        welcome: Some(hex::encode(welcome.tls_serialize_detached()
            .map_err(|e| JsValue::from_str(&format!("Welcome serialization error: {:?}", e)))?)),
        epoch_authenticator: hex::encode(group.epoch_authenticator().as_slice()),
    };

    // Store updated group (move without cloning)
    store_group(group_id, group);

    serde_json::to_string(&output)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))
}

/// Process a welcome message to join a group
#[wasm_bindgen]
pub fn process_welcome(welcome_hex: &str, key_package_ref_hex: &str) -> Result<String, JsValue> {
    let backend = get_backend();

    // Deserialize welcome
    let welcome_bytes = hex::decode(welcome_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid welcome hex: {:?}", e)))?;
    let welcome_msg = MlsMessageIn::tls_deserialize(&mut welcome_bytes.as_slice())
        .map_err(|e| JsValue::from_str(&format!("Invalid welcome message: {:?}", e)))?;

    let welcome = match welcome_msg.extract() {
        MlsMessageBodyIn::Welcome(w) => w,
        _ => return Err(JsValue::from_str("Not a welcome message")),
    };

    // Get key package bundle from storage
    let kp_ref = hex::decode(key_package_ref_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid key package ref hex: {:?}", e)))?;
    let _bundle = get_key_package(&kp_ref)
        .ok_or(JsValue::from_str("Key package bundle not found in storage"))?;

    // Process welcome with default configuration
    let join_config = MlsGroupJoinConfig::default();
    let staged_welcome = StagedWelcome::new_from_welcome(
        &backend,
        &join_config,
        welcome,
        None,
    ).map_err(|e| JsValue::from_str(&format!("Failed to stage welcome: {:?}", e)))?;

    let group = staged_welcome.into_group(&backend)
        .map_err(|e| JsValue::from_str(&format!("Failed to join group: {:?}", e)))?;

    // Store group
    let group_id = group.group_id().as_slice().to_vec();

    // Serialize state
    let state = MlsGroupState {
        group_id: hex::encode(&group_id),
        epoch: group.epoch().as_u64(),
        tree_hash: hex::encode(&group_id), // Placeholder - tree_hash API changed in OpenMLS 0.7
        epoch_authenticator: hex::encode(group.epoch_authenticator().as_slice()),
    };

    store_group(group_id, group);

    serde_json::to_string(&state)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))
}

/// Apply a commit to advance the group epoch
#[wasm_bindgen]
pub fn apply_commit(group_id_hex: &str, commit_hex: &str) -> Result<String, JsValue> {
    let backend = get_backend();
    let group_id = hex::decode(group_id_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid group ID hex: {:?}", e)))?;

    // Get group (mutable borrow by removing from storage)
    let mut group = take_group(&group_id)
        .ok_or(JsValue::from_str("Group not found"))?;

    // Deserialize commit
    let commit_bytes = hex::decode(commit_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid commit hex: {:?}", e)))?;
    let message = MlsMessageIn::tls_deserialize(&mut commit_bytes.as_slice())
        .map_err(|e| JsValue::from_str(&format!("Invalid commit message: {:?}", e)))?;

    // Extract protocol message from MlsMessageIn
    let protocol_message = match message.extract() {
        MlsMessageBodyIn::PublicMessage(pm) => ProtocolMessage::from(pm),
        MlsMessageBodyIn::PrivateMessage(pm) => ProtocolMessage::from(pm),
        _ => return Err(JsValue::from_str("Unexpected message type")),
    };

    // Process commit
    let processed = group.process_message(&backend, protocol_message)
        .map_err(|e| JsValue::from_str(&format!("Failed to process commit: {:?}", e)))?;

    // Merge if it's a staged commit
    match processed.into_content() {
        ProcessedMessageContent::StagedCommitMessage(staged_commit) => {
            group.merge_staged_commit(&backend, *staged_commit)
                .map_err(|e| JsValue::from_str(&format!("Failed to merge commit: {:?}", e)))?;
        },
        _ => return Err(JsValue::from_str("Expected a commit message")),
    }

    // Serialize updated state before storing
    let state = MlsGroupState {
        group_id: hex::encode(&group_id),
        epoch: group.epoch().as_u64(),
        tree_hash: hex::encode(&group_id), // Placeholder - tree_hash API changed in OpenMLS 0.7
        epoch_authenticator: hex::encode(group.epoch_authenticator().as_slice()),
    };

    // Store updated group (move without cloning)
    store_group(group_id, group);

    serde_json::to_string(&state)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))
}

/// Encrypt a message for the group
#[wasm_bindgen]
pub fn encrypt(group_id_hex: &str, plaintext: &str) -> Result<String, JsValue> {
    let backend = get_backend();
    let group_id = hex::decode(group_id_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid group ID hex: {:?}", e)))?;

    // Get group (mutable borrow by removing from storage)
    let mut group = take_group(&group_id)
        .ok_or(JsValue::from_str("Group not found"))?;

    let signer = get_or_create_signer(group.ciphersuite())
        .map_err(|e| JsValue::from_str(&format!("Failed to get signer: {:?}", e)))?;

    // Create application message
    let message = group.create_message(&backend, &signer, plaintext.as_bytes())
        .map_err(|e| JsValue::from_str(&format!("Encryption failed: {:?}", e)))?;

    // Store group back
    store_group(group_id, group);

    // Serialize and return as hex
    let ciphertext = message.tls_serialize_detached()
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))?;
    Ok(hex::encode(ciphertext))
}

/// Decrypt a message from the group
#[wasm_bindgen]
pub fn decrypt(group_id_hex: &str, ciphertext_hex: &str) -> Result<String, JsValue> {
    let backend = get_backend();
    let group_id = hex::decode(group_id_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid group ID hex: {:?}", e)))?;

    // Get group (mutable borrow by removing from storage)
    let mut group = take_group(&group_id)
        .ok_or(JsValue::from_str("Group not found"))?;

    // Deserialize ciphertext
    let ct_bytes = hex::decode(ciphertext_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid ciphertext hex: {:?}", e)))?;
    let message = MlsMessageIn::tls_deserialize(&mut ct_bytes.as_slice())
        .map_err(|e| JsValue::from_str(&format!("Invalid message: {:?}", e)))?;

    // Extract protocol message from MlsMessageIn
    let protocol_message = match message.extract() {
        MlsMessageBodyIn::PublicMessage(pm) => ProtocolMessage::from(pm),
        MlsMessageBodyIn::PrivateMessage(pm) => ProtocolMessage::from(pm),
        _ => return Err(JsValue::from_str("Unexpected message type")),
    };

    // Process message
    let processed = group.process_message(&backend, protocol_message)
        .map_err(|e| JsValue::from_str(&format!("Decryption failed: {:?}", e)))?;

    // Store group back
    store_group(group_id, group);

    // Extract plaintext
    match processed.into_content() {
        ProcessedMessageContent::ApplicationMessage(app_msg) => {
            let plaintext = String::from_utf8(app_msg.into_bytes())
                .map_err(|_| JsValue::from_str("Invalid UTF-8 in plaintext"))?;
            Ok(plaintext)
        },
        _ => Err(JsValue::from_str("Not an application message")),
    }
}

/// Create an update proposal for forward secrecy
#[wasm_bindgen]
pub fn create_update_proposal(group_id_hex: &str) -> Result<String, JsValue> {
    let backend = get_backend();
    let group_id = hex::decode(group_id_hex)
        .map_err(|e| JsValue::from_str(&format!("Invalid group ID hex: {:?}", e)))?;

    // Get group (mutable borrow by removing from storage)
    let mut group = take_group(&group_id)
        .ok_or(JsValue::from_str("Group not found"))?;

    let signer = get_or_create_signer(group.ciphersuite())
        .map_err(|e| JsValue::from_str(&format!("Failed to get signer: {:?}", e)))?;

    // Create update proposal
    let leaf_node_params = LeafNodeParameters::default();
    let (proposal, _proposal_ref) = group.propose_self_update(&backend, &signer, leaf_node_params)
        .map_err(|e| JsValue::from_str(&format!("Failed to create update proposal: {:?}", e)))?;

    // Store group back
    store_group(group_id, group);

    // Serialize proposal
    let proposal_bytes = proposal.tls_serialize_detached()
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {:?}", e)))?;
    Ok(hex::encode(proposal_bytes))
}
