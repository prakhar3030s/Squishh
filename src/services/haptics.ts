import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

class HapticService {
  /**
   * Subtle tick for tab/mode changes and slider snapping
   */
  async selection(): Promise<void> {
    try {
      await Haptics.selectionChanged();
    } catch {
      // Graceful no-op on platforms without vibration
    }
  }

  /**
   * Light click feedback for buttons, chips, and toggles
   */
  async lightImpact(): Promise<void> {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // Graceful no-op
    }
  }

  /**
   * Medium bounce feedback for file drop, picker confirm, squish action
   */
  async mediumImpact(): Promise<void> {
    try {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch {
      // Graceful no-op
    }
  }

  /**
   * Cheerful success vibration when file compression completes
   */
  async success(): Promise<void> {
    try {
      await Haptics.notification({ type: NotificationType.Success });
    } catch {
      // Graceful no-op
    }
  }

  /**
   * Warning/error tactile signal
   */
  async error(): Promise<void> {
    try {
      await Haptics.notification({ type: NotificationType.Error });
    } catch {
      // Graceful no-op
    }
  }
}

export const haptics = new HapticService();
