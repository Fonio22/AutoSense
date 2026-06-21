import { useEffect, useMemo, useState } from 'react';

import type { MockObdTelemetry } from '@/lib/autosense-data';

import { getActiveObdConnection } from './obd-device';

const EMPTY_TELEMETRY: MockObdTelemetry = {
  speed: 0,
  rpm: 0,
  engineTemp: 0,
  fuelLiters: 0,
  engineLoad: 0,
  voltage: 0,
  throttle: 0,
  intakeTemp: 0,
};

function demoTelemetry(tick: number): MockObdTelemetry {
  const phase = tick / 2.8;

  return {
    speed: Math.max(0, Math.round(88 + Math.sin(phase) * 11)),
    rpm: Math.max(850, Math.round(2350 + Math.cos(phase * 0.92) * 190)),
    engineTemp: Math.round(91 + Math.sin(phase * 0.45) * 2),
    fuelLiters: Number(Math.max(54.2, 58 - tick * 0.04).toFixed(1)),
    engineLoad: Math.round(36 + Math.sin(phase * 1.2) * 5),
    voltage: Number((13.8 + Math.cos(phase * 0.55) * 0.2).toFixed(1)),
    throttle: Math.round(18 + Math.sin(phase * 0.85) * 6),
    intakeTemp: Math.round(24 + Math.cos(phase * 0.5) * 2),
  };
}

export function useObdTelemetry(options: {
  isConnected: boolean;
  demoMode: boolean;
}) {
  const [tick, setTick] = useState(0);
  const [liveTelemetry, setLiveTelemetry] = useState<MockObdTelemetry | null>(null);

  useEffect(() => {
    if (!options.demoMode || !options.isConnected) {
      return;
    }

    const timer = setInterval(() => {
      setTick((current) => current + 1);
    }, 1400);

    return () => clearInterval(timer);
  }, [options.demoMode, options.isConnected]);

  useEffect(() => {
    const connection = getActiveObdConnection();
    if (!options.isConnected || options.demoMode || !connection) {
      return;
    }

    let stopStream: (() => void) | null = null;
    let cancelled = false;

    void connection.startStream((telemetry) => {
      setLiveTelemetry(telemetry);
    }).then((cleanup) => {
      if (cancelled) {
        cleanup();
      } else {
        stopStream = cleanup;
      }
    }).catch(() => {
      setLiveTelemetry(null);
    });

    return () => {
      cancelled = true;
      stopStream?.();
    };
  }, [options.demoMode, options.isConnected]);

  return useMemo(() => {
    if (!options.isConnected) {
      return EMPTY_TELEMETRY;
    }

    if (options.demoMode) {
      return demoTelemetry(tick);
    }

    return getActiveObdConnection() ? liveTelemetry ?? EMPTY_TELEMETRY : EMPTY_TELEMETRY;
  }, [liveTelemetry, options.demoMode, options.isConnected, tick]);
}
