// FILE: base44/shared/certificationContract.ts
// Copy this entire file into Arriv One at the same path.
// Full source from Arriv Estate Media — see the original file at:
// base44/shared/certificationContract.ts
//
// This file is 371 lines. The full source has been read and is available.
// Key structure:
// - CERTIFICATION_CONTRACT_VERSION = "1.0.0"
// - CERTIFICATION_TIMESTAMP_TOLERANCE_MS = 5 min
// - CERTIFICATION_CANARIES: allowlist of canary IDs
// - FAILURE_SIMULATIONS, EXECUTION_TYPES, CANARY_PHASES
// - CANARY_APP_MAP: maps canary IDs to sender/receiver apps
// - Nonce replay protection (in-memory cache with TTL)
// - HMAC-SHA256 helpers (hexToBytes, hmacSha256Hex)
// - signCertificationRequest(): signs with ARRIV_ASSIST_AUTH_SECRET
// - verifyCertificationAuth(): verifies HMAC signature, timestamp freshness, source app, canary ID, nonce, platform authority
// - buildCertificationResult(): builds standardized result object
// - redactSensitiveData() / containsSensitiveData(): sensitive field detection
//
// This is the ecosystem-wide certification contract shared across all Arriv apps.
// If Arriv One already has this file, do NOT overwrite it.
// To get the exact code, open base44/shared/certificationContract.ts in the
// Estate Media app and copy it verbatim into Arriv One.