import * as vscode from "vscode";
import {
  TimerState,
  TimerConfig,
  TimerEventType,
  TimerPhase,
} from "../timer/TimerState";
import { NotificationManager } from "../notifications/NotificationManager";

/**
 * Provides the Webview UI for the Pomodoro Timer
 */
export class PomodoroView implements vscode.WebviewViewProvider {
  public static readonly viewType = "pomodoro-timer.view";
  private _view?: vscode.WebviewView;
  private readonly _timerState: TimerState;
  private readonly _notificationManager: NotificationManager;
  private _statusBarItem: vscode.StatusBarItem;
  private _disposables: vscode.Disposable[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    context: vscode.ExtensionContext
  ) {
    this._timerState = TimerState.getInstance(context);
    this._notificationManager = NotificationManager.getInstance();

    // Create status bar item
    this._statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this._statusBarItem.command = "pomodoro-timer.view.focus";
    this._statusBarItem.show();

    // Subscribe to timer events
    this._disposables.push(
      this._timerState.onTimerEvent((event) => {
        switch (event.type) {
          case TimerEventType.TICK:
            this.updateUI();
            break;
          case TimerEventType.PHASE_COMPLETED:
            this.handlePhaseCompletion(event.data);
            break;
          case TimerEventType.PHASE_CHANGED:
          case TimerEventType.STATE_CHANGED:
            this.updateUI();
            break;
        }
      })
    );

    // Update UI initially
    this.updateUI();

    // Register activity detection
    this._disposables.push(
      vscode.window.onDidChangeTextEditorSelection(() => {
        this._timerState.updateActivity();
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        this._timerState.updateActivity();
      }),
      vscode.workspace.onDidChangeTextDocument(() => {
        this._timerState.updateActivity();
      })
    );
  }

  /**
   * Handle timer phase completion
   */
  private async handlePhaseCompletion(data: any) {
    const config = this._timerState.getConfig();

    if (config.showNotifications && !config.autoStartNextPhase) {
      const isWorkCompleted = data.phase === TimerPhase.WORK;
      const shouldContinue = isWorkCompleted
        ? await this._notificationManager.showBreakNotification(config)
        : await this._notificationManager.showWorkNotification(config);

      if (shouldContinue) {
        await this._timerState.switchPhase(true);
      }
    }

    this.updateUI();
  }

  /**
   * Update the UI with current timer state
   */
  private updateUI() {
    if (!this._view) {
      // Update status bar even if webview is not visible
      this._statusBarItem.text = `⏱️ ${this._timerState.getTimeString()}`;
      return;
    }

    const time = this._timerState.getCurrentTime();
    const phase = this._timerState.getCurrentPhase();
    const isRunning = this._timerState.isPomodoroRunning();
    const cycle = this._timerState.getCurrentCycle();
    const config = this._timerState.getConfig();
    const stats = this._timerState.getDailyStats();

    // Update status bar
    this._statusBarItem.text = `⏱️ ${this._timerState.getTimeString()}`;

    // Get phase text
    let phaseText = "Trabalho";
    switch (phase) {
      case TimerPhase.BREAK:
        phaseText = "Descanso";
        break;
      case TimerPhase.LONG_BREAK:
        phaseText = "Descanso Longo";
        break;
    }

    // Post message to webview
    this._view.webview.postMessage({
      command: "updateTimer",
      ...time,
      phase,
      phaseText,
      cycle,
      cyclesBeforeLongBreak: config.cyclesBeforeLongBreak,
      isRunning,
      buttonText: isRunning ? "Pausar" : "Começar",
      stats: {
        completedCycles: stats.completedWorkCycles,
        totalWorkTime: stats.totalWorkTime,
        totalBreakTime: stats.totalBreakTime,
      },
    });
  }

