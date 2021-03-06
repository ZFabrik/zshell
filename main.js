const { app, BrowserWindow, ipcMain } = require('electron')
const PDFWindow = require('electron-pdf-window')
const path = require('path')
const url = require('url')

let win

//
//  handle command line. Turn all --x=y into {x:y}.
//
var args = {};

if (process.argv.length>0) {
  var last;
  for (var i=0;i<process.argv.length;i++) {
    var p = process.argv[i];
    if (p.indexOf("--")==0) {
      last = p.substring(2,p.length);
      // default
      args[last]=true
    } else {
      if (last!=null) {
        args[last]=p;
        last=null;
      }
    }
  }
}

var partition=args['partition'];
var configFile=args['config'];

//
// Let's not claim we are electron - as Google will block us.
//
app.userAgentFallback = app.userAgentFallback.replace('Electron/' + process.versions.electron, '');


//
// standard wiring
//
app.on('ready', initialize)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  console.log('window-all-closed')
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  console.log('activate')
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    initialize()
  }
})

// handling of basic auth
// map of pending logins
var pendingLogins = {};

app.on('login', (event, webContents, request, authInfo, callback) => {
  console.log('login: '+JSON.stringify(event))
  // note: We need to open a window, ask for login data and
  // finally call back to continue.
  // we leave this to the renderer after memorizing the callback
  var r = JSON.stringify(request);

  if (pendingLogins[r]!=null) {
    // it's a retry without an attempt to supply login data. Means, it was cancelled.
    var cb = pendingLogins[r];
    delete pendingLogins[r];
    console.log("Failing auth for "+r)
    // let the default rule
  } else {
    console.log("Starting auth procedure for "+r)
    // memorizing callback
    pendingLogins[r]=callback;
    // start login with renderer
    win.webContents.send('get-login-auth',r,request,authInfo);
    // make sure it is not rejected
    event.preventDefault()
    // wait...
  }
});

// callback from renderer to complete login
ipcMain.on('set-login-auth',(event,r,userName,password) => {
  console.log('set-login-auth')
  var cb = pendingLogins[r];
  delete pendingLogins[r];
  if (cb) {
    cb(userName,password);
  }
});

// end login handling

// open link in window happens by open the index.html
// and sending some non-file stored config.
ipcMain.on('open-in-window',(event,config) => {
  console.log('open-in-window: '+JSON.stringify(config))

  var options = config.options;

  if (options==null) {
    options={};
  }
  if (options.webPreferences==null) {
    options.webPreferences = {};
  }

  var win = new BrowserWindow(options);
  // add pdf support
  PDFWindow.addSupport(win)

  // tell the browser window to initialize
  win.webContents.on('did-finish-load', ()=>{
    console.log('did-finish-load')
    /*
    Pass config to renderer which will initialize after receiving
    */
    win.webContents.send('initialize', {
      content: [{ url: config.url, tabTitle:"external", maximize:true, preload:"1" }],
      partition:partition
    });
  });

  loadIndexHtml(win);
});

//reload upon call from child
ipcMain.on('open-dev-tools', (event, arg) => {
  console.log("open-dev-tools")
  if (win!=null) {
    win.webContents.openDevTools();
  }
})



// reload upon call from child
ipcMain.on('reload', (event, arg) => {
  console.log("reloading...")
  if (win!=null) {
    win.reload();
  }
})

// ignore certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    // Verification logic.
    event.preventDefault()
    callback(true)
})

function initialize() {
  console.log('initialize')
  // Create the browser window.
  win = new BrowserWindow({
    width: 1024,
    height: 600,
    icon:'z-front.png',
    webPreferences: {
      partition:partition,
      nodeIntegration: true,
      webviewTag: true
    },
  })



  // load config

  if (!configFile) {
    configFile=path.dirname(process.execPath)+'/default.json';
  }

  loadIndexHtml(win);

  // tell the browser window to initialize
  win.webContents.on('did-finish-load', ()=>{
    console.log('did-finish-load')
    /*
    Pass config to renderer which will initialize after receiving
    */
    win.webContents.send('initialize', {
      configFile:configFile,
      partition:partition
    });
    console.log('sent config to web content')
  });

  // Emitted when the window is closed.
  win.on('closed', () => {
    console.log('closed')
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
  })

}

function loadIndexHtml(win) {
  // load the index.html of the app.
  win.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))
}
