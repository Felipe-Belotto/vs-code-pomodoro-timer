import * as vscode from "vscode";
import { TimerConfig } from "../timer/TimerState";

declare global {
  interface Window {
    AudioContext: typeof AudioContext;
    webkitAudioContext: typeof AudioContext;
  }
}

export class NotificationManager {
  private static instance: NotificationManager;

  private constructor() {}

  static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager();
    }
    return NotificationManager.instance;
  }

  async showBreakNotification(config: TimerConfig): Promise<boolean> {
    if (!config.showNotifications) {
      return true;
    }

    const selection = await vscode.window.showInformationMessage(
      "Hora do descanso!",
      "Começar"
    );

    return selection === "Começar";
  }

  async showWorkNotification(config: TimerConfig): Promise<boolean> {
    if (!config.showNotifications) {
      return true;
    }

    const selection = await vscode.window.showInformationMessage(
      "Hora de trabalhar!",
      "Começar"
    );

    return selection === "Começar";
  }

  dispose() {
    // Nothing to dispose
  }
}