  /**
   * Create and configure the webview when it becomes visible
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "checkTimerState":
          this.updateUI();
          break;
        case "startTimer":
          await this._timerState.start();
          break;
        case "pauseTimer":
          if (this._timerState.isPomodoroRunning()) {
            await this._timerState.pause();
          } else {
            await this._timerState.resume();
          }
          break;
        case "restartTimer":
          await this._timerState.restart();
          break;
        case "resetTimer":
          await this._timerState.reset();
          break;
        case "resetCycles":
          await this._timerState.resetCycles();
          this.updateUI();
          break;
        case "toggleMode":
          await this._timerState.switchPhase();
          break;
        case "resetStatistics":
          await this._timerState.resetStatistics();
          this.updateUI();
          break;
        case "openSettings":
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "pomodoro-timer"
          );
          break;
      }
    });

    // Keep UI up to date when webview becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.updateUI();
      }
    });
  }

  /**
   * Generate HTML for the main Pomodoro webview
   */
  private _getHtmlForWebview(webview: vscode.Webview) {
    const config = this._timerState.getConfig();
    const phase = this._timerState.getCurrentPhase();
    const currentCycle = this._timerState.getCurrentCycle();
    const cyclesBeforeLongBreak = config.cyclesBeforeLongBreak;
    const stats = this._timerState.getDailyStats();

    // Get phase text
    let phaseText = "Trabalho";
    switch (phase) {
      case TimerPhase.BREAK:
        phaseText = "Descanso";
        break;
      case TimerPhase.LONG_BREAK:
        phaseText = "Descanso Longo";
        break;
    }

    return `<!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Pomodoro Timer</title>
            <script src="https://unpkg.com/lucide@latest"></script>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                :root {
                    --primary-color: var(--vscode-sideBar-background);
                    --text-color: #ffffff;
                    --button-bg: var(--vscode-button-background);
                    --button-text: #ffffff;
                    --accent-color: var(--vscode-focusBorder);
                }
                body {
                    background-color: var(--primary-color);
                    color: var(--text-color);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    min-height: 100vh;
                    font-family: var(--vscode-font-family);
                    padding: 16px;
                    justify-content: flex-start;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                    margin-bottom: 16px;
                }
                .header-buttons {
                    display: flex;
                    gap: 12px;
                    align-items: center;
                }
                .settings-button, .restart-button {
                    background: none;
                    border: none;
                    color: var(--text-color);
                    cursor: pointer;
                    font-size: 14px;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    transition: transform 0.3s ease;
                }
                .settings-button:hover, .restart-button:hover {
                    opacity: 0.8;
                }
                .settings-button.rotate, .restart-button.rotate {
                    transform: rotate(360deg);
                }
                .mode-indicator {
                    font-size: 13px;
                    padding: 4px 12px;
                    border-radius: 4px;
                    background-color: var(--button-bg);
                    color: var(--button-text);
                    cursor: pointer;
                    transition: transform 0.2s ease;
                    border: 1px solid transparent;
                }
                .mode-indicator:hover {
                    opacity: 0.9;
                    border-color: var(--accent-color);
                }
                .cycle-indicator {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 12px;
                    color: var(--text-color);
                    margin-right: 8px;
                    opacity: 0.8;
                }
                .timer-display {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    font-size: 42px;
                    margin: 12px 0;
                    font-family: 'Consolas', monospace;
                    font-weight: 300;
                    letter-spacing: 2px;
                    color: var(--text-color);
                }
                .timer-display span {
                    margin: 0 2px;
                    min-width: 1.2ch;
                    text-align: center;
                }
                .timer-display[data-phase="work"] {
                    color: #ffffff;
                }
                .timer-display[data-phase="break"] {
                    color: #8bd5ca;
                }
                .timer-display[data-phase="long_break"] {
                    color: #a6da95;
                }
                .buttons {
                    display: flex;
                    gap: 10px;
                    margin-top: 16px;
                    margin-bottom: 20px;
                    width: 100%;
                    justify-content: center;
                }
                .btn {
                    width: 110px;
                    height: 36px;
                    border-radius: 4px;
                    text-align: center;
                    border: none;
                    background-color: var(--button-bg);
                    color: var(--button-text);
                    cursor: pointer;
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: transform 0.1s ease, opacity 0.1s ease;
                }
                .btn:hover {
                    opacity: 0.9;
                }
                .btn:active {
                    transform: scale(0.98);
                }
                /* Dropdown styles */
                .dropdown {
                    position: relative;
                    display: inline-block;
                }
                .dropdown-content {
                    display: none;
                    position: absolute;
                    right: 0;
                    top: 100%;
                    background-color: var(--vscode-editor-background);
                    min-width: 180px;
                    box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.2);
                    z-index: 1;
                    border-radius: 4px;
                    border: 1px solid var(--vscode-widget-border);
                }
                /* Menu aparece apenas quando a classe 'show' é adicionada */
                .dropdown-content.show {
                    display: block;
                }
                .dropdown-content a {
                    color: var(--vscode-foreground);
                    padding: 10px 16px;
                    text-decoration: none;
                    display: block;
                    font-size: 13px;
                    border-bottom: 1px solid var(--vscode-widget-border);
                }
                .dropdown-content a:last-child {
                    border-bottom: none;
                }
                .dropdown-content a:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                /* Stats styles */
                .stats-container {
                    width: 100%;
                    margin-top: 20px;
                    border-top: 1px solid var(--vscode-widget-border);
                    padding-top: 15px;
                }
                .stats-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }
                .stats-title {
                    font-size: 14px;
                    font-weight: 500;
                    color: var(--vscode-foreground);
                }
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 12px;
                }
                .stat-item {
                    padding: 8px;
                    background-color: var(--vscode-editor-background);
                    border-radius: 4px;
                }
                .stat-label {
                    font-size: 12px;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 4px;
                }
                .stat-value {
                    font-size: 16px;
                    font-weight: 500;
                }
                /* Mobile responsiveness */
                @media (max-width: 480px) {
                    .stats-grid {
                        grid-template-columns: 1fr;
                    }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="mode-indicator" id="mode-indicator" data-phase="${phase}" title="Clique para alternar">${phaseText}</div>
                <div class="header-buttons">
                    <div class="cycle-indicator">
                        <i data-lucide="target"></i>
                        <span>${
                          currentCycle % cyclesBeforeLongBreak ||
                          cyclesBeforeLongBreak
                        }/${cyclesBeforeLongBreak}</span>
                    </div>
                    <button class="restart-button" id="restart-button" title="Reiniciar">
                        <i data-lucide="rotate-ccw"></i>
                    </button>
                    <div class="dropdown">
                        <button class="settings-button" id="menu-button" title="Menu">
                            <i data-lucide="more-vertical"></i>
                        </button>
                        <div class="dropdown-content" id="dropdown-content">
                            <a href="#" id="toggle-mode">Alternar Modo</a>
                            <a href="#" id="reset-timer">Resetar Timer</a>
                            <a href="#" id="reset-cycles">Resetar Ciclos</a>
                            <a href="#" id="reset-stats">Resetar Estatísticas</a>
                            <a href="#" id="open-settings">Configurações</a>
                        </div>
                    </div>
                </div>
            </div>
            <div class="timer-display" data-phase="${phase}">
                <span id="hours">00</span>:
                <span id="minutes">00</span>:
                <span id="seconds">00</span>
            </div>
            <div class="buttons">
                <button class="btn" id="btn-start" title="Iniciar/Pausar">Começar</button>
            </div>
            <div class="stats-container">
                <div class="stats-header">
                    <div class="stats-title">Estatísticas de Hoje</div>
                </div>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-label">Ciclos Completos</div>
                        <div class="stat-value" id="completed-cycles">${
                          stats.completedWorkCycles
                        }</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Tempo Focado</div>
                        <div class="stat-value" id="total-work-time">${
                          stats.totalWorkTime
                        } min</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Tempo de Pausa</div>
                        <div class="stat-value" id="total-break-time">${
                          stats.totalBreakTime
                        } min</div>
                    </div>
                </div>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                let menuOpen = false;
                
                // Elementos do DOM
                const hours = document.getElementById("hours");
                const minutes = document.getElementById("minutes");
                const seconds = document.getElementById("seconds");
                const btnStart = document.getElementById("btn-start");
                const btnRestart = document.getElementById("restart-button");
                const modeIndicator = document.getElementById("mode-indicator");
                const timerDisplay = document.querySelector(".timer-display");
                const completedCycles = document.getElementById("completed-cycles");
                const totalWorkTime = document.getElementById("total-work-time");
                const totalBreakTime = document.getElementById("total-break-time");
                const menuButton = document.getElementById("menu-button");
                const dropdownContent = document.getElementById("dropdown-content");

                // Initialize Lucide icons
                if (typeof lucide !== 'undefined') {
                    lucide.createIcons();
                } else {
                    // Carregar o Lucide se não estiver disponível
                    const script = document.createElement('script');
                    script.src = "https://unpkg.com/lucide@latest";
                    script.onload = function() {
                        if (typeof lucide !== 'undefined') {
                            lucide.createIcons();
                        }
                    };
                    document.head.appendChild(script);
                }

                // Toggle do menu dropdown
                function toggleDropdown(force) {
                    if (force !== undefined) {
                        menuOpen = force;
                    } else {
                        menuOpen = !menuOpen;
                    }
                    
                    if (menuOpen) {
                        dropdownContent.classList.add("show");
                    } else {
                        dropdownContent.classList.remove("show");
                    }
                }

                // Handle dropdown menu display
                menuButton.addEventListener("click", (e) => {
                    e.stopPropagation();
                    toggleDropdown();
                });

                // Close dropdown when clicking outside
                document.addEventListener("click", (e) => {
                    if (menuOpen && e.target !== menuButton && !dropdownContent.contains(e.target)) {
                        toggleDropdown(false);
                    }
                });

                // Setup menu items
                function setupMenuItem(id, command) {
                    const element = document.getElementById(id);
                    if (element) {
                        element.addEventListener("click", (e) => {
                            e.preventDefault();
                            vscode.postMessage({ command });
                            toggleDropdown(false);
                        });
                    }
                }
                
                setupMenuItem("toggle-mode", "toggleMode");
                setupMenuItem("reset-timer", "resetTimer");
                setupMenuItem("reset-cycles", "resetCycles");
                setupMenuItem("reset-stats", "resetStatistics");
                setupMenuItem("open-settings", "openSettings");

                window.addEventListener("message", (event) => {
                    const message = event.data;
                    switch (message.command) {
                        case "updateTimer":
                            hours.textContent = message.hours;
                            minutes.textContent = message.minutes;
                            seconds.textContent = message.seconds;
                            btnStart.textContent = message.buttonText;
                            modeIndicator.textContent = message.phaseText;
                            modeIndicator.dataset.phase = message.phase;
                            timerDisplay.dataset.phase = message.phase;
                            
                            // Update stats
                            if (message.stats) {
                                completedCycles.textContent = message.stats.completedCycles;
                                totalWorkTime.textContent = message.stats.totalWorkTime + " min";
                                totalBreakTime.textContent = message.stats.totalBreakTime + " min";
                            }
                            break;
                    }
                });

                // Check timer state when webview is loaded
                vscode.postMessage({ command: "checkTimerState" });

                btnStart.addEventListener("click", () => {
                    vscode.postMessage({ command: "pauseTimer" });
                });

                btnRestart.addEventListener("click", () => {
                    btnRestart.classList.add("rotate");
                    vscode.postMessage({ command: "restartTimer" });
                    setTimeout(() => {
                        btnRestart.classList.remove("rotate");
                    }, 300);
                });

                modeIndicator.addEventListener("click", () => {
                    vscode.postMessage({ command: "toggleMode" });
                });
            </script>
        </body>
        </html>`;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this._statusBarItem.dispose();
    this._disposables.forEach((d) => d.dispose());
    this._disposables = [];
  }
}
