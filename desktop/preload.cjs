const { contextBridge, ipcRenderer, webUtils } = require("electron");
const { pathToFileURL } = require("node:url");

contextBridge.exposeInMainWorld("mdpdf", {
  open: () => ipcRenderer.invoke("document:open"),
  openFolder: () => ipcRenderer.invoke("folder:open"),
  save: (path, content) => ipcRenderer.invoke("document:save", path, content),
  read: path => ipcRenderer.invoke("document:read", path),
  watch: path => ipcRenderer.invoke("document:watch", path),
  inspect: content => ipcRenderer.invoke("document:inspect", content),
  renderPreview: (content, path, options) => ipcRenderer.invoke("preview:render", content, path, options),
  generatePdf: (content, path, options) => ipcRenderer.invoke("pdf:generate", content, path, options),
  fonts: () => ipcRenderer.invoke("fonts:list"),
  themes: () => ipcRenderer.invoke("themes:list"),
  history: () => ipcRenderer.invoke("history:list"),
  templates: () => ipcRenderer.invoke("templates:list"),
  saveTemplate: (name, options) => ipcRenderer.invoke("templates:save", name, options),
  deleteTemplate: id => ipcRenderer.invoke("templates:delete", id),
  settingsHistory: () => ipcRenderer.invoke("settings-history:list"),
  openEditor: (path, line, column) => ipcRenderer.invoke("editor:open", path, line, column),
  reveal: path => ipcRenderer.invoke("file:reveal", path),
  openPath: path => ipcRenderer.invoke("file:open", path),
  copy: value => ipcRenderer.invoke("clipboard:write", value),
  onDocumentChanged: callback => { const listener = (_event, path) => callback(path); ipcRenderer.on("document:changed", listener); return () => ipcRenderer.removeListener("document:changed", listener); },
  onWatchError: callback => { const listener = (_event, path) => callback(path); ipcRenderer.on("document:watch-error", listener); return () => ipcRenderer.removeListener("document:watch-error", listener); },
  filePath: file => webUtils.getPathForFile(file),
  fileUrl: path => pathToFileURL(path).href
});
