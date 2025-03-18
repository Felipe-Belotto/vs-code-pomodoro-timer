// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { PomodoroView } from "./ui/PomodoroView";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log("Pomodoro Timer is now active!");

  let timerInterval: NodeJS.Timeout | undefined = undefined;
  let currentHours = 0;
  let currentMinutes = 0;
  let currentSeconds = 0;
  let isPaused = false;
  let isBreakTime = false;
  let statusBarItem: vscode.StatusBarItem;
  const workTime =
    vscode.workspace
      .getConfiguration("pomodoro-timer")
      .get<number>("workTime") || 30;
  const breakTime =
    vscode.workspace
      .getConfiguration("pomodoro-timer")
      .get<number>("breakTime") || 5;
  const icon =
    vscode.workspace.getConfiguration("pomodoro-timer").get<string>("icon") ||
    "$(clock)";

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "pomodoro-timer.view.focus";
  statusBarItem.show();

  class PomodoroTimerProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "pomodoro-timer.view";

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
      webviewView: vscode.WebviewView,
      context: vscode.WebviewViewResolveContext,
      _token: vscode.CancellationToken
    ) {
      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [this._extensionUri],
      };

      webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

      webviewView.webview.onDidReceiveMessage(async (message) => {
        switch (message.command) {
          case "checkTimerState":
            if (timerInterval) {
              webviewView.webview.postMessage({
                command: "updateTimer",
                hours: currentHours.toString().padStart(2, "0"),
                minutes: currentMinutes.toString().padStart(2, "0"),
                seconds: currentSeconds.toString().padStart(2, "0"),
                isBreakTime: isBreakTime,
              });
              webviewView.webview.postMessage({
                command: "updatePauseState",
                isPaused: isPaused,
              });
            }
            break;
          case "restartTimer":
            if (timerInterval) {
              clearInterval(timerInterval);
            }
            currentHours = 0;
            currentMinutes = isBreakTime ? breakTime : workTime;
            currentSeconds = 0;
            isPaused = false;
            this.startTimer(webviewView);
            break;
          case "startTimer":
            if (timerInterval) {
              clearInterval(timerInterval);
            }
            currentHours = 0;
            currentMinutes = isBreakTime ? breakTime : workTime;
            currentSeconds = 0;
            isPaused = false;
            this.startTimer(webviewView);
            break;
          case "pauseTimer":
            isPaused = !isPaused;
            webviewView.webview.postMessage({
              command: "updatePauseState",
              isPaused: isPaused,
            });
            break;
          case "addTime":
            currentMinutes += 5;
            webviewView.webview.postMessage({
              command: "updateTimer",
              hours: currentHours.toString().padStart(2, "0"),
              minutes: currentMinutes.toString().padStart(2, "0"),
              seconds: currentSeconds.toString().padStart(2, "0"),
            });
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

    private startTimer(webviewView: vscode.WebviewView) {
      if (timerInterval) {
        clearInterval(timerInterval);
      }

      timerInterval = setInterval(() => {
        if (isPaused) {
          return;
        }

        if (currentSeconds > 0) {
          currentSeconds--;
        } else if (currentMinutes > 0) {
          currentMinutes--;
          currentSeconds = 59;
        } else if (currentHours > 0) {
          currentHours--;
          currentMinutes = 59;
          currentSeconds = 59;
        } else {
          clearInterval(timerInterval);
          isBreakTime = !isBreakTime;

          if (isBreakTime) {
            vscode.window
              .showInformationMessage(
                "Hora de fazer uma pausa!",
                "Iniciar Descanso"
              )
              .then((selection) => {
                if (selection === "Iniciar Descanso") {
                  currentHours = 0;
                  currentMinutes = breakTime;
                  currentSeconds = 0;
                  isPaused = false;
                  this.startTimer(webviewView);
                }
              });
          } else {
            vscode.window
              .showInformationMessage(
                "Pausa terminada! Hora de voltar ao trabalho!",
                "Iniciar Trabalho"
              )
              .then((selection) => {
                if (selection === "Iniciar Trabalho") {
                  currentHours = 0;
                  currentMinutes = workTime;
                  currentSeconds = 0;
                  isPaused = false;
                  this.startTimer(webviewView);
                }
              });
          }
          return;
        }

        const timeString = `${currentHours
          .toString()
          .padStart(2, "0")}:${currentMinutes
          .toString()
          .padStart(2, "0")}:${currentSeconds.toString().padStart(2, "0")}`;
        statusBarItem.text = `$(clock) ${timeString} ${
          isBreakTime ? "| Descanso" : "| Trabalho"
        }`;

        webviewView.webview.postMessage({
          command: "updateTimer",
          hours: currentHours.toString().padStart(2, "0"),
          minutes: currentMinutes.toString().padStart(2, "0"),
          seconds: currentSeconds.toString().padStart(2, "0"),
          isBreakTime: isBreakTime,
        });
      }, 1000);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
      return `<!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pomodoro Timer</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          :root {
            --primary-color: var(--vscode-editor-background);
            --secondary-color: var(--vscode-editor-foreground);
            --accent-color: var(--vscode-button-background);
            --hover-color: var(--vscode-button-hoverBackground);
          }
          body {
            background-color: var(--primary-color);
            color: var(--secondary-color);
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
            color: var(--secondary-color);
            cursor: pointer;
            font-size: 16px;
            padding: 4px;
          }
          .settings-button:hover, .restart-button:hover {
            color: var(--accent-color);
          }
          .mode-indicator {
            font-size: 14px;
            padding: 4px 8px;
            border-radius: 4px;
            background-color: var(--accent-color);
            color: var(--vscode-button-foreground);
          }
          .container {
            display: flex;
            justify-items: center;
            align-items: center;
            font-size: 32px;
            margin-bottom: 20px;
          }
          .container.visible {
            display: flex;
          }
          .container input {
            width: 60px;
            height: 40px;
            font-size: 32px;
            text-align: center;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--secondary-color);
            margin: 0 5px;
            border-radius: 4px;
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
            background-color: #000000;
            color: #ffffff;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .btn:hover {
            background-color: #000000;
          }
          .btn-primary {
            background-color: #000000;
          }
          .btn-primary.paused {
            background-color: #000000;
          }
          .hidden {
            display: none;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="mode-indicator" id="mode-indicator">Tempo de Trabalho</div>
          <div class="header-buttons">
            <button class="restart-button" id="restart-button" title="Reiniciar">🔄</button>
            <button class="settings-button" id="settings-button" title="Configurações">⚙️</button>
          </div>
        </div>
        <div class="container" id="timer-container">
          <input type="text" placeholder="00" value="00" id="hours">:
          <input type="text" placeholder="00" value="00" id="minutes">:
          <input type="text" placeholder="00" value="00" id="seconds">
        </div>
        <div class="buttons">
          <button class="btn btn-primary" id="btn-start" title="Iniciar/Pausar">Começar</button>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          const inputHours = document.getElementById("hours");
          const inputMinutes = document.getElementById("minutes");
          const inputSeconds = document.getElementById("seconds");
          const btnStart = document.getElementById("btn-start");
          const btnSettings = document.getElementById("settings-button");
          const btnRestart = document.getElementById("restart-button");
          const modeIndicator = document.getElementById("mode-indicator");
          const timerContainer = document.getElementById("timer-container");

          // Show timer on load if it's running
          vscode.postMessage({ command: 'checkTimerState' });

          btnStart.addEventListener("click", () => {
            if (btnStart.textContent === "Começar" || btnStart.textContent === "Retomar") {
              vscode.postMessage({
                command: 'startTimer'
              });
              btnStart.textContent = "Pausar";
              btnStart.classList.add('paused');
            } else {
              vscode.postMessage({
                command: 'pauseTimer'
              });
              btnStart.textContent = "Retomar";
              btnStart.classList.remove('paused');
            }
          });

          btnSettings.addEventListener("click", () => {
            vscode.postMessage({
              command: 'openSettings'
            });
          });

          btnRestart.addEventListener("click", () => {
            vscode.postMessage({
              command: 'restartTimer'
            });
          });

          window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
              case 'updateTimer':
                inputHours.value = message.hours;
                inputMinutes.value = message.minutes;
                inputSeconds.value = message.seconds;
                modeIndicator.textContent = message.isBreakTime ? 'Tempo de Descanso' : 'Tempo de Trabalho';
                break;
              case 'updatePauseState':
                btnStart.textContent = message.isPaused ? 'Retomar' : 'Pausar';
                if (message.isPaused) {
                  btnStart.classList.remove('paused');
                } else {
                  btnStart.classList.add('paused');
                }
                break;
            }
          });
        </script>
      </body>
      </html>`;
    }
  }

  const provider = new PomodoroView(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(PomodoroView.viewType, provider)
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
