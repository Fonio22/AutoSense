import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeDecodedVin, resolveProfile } from '../lib/index.js';

test('resolves Volkswagen Passat 2016 to vw_passat_2016', () => {
  const decodedVin = normalizeDecodedVin('TESTVIN1234567890', {
    ModelYear: '2016',
    Make: 'Volkswagen',
    Model: 'Passat',
    Trim: 'SE',
    FuelTypePrimary: 'Gasoline',
  });

  assert.deepEqual(resolveProfile(decodedVin), {
    profileId: 'vw_passat_2016',
    supportStatus: 'full',
  });
});

test('resolves unsupported vehicles to generic partial support', () => {
  const decodedVin = normalizeDecodedVin('TESTVIN1234567890', {
    ModelYear: '2020',
    Make: 'Toyota',
    Model: 'Corolla',
  });

  assert.deepEqual(resolveProfile(decodedVin), {
    profileId: 'generic_obd2',
    supportStatus: 'partial',
  });
});

test('resolves simulator mode to obd2_simulator', () => {
  const decodedVin = normalizeDecodedVin('TESTVIN1234567890', {
    ModelYear: '',
    Make: 'OBD2',
    Model: 'Simulator',
  });

  assert.deepEqual(resolveProfile(decodedVin, true), {
    profileId: 'obd2_simulator',
    supportStatus: 'partial',
  });
});
