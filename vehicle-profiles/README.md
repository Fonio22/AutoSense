# AutoSense vehicle profiles

Profiles are JSON v1 so they can be inspected on a phone, in Firebase Storage,
and over serial logs. The ESP32 executes only allowlisted `formulaId` values; the
human-readable `formula` field is for debugging.

Runtime flow:

1. The app pairs with the ESP32 over BLE.
2. The ESP32 reports device info and tries Mode 09 PID 02 VIN.
3. The app calls Firebase Functions to decode VIN and resolve a profile.
4. The app downloads `vehicle-profiles/{profileId}/{version}/profile.json`.
5. The app validates schema, size and SHA-256, then sends chunks to the ESP32.
6. The ESP32 validates the same read-only policy and stores only `/active_profile.json`.
7. Polling restarts from `signals[]`; extended UDS scanning only runs when the active profile contains `extendedReadOnly`.

Add a new vehicle without touching firmware:

1. Copy `generic_obd2.json`.
2. Set `profileId`, `version`, `vehicleMatch`, and only verified signals.
3. Run `node app/scripts/validate-vehicle-profiles.mjs`.
4. Add/adjust metadata used by Functions in `app/functions/src/profile-metadata.ts`.
5. Upload the profile to `vehicle-profiles/{profileId}/{version}/profile.json`.
6. Create/update `vehicleProfiles/{profileId}` metadata in Firestore if the client UI needs to list it.
7. Update `resolveProfile()` in `app/functions/src/index.ts` with the VIN match rule.
8. Test VIN resolution and confirm `READ-ONLY POLICY AUDIT OK` plus `guard=0` on the ESP32 dashboard.

Safety rules:

- Do not add OBD Mode 04 or Mode 08.
- Do not add UDS `0x11`, `0x14`, `0x27`, `0x28`, `0x2E`, `0x2F`, `0x31`, `0x3D` or `0x85`.
- Do not enable manufacturer-specific PIDs unless they are verified from project captures or manual hardware testing.
- Keep the JSON profile under 16 KB.
