import * as vscode from "vscode";

/**
 * Configuration interface for the Pomodoro Timer
 */
export interface TimerConfig {
  /** Duration of work/focus time in minutes */
  workTime: number;
  /** Duration of short breaks in minutes */
  breakTime: number;
  /** Duration of long breaks in minutes */
  longBreakTime: number;
  /** Number of work cycles before a long break */
  cyclesBeforeLongBreak: number;
  /** Whether to play sound when a timer phase completes */
  playSound: boolean;
  /** Whether to show notifications when a timer phase completes */
  showNotifications: boolean;
  /** Custom color settings for timer UI */
  customColors: {
    timerBackground?: string;
    timerText?: string;
    buttonBackground?: string;
    buttonText?: string;
  };
  /** Whether to automatically start the next phase when current phase completes */
  autoStartNextPhase: boolean;
  /** Whether to pause the timer automatically when user is inactive */
  pauseOnInactivity: boolean;
  /** Time in minutes of inactivity before pausing */
  inactivityThreshold: number;
}

/**
 * Event types emitted by the timer
 */
export enum TimerEventType {
  TICK = "tick",
  PHASE_COMPLETED = "phase_completed",
  PHASE_CHANGED = "phase_changed",
  STATE_CHANGED = "state_changed",
}

/**
 * Timer phase types
 */
export enum TimerPhase {
  WORK = "work",
  BREAK = "break",
  LONG_BREAK = "long_break",
}

/**
 * TimerState class responsible for managing the state of the Pomodoro timer
 */
export class TimerState {
  private static instance: TimerState;
  private context: vscode.ExtensionContext;
  private eventEmitter = new vscode.EventEmitter<{
    type: TimerEventType;
    data?: any;
  }>();

