import * as vscode from "vscode";
import { TimerState, TimerConfig } from "../timer/TimerState";
import { NotificationManager } from "../notifications/NotificationManager";

export class PomodoroView implements vscode.WebviewViewProvider {
  public static readonly viewType = "pomodoro-timer.view";
  private _view?: vscode.WebviewView;
  private readonly _timerState: TimerState;
  private readonly _notificationManager: NotificationManager;
  private _statusBarItem: vscode.StatusBarItem;

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

    // Start timer update loop
    this.startTimerLoop();
  }

  private async startTimerLoop() {
    const updateTimer = async () => {
      if (!this._timerState.isPomodoroRunning()) {
        this.updateUI();
        return;
      }

      const isFinished = await this._timerState.tick();
      if (isFinished) {
        const config = this._timerState.getConfig();
        const shouldContinue = this._timerState.isInBreak()
          ? await this._notificationManager.showWorkNotification(config)
          : await this._notificationManager.showBreakNotification(config);

        if (shouldContinue) {
          await this._timerState.switchPhase();
          await this._timerState.start();
        }
      }

      this.updateUI();
    };

    // Use requestAnimationFrame for smoother updates
    const frame = () => {
      updateTimer();
      setTimeout(frame, 1000);
    };

    frame();
  }

  private updateUI() {
    if (!this._view) {
      return;
    }

    const time = this._timerState.getCurrentTime();
    this._statusBarItem.text = this._timerState.getTimeString();

    const isBreakTime = this._timerState.isInBreak();
    const isRunning = this._timerState.isPomodoroRunning();

    this._view.webview.postMessage({
      command: "updateTimer",
      ...time,
      isBreakTime,
      buttonText: isRunning ? "Pausar" : "Começar",
    });
  }

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
          this.updateUI();
          break;
        case "pauseTimer":
          if (this._timerState.isPomodoroRunning()) {
            await this._timerState.pause();
          } else {
            await this._timerState.resume();
          }
          this.updateUI();
          break;
        case "restartTimer":
          await this._timerState.restart();
          this.updateUI();
          break;
        case "toggleMode":
          await this._timerState.switchPhase();
          await this._timerState.start();
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
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const config = this._timerState.getConfig();
    const colors = config.customColors;
    const isBreakTime = this._timerState.isInBreak();
    const currentCycle = this._timerState.getCurrentCycle();
    const cyclesBeforeLongBreak = config.cyclesBeforeLongBreak;

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
                    --primary-color: ${
                      colors.timerBackground ||
                      "var(--vscode-editor-background)"
                    };
                    --text-color: ${
                      colors.timerText || "var(--vscode-editor-foreground)"
                    };
                    --button-bg: ${colors.buttonBackground || "#000000"};
                    --button-text: ${colors.buttonText || "#ffffff"};
                }
                body {
                    background-color: var(--primary-color);
                    color: var(--text-color);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    min-height: 100vh;
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    justify-content: flex-start;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    width: 100%;
                    margin-bottom: 20px;
                }
                .header-buttons {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }
                .settings-button, .restart-button {
                    background: none;
                    border: none;
                    color: var(--text-color);
                    cursor: pointer;
                    font-size: 16px;
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
                    font-size: 14px;
                    padding: 4px 8px;
                    border-radius: 4px;
                    background-color: var(--button-bg);
                    color: var(--button-text);
                    cursor: pointer;
                    transition: opacity 0.2s ease;
                }
                .mode-indicator:hover {
                    opacity: 0.8;
                }
                .cycle-indicator {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 14px;
                    color: var(--text-color);
                    margin-right: 8px;
                }
                .timer-display {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    font-size: 48px;
                    margin-bottom: 20px;
                    font-family: monospace;
                }
                .timer-display span {
                    margin: 0 4px;
                }
                .buttons {
                    display: flex;
                    gap: 10px;
                    margin-top: 20px;
                    width: 100%;
                    justify-content: center;
                }
                .btn {
                    width: 120px;
                    height: 40px;
                    border-radius: 4px;
                    text-align: center;
                    border: none;
                    background-color: var(--button-bg);
                    color: var(--button-text);
                    cursor: pointer;
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .btn:hover {
                    opacity: 0.9;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="mode-indicator" id="mode-indicator" title="Clique para alternar">${
                  isBreakTime ? "Descanso" : "Trabalho"
                }</div>
                <div class="header-buttons">
                    <div class="cycle-indicator">
                        <i data-lucide="target"></i>
                        <span>${
                          currentCycle % cyclesBeforeLongBreak
                        }/${cyclesBeforeLongBreak}</span>
                    </div>
                    <button class="restart-button" id="restart-button" title="Reiniciar">
                        <i data-lucide="rotate-ccw"></i>
                    </button>
                    <button class="settings-button" id="settings-button" title="Configurações">
                        <i data-lucide="settings"></i>
                    </button>
                </div>
            </div>
            <div class="timer-display">
                <span id="hours">00</span>:
                <span id="minutes">00</span>:
                <span id="seconds">00</span>
            </div>
            <div class="buttons">
                <button class="btn" id="btn-start" title="Iniciar/Pausar">Começar</button>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                const hours = document.getElementById("hours");
                const minutes = document.getElementById("minutes");
                const seconds = document.getElementById("seconds");
                const btnStart = document.getElementById("btn-start");
                const btnSettings = document.getElementById("settings-button");
                const btnRestart = document.getElementById("restart-button");
                const modeIndicator = document.getElementById("mode-indicator");

                // Initialize Lucide icons
                lucide.createIcons();

                window.addEventListener("message", (event) => {
                    const message = event.data;
                    switch (message.command) {
                        case "updateTimer":
                            hours.textContent = message.hours;
                            minutes.textContent = message.minutes;
                            seconds.textContent = message.seconds;
                            btnStart.textContent = message.buttonText;
                            modeIndicator.textContent = message.isBreakTime ? "Descanso" : "Trabalho";
                            break;
                    }
                });

                // Check timer state when webview is loaded
                vscode.postMessage({ command: "checkTimerState" });

                btnStart.addEventListener("click", () => {
                    vscode.postMessage({ command: "pauseTimer" });
                });

                btnSettings.addEventListener("click", () => {
                    btnSettings.classList.add("rotate");
                    vscode.postMessage({ command: "openSettings" });
                    setTimeout(() => {
                        btnSettings.classList.remove("rotate");
                    }, 300);
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

  dispose() {
    this._statusBarItem.dispose();
    this._timerState.dispose();
    this._notificationManager.dispose();
  }
}
