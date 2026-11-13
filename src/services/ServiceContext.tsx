import React, { createContext, useContext, useMemo } from 'react';
import { engineManager } from './engineManager';
import { haptics } from './haptics';

export type EngineService = typeof engineManager;
export type HapticsService = typeof haptics;

export interface SquishhServices {
  engine: EngineService;
  haptics: HapticsService;
}

const defaultServices: SquishhServices = {
  engine: engineManager,
  haptics,
};

const ServiceContext = createContext<SquishhServices>(defaultServices);

interface SquishhServicesProviderProps {
  children: React.ReactNode;
  services?: Partial<SquishhServices>;
}

/**
 * Provides engineManager and haptics via React Context so components remain
 * decoupled from module-level singletons and testable with mock services (ARCH-003).
 */
export function SquishhServicesProvider({ children, services }: SquishhServicesProviderProps) {
  const value = useMemo<SquishhServices>(
    () => ({
      engine: services?.engine ?? engineManager,
      haptics: services?.haptics ?? haptics,
    }),
    [services?.engine, services?.haptics]
  );

  return <ServiceContext.Provider value={value}>{children}</ServiceContext.Provider>;
}

export function useSquishhServices(): SquishhServices {
  return useContext(ServiceContext);
}

export function useEngineManager(): EngineService {
  return useContext(ServiceContext).engine;
}

export function useHaptics(): HapticsService {
  return useContext(ServiceContext).haptics;
}