  // Timer state
  private currentHours: number = 0;
  private currentMinutes: number = 0;
  private currentSeconds: number = 0;
  private isPaused: boolean = true;
  private phase: TimerPhase = TimerPhase.WORK;
  private currentCycle: number = 0;
  private timerInterval?: NodeJS.Timeout;
  private lastActivityTime: number = Date.now();
  private inactivityCheckInterval?: NodeJS.Timeout;
  private dailyStats: {
    date: string;
    completedWorkCycles: number;
    totalWorkTime: number;
    totalBreakTime: number;
  };

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.dailyStats = this.initDailyStats();
    this.loadState();
    this.setupInactivityDetection();
  }

  /**
   * Get the singleton instance of TimerState
   */
  public static getInstance(context: vscode.ExtensionContext): TimerState {
    if (!TimerState.instance) {
      TimerState.instance = new TimerState(context);
    }
    return TimerState.instance;
  }

  /**
   * Event that fires when timer state changes
   */
  public readonly onTimerEvent = this.eventEmitter.event;

  /**
   * Initialize daily statistics
   */
  private initDailyStats() {
    const today = new Date().toISOString().split("T")[0];
    const savedStats = this.context.globalState.get<{
      date: string;
      completedWorkCycles: number;
      totalWorkTime: number;
      totalBreakTime: number;
    }>("dailyStats");

    // If no stats or stats from a different day, create new stats
    if (!savedStats || savedStats.date !== today) {
      return {
        date: today,
        completedWorkCycles: 0,
        totalWorkTime: 0,
        totalBreakTime: 0,
      };
    }

    return savedStats;
  }

  /**
   * Load state from extension storage
   */
  private loadState() {
    try {
      this.currentHours = this.context.globalState.get("currentHours", 0);
      this.currentMinutes = this.context.globalState.get("currentMinutes", 0);
      this.currentSeconds = this.context.globalState.get("currentSeconds", 0);
      this.isPaused = this.context.globalState.get("isPaused", true);
      this.phase = this.context.globalState.get("phase", TimerPhase.WORK);
      this.currentCycle = this.context.globalState.get("currentCycle", 0);

      // If timer was running when VS Code was closed, restart it
      if (!this.isPaused) {
        this.start();
      }
    } catch (error) {
      console.error("Failed to load timer state:", error);
      vscode.window.showErrorMessage("Failed to load timer state");
    }
  }

  /**
   * Save state to extension storage
   */
  private async saveState() {
    try {
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
      await this.context.globalState.update("phase", this.phase);
      await this.context.globalState.update("currentCycle", this.currentCycle);
      await this.context.globalState.update("dailyStats", this.dailyStats);

      this.emitEvent(TimerEventType.STATE_CHANGED, {
        time: this.getCurrentTime(),
        phase: this.phase,
        isPaused: this.isPaused,
        cycle: this.currentCycle,
      });
    } catch (error) {
      console.error("Failed to save timer state:", error);
      vscode.window.showErrorMessage("Failed to save timer state");
    }
  }

  /**
   * Emit an event to subscribers
   */
  private emitEvent(type: TimerEventType, data?: any) {
    this.eventEmitter.fire({ type, data });
  }

  /**
   * Get timer configuration from VS Code settings
   */
  public getConfig(): TimerConfig {
    const config = vscode.workspace.getConfiguration("pomodoro-timer");
    return {
      workTime: Math.max(1, config.get("workTime", 25)),
      breakTime: Math.max(1, config.get("breakTime", 5)),
      longBreakTime: Math.max(1, config.get("longBreakTime", 15)),
      cyclesBeforeLongBreak: Math.max(
        1,
        config.get("cyclesBeforeLongBreak", 4)
      ),
      playSound: config.get("playSound", true),
      showNotifications: config.get("showNotifications", true),
      customColors: config.get("customColors", {}),
      autoStartNextPhase: config.get("autoStartNextPhase", false),
      pauseOnInactivity: config.get("pauseOnInactivity", false),
      inactivityThreshold: Math.max(1, config.get("inactivityThreshold", 5)),
    };
  }

  /**
   * Get current time as formatted strings
   */
  public getCurrentTime(): { hours: string; minutes: string; seconds: string } {
    return {
      hours: this.currentHours.toString().padStart(2, "0"),
      minutes: this.currentMinutes.toString().padStart(2, "0"),
      seconds: this.currentSeconds.toString().padStart(2, "0"),
    };
  }

  /**
   * Get formatted time string (HH:MM:SS)
   */
  public getTimeString(): string {
    const { hours, minutes, seconds } = this.getCurrentTime();
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Check if timer is running
   */
  public isPomodoroRunning(): boolean {
    return !this.isPaused;
  }

  /**
   * Get current timer phase
   */
  public getCurrentPhase(): TimerPhase {
    return this.phase;
  }

  /**
   * Get current Pomodoro cycle
   */
  public getCurrentCycle(): number {
    return this.currentCycle;
  }

  /**
   * Get daily statistics
   */
  public getDailyStats() {
    return { ...this.dailyStats };
  }

  /**
   * Update the last activity timestamp
   */
  public updateActivity() {
    this.lastActivityTime = Date.now();
  }

  /**
   * Setup inactivity detection
   */
  private setupInactivityDetection() {
    const config = this.getConfig();

    if (!config.pauseOnInactivity) {
      return;
    }

    if (this.inactivityCheckInterval) {
      clearInterval(this.inactivityCheckInterval);
    }

    this.inactivityCheckInterval = setInterval(() => {
      const now = Date.now();
      const inactiveTimeMs = now - this.lastActivityTime;
      const inactiveTimeMin = inactiveTimeMs / (1000 * 60);

      if (!this.isPaused && inactiveTimeMin >= config.inactivityThreshold) {
        this.pause("User inactivity detected");
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Start the timer
   */
  public async start() {
    if (
      this.currentHours === 0 &&
      this.currentMinutes === 0 &&
      this.currentSeconds === 0
    ) {
      await this.restart();
      return;
    }

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    this.isPaused = false;
    this.updateActivity();

    this.timerInterval = setInterval(async () => {
      const isFinished = await this.tick();
      if (isFinished) {
        this.handlePhaseCompletion();
      }
    }, 1000);

    await this.saveState();
  }

  /**
   * Pause the timer
   */
  public async pause(reason?: string) {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = undefined;
    }

    this.isPaused = true;
    await this.saveState();

    if (reason) {
      vscode.window.showInformationMessage(`Pomodoro timer paused: ${reason}`);
    }
  }

  /**
   * Resume the timer
   */
  public async resume() {
    await this.start();
  }

  /**
   * Reset and restart the timer with configured time for current phase
   */
  public async restart() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    const config = this.getConfig();
    this.currentHours = 0;

    switch (this.phase) {
      case TimerPhase.WORK:
        this.currentMinutes = config.workTime;
        break;
      case TimerPhase.BREAK:
        this.currentMinutes = config.breakTime;
        break;
      case TimerPhase.LONG_BREAK:
        this.currentMinutes = config.longBreakTime;
        break;
    }

    this.currentSeconds = 0;
    this.isPaused = false;
    this.updateActivity();

    this.timerInterval = setInterval(async () => {
      const isFinished = await this.tick();
      if (isFinished) {
        this.handlePhaseCompletion();
      }
    }, 1000);

    await this.saveState();
  }

  /**
   * Handle timer phase completion
   */
  private handlePhaseCompletion() {
    const config = this.getConfig();

    // Update statistics
    if (this.phase === TimerPhase.WORK) {
      this.dailyStats.completedWorkCycles++;
      this.dailyStats.totalWorkTime += config.workTime;
    } else {
      const breakTime =
        this.phase === TimerPhase.LONG_BREAK
          ? config.longBreakTime
          : config.breakTime;
      this.dailyStats.totalBreakTime += breakTime;
    }

    // Notify user
    if (config.showNotifications) {
      const message =
        this.phase === TimerPhase.WORK
          ? "Work session completed! Time for a break."
          : "Break time over! Ready to get back to work?";

      vscode.window
        .showInformationMessage(message, "Start Next Phase")
        .then((selection) => {
          if (selection === "Start Next Phase") {
            this.switchPhase(true);
          }
        });
    }

    // Play sound if enabled
    if (config.playSound) {
      vscode.commands.executeCommand("pomodoro-timer.playSound");
    }

    // Auto-start next phase if enabled
    if (config.autoStartNextPhase) {
      this.switchPhase(true);
    }

    this.emitEvent(TimerEventType.PHASE_COMPLETED, {
      phase: this.phase,
      cycle: this.currentCycle,
    });
  }

  /**
   * Check if the next break should be a long break
   */
  private shouldTakeLongBreak(): boolean {
    const config = this.getConfig();
    return (
      this.currentCycle > 0 &&
      this.currentCycle % config.cyclesBeforeLongBreak === 0
    );
  }

  /**
   * Update timer by one second
   */
  public async tick(): Promise<boolean> {
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
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = undefined;
      }

      this.isPaused = true;
      await this.saveState();

      this.emitEvent(TimerEventType.TICK, this.getCurrentTime());
      return true;
    }

    await this.saveState();
    this.emitEvent(TimerEventType.TICK, this.getCurrentTime());
    return false;
  }

  /**
   * Switch to the next timer phase
   */
  public async switchPhase(autoStart: boolean = false) {
    // Primeiro pausamos o timer atual
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = undefined;
    }
    this.isPaused = true;

    // Atualizamos a fase
    if (this.phase === TimerPhase.WORK) {
      // Se estamos em WORK, vamos para BREAK
      this.currentCycle++;
      this.phase = this.shouldTakeLongBreak()
        ? TimerPhase.LONG_BREAK
        : TimerPhase.BREAK;
    } else {
      // Se estamos em BREAK ou LONG_BREAK, sempre vamos para WORK
      this.phase = TimerPhase.WORK;
    }

    // Resetamos o timer com o tempo correto para cada fase
    const config = this.getConfig();
    this.currentHours = 0;
    this.currentSeconds = 0;

    // Definimos explicitamente o tempo para cada fase
    switch (this.phase) {
      case TimerPhase.WORK:
        // Tempo de trabalho é sempre workTime
        this.currentMinutes = config.workTime;
        break;
      case TimerPhase.BREAK:
        // Tempo de pausa curta é sempre breakTime
        this.currentMinutes = config.breakTime;
        break;
      case TimerPhase.LONG_BREAK:
        // Tempo de pausa longa é sempre longBreakTime
        this.currentMinutes = config.longBreakTime;
        break;
    }

    // Emitimos o evento de mudança de fase
    this.emitEvent(TimerEventType.PHASE_CHANGED, {
      phase: this.phase,
      cycle: this.currentCycle,
    });

    // Salvamos o estado
    await this.saveState();

    // Se autoStart for true, iniciamos o timer automaticamente
    if (autoStart) {
      this.isPaused = false;
      this.timerInterval = setInterval(async () => {
        const isFinished = await this.tick();
        if (isFinished) {
          this.handlePhaseCompletion();
        }
      }, 1000);
      await this.saveState();
    }
  }

  /**
   * Get timer session history for the past week
   */
  public async getWeeklyStats() {
    const history = this.context.globalState.get<
      Array<{
        date: string;
        completedWorkCycles: number;
        totalWorkTime: number;
        totalBreakTime: number;
      }>
    >("weeklyStats", []);

    // Include today's stats
    const allStats = [...history, this.dailyStats];

    // Only keep the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    return allStats.filter((stat) => stat.date >= sevenDaysAgoStr);
  }

  /**
   * Reset all statistics
   */
  public async resetStatistics() {
    this.dailyStats = {
      date: new Date().toISOString().split("T")[0],
      completedWorkCycles: 0,
      totalWorkTime: 0,
      totalBreakTime: 0,
    };

    await this.context.globalState.update("dailyStats", this.dailyStats);
    await this.context.globalState.update("weeklyStats", []);
  }

  /**
   * Reset the timer to initial state
   */
  public async reset() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = undefined;
    }

    this.currentHours = 0;
    this.currentMinutes = 0;
    this.currentSeconds = 0;
    this.isPaused = true;
    this.phase = TimerPhase.WORK;
    this.currentCycle = 0;

    await this.saveState();
  }

  /**
   * Update daily statistics to weekly history at end of day
   */
  public async updateWeeklyStats() {
    const weeklyStats = await this.getWeeklyStats();

    // Find if today's stats already exist in weekly stats
    const todayIndex = weeklyStats.findIndex(
      (stat) => stat.date === this.dailyStats.date
    );

    if (todayIndex >= 0) {
      weeklyStats[todayIndex] = { ...this.dailyStats };
    } else {
      weeklyStats.push({ ...this.dailyStats });
    }

    await this.context.globalState.update("weeklyStats", weeklyStats);
  }

  /**
   * Clean up resources
   */
  public dispose() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    if (this.inactivityCheckInterval) {
      clearInterval(this.inactivityCheckInterval);
    }

    this.updateWeeklyStats();
    this.eventEmitter.dispose();
  }
}
