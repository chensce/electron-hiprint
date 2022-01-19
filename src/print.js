"use strict";

const { app, BrowserWindow, ipcMain, Tray, Menu } = require("electron");
const path = require("path");
const helper = require("./helper");

// 托盘
async function initTray() {
  let trayPath = path.join(app.getAppPath(), "/assets/icons/tray.png");
  APP_TRAY = new Tray(trayPath);
  APP_TRAY.setToolTip("hiprint"); // 托盘标题
  // 托盘菜单
  let trayMenuTemplate = [
    {
      label: "退出",
      click: () => {
        MAIN_WINDOW.destroy();
        APP_TRAY.destroy();
        helper.appQuit();
      },
    },
  ];
  const contextMenu = Menu.buildFromTemplate(trayMenuTemplate);
  APP_TRAY.setContextMenu(contextMenu);
  // 监听点击事件
  APP_TRAY.on("click", function() {
    if (!MAIN_WINDOW.isVisible()) {
      MAIN_WINDOW.show();
      MAIN_WINDOW.setSkipTaskbar(true);
    }
  });
  return APP_TRAY;
}

// 初始化socket.io
async function initSocketIo() {
  io.on("connection", (client) => {
    // 暂存客户端
    socketStore[client.id] = client;
    // data:{printer:option.printer,html:htmlstr}
    client.emit("printerList", MAIN_WINDOW.webContents.getPrinters());
    client.on("news", (data) => {
      if (data && data.html) {
        data.printer = data.printer;
        data.socketId = client.id;
        PRINT_WINDOW.webContents.send("print-new", data);
      }
    });
  });
  try {
    server.listen(17521);
  } catch (error) {
    alert("服务已开启/端口被占用");
    console.log(error);
  }
}

async function createPrintWindow() {
  const windowOptions = {
    width: 100,
    height: 100,
    show: false,
    webPreferences: {
      contextIsolation: false, // 设置此项为false后，才可在渲染进程中使用electron api
      nodeIntegration: true,
    },
  };
  PRINT_WINDOW = new BrowserWindow(windowOptions);
  let printHtml = path.join("file://", __dirname, "/assets/print.html");
  PRINT_WINDOW.webContents.loadURL(printHtml);
  // PRINT_WINDOW.webContents.openDevTools();
  initPrintEvent();
}

function initPrintEvent() {
  ipcMain.on("do", (event, data) => {
    // socket.emit('news', { id: 1 })
    let socket = socketStore[data.socketId];
    const printers = PRINT_WINDOW.webContents.getPrinters();
    let havePrinter = false;
    let defaultPrinter = "";
    printers.forEach((element) => {
      if (element.name === data.printer) {
        if (element.status != 0) {
          if (socket) {
            socket.emit("error", {
              msg: data.printer + "打印机异常",
              templateId: data.templateId,
            });
          }
          return;
        }
        havePrinter = true;
      }
      if (element.isDefault) {
        defaultPrinter = element.name;
      }
    });
    let deviceName = havePrinter ? data.printer : defaultPrinter;
    // 打印 详见https://www.electronjs.org/zh/docs/latest/api/web-contents 
    PRINT_WINDOW.webContents.print(
      {
        silent: true,
        printBackground: true,
        deviceName: deviceName,
        margins: data.margins || {
          marginType: "none",
        },
        landscape: data.landscape || false,
        copies: data.copies || 1,
        dpi: data.dpi,
        header: data.header,
        footer: data.footer,
        pageSize: data.pageSize,
      },
      (printResult) => {
        if (socket) {
          socket.emit("successs", {
            msg: "打印机成功",
            templateId: data.templateId,
          });
        }
      }
    );
  });
}

module.exports = async () => {
  // 初始化托盘
  await initTray();
  // 初始化socket.io
  await initSocketIo();
  // 创建打印窗口
  await createPrintWindow();
};
