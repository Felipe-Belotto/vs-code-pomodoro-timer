import * as vscode from "vscode";

export interface TimerConfig {
  workTime: number;
  breakTime: number;
  longBreakTime: number;
  cyclesBeforeLongBreak: number;
  playSound: boolean;
  showNotifications: boolean;
  customColors: {
    timerBackground?: string;
    timerText?: string;
    buttonBackground?: string;
    buttonText?: string;
  };
}

export class TimerState {
  private static instance: TimerState;
  private context: vscode.ExtensionContext;

  private currentHours: number = 0;
  private currentMinutes: number = 0;
  private currentSeconds: number = 0;
  private isPaused: boolean = true;
  private isBreakTime: boolean = false;
  private currentCycle: number = 0;
  private timerInterval?: NodeJS.Timeout;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadState();
  }

  static getInstance(context: vscode.ExtensionContext): TimerState {
    if (!TimerState.instance) {
      TimerState.instance = new TimerState(context);
    }
    return TimerState.instance;
  }

  private loadState() {
    this.currentHours = this.context.globalState.get("currentHours", 0);
    this.currentMinutes = this.context.globalState.get("currentMinutes", 0);
    this.currentSeconds = this.context.globalState.get("currentSeconds", 0);
    this.isPaused = this.context.globalState.get("isPaused", true);
    this.isBreakTime = this.context.globalState.get("isBreakTime", false);
    this.currentCycle = this.context.globalState.get("currentCycle", 0);
  }

  private async saveState() {
    await this.context.globalState.update("currentHours", this.currentHours);
    await this.context.globalState.update(
      "currentMinutes",
      this.currentMinutes
    );
    await this.context.globalState.update(
      "currentSeconds",
      this.currentSeconds
    );
    await this.context.globalState.update("isPaused", this.isPaused);
    await this.context.globalState.update("isBreakTime", this.isBreakTime);
    await this.context.globalState.update("currentCycle", this.currentCycle);
  }

  getConfig(): TimerConfig {
    const config = vscode.workspace.getConfiguration("pomodoro-timer");
    return {
      workTime: config.get("workTime", 25),
      breakTime: config.get("breakTime", 5),
      longBreakTime: config.get("longBreakTime", 15),
      cyclesBeforeLongBreak: config.get("cyclesBeforeLongBreak", 4),
      playSound: config.get("playSound", true),
      showNotifications: config.get("showNotifications", true),
      customColors: config.get("customColors", {}),
    };
  }

  getCurrentTime(): { hours: string; minutes: string; seconds: string } {
    return {
      hours: this.currentHours.toString().padStart(2, "0"),
      minutes: this.currentMinutes.toString().padStart(2, "0"),
      seconds: this.currentSeconds.toString().padStart(2, "0"),
    };
  }

  getTimeString(): string {
    const { hours, minutes, seconds } = this.getCurrentTime();
    return `${hours}:${minutes}:${seconds}`;
  }

  isPomodoroRunning(): boolean {
    return !this.isPaused;
  }

  isInBreak(): boolean {
    return this.isBreakTime;
  }

  getCurrentCycle(): number {
    return this.currentCycle;
  }

  async start() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    const config = this.getConfig();
    this.currentHours = 0;
    this.currentMinutes = !this.isBreakTime
      ? this.shouldTakeLongBreak()
        ? config.longBreakTime
        : config.breakTime
      : config.workTime;
    this.currentSeconds = 0;
    this.isPaused = false;
    await this.saveState();
  }

  async pause() {
    this.isPaused = true;
    await this.saveState();
  }

  async resume() {
    this.isPaused = false;
    await this.saveState();
  }

  async restart() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    const config = this.getConfig();
    this.currentHours = 0;
    this.currentMinutes = this.isBreakTime
      ? this.shouldTakeLongBreak()
        ? config.longBreakTime
        : config.breakTime
      : config.workTime;
    this.currentSeconds = 0;
    this.isPaused = false;
    await this.saveState();
  }

  private shouldTakeLongBreak(): boolean {
    const config = this.getConfig();
    return this.currentCycle % config.cyclesBeforeLongBreak === 0;
  }

  async tick(): Promise<boolean> {
    if (this.isPaused) {
      return false;
    }

    if (this.currentSeconds > 0) {
      this.currentSeconds--;
    } else if (this.currentMinutes > 0) {
      this.currentMinutes--;
      this.currentSeconds = 59;
    } else if (this.currentHours > 0) {
      this.currentHours--;
      this.currentMinutes = 59;
      this.currentSeconds = 59;
    } else {
      // Timer finished
      this.isPaused = true; // Pause timer until user confirms next phase
      await this.saveState();
      return true;
    }

    await this.saveState();
    return false;
  }

  async switchPhase() {
    if (!this.isBreakTime) {
      this.currentCycle++;
    }
    this.isBreakTime = !this.isBreakTime;
    await this.saveState();
  }

  dispose() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }
}
