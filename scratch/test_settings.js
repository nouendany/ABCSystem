const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// 1. Start a simple static file server on port 5000
const server = http.createServer((req, res) => {
  let urlPath = req.url === '/' ? '/index.html' : req.url;
  urlPath = urlPath.split('?')[0].split('#')[0];
  
  const filePath = path.join(__dirname, '..', urlPath);
  const ext = path.extname(filePath);
  
  let contentType = 'text/html';
  if (ext === '.js') contentType = 'text/javascript';
  else if (ext === '.css') contentType = 'text/css';
  else if (ext === '.json') contentType = 'application/json';
  else if (ext === '.png') contentType = 'image/png';
  else if (ext === '.jpg') contentType = 'image/jpeg';
  else if (ext === '.svg') contentType = 'image/svg+xml';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(5000, '127.0.0.1', () => {
  console.log('Static local server running at http://127.0.0.1:5000/');
  
  // 2. Start Chrome headlessly
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeProcess = spawn(chromePath, [
    '--headless',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    'http://127.0.0.1:5000/index.html'
  ]);
  
  chromeProcess.on('error', (err) => {
    console.error('Failed to start Chrome:', err);
    server.close();
    process.exit(1);
  });

  // 3. Connect to debugging port
  setTimeout(async () => {
    try {
      const res = await fetch('http://127.0.0.1:9222/json/list');
      const data = await res.json();
      
      const pageTarget = data.find(t => t.type === 'page' && t.url.includes('127.0.0.1:5000'));
      if (!pageTarget) {
        console.error('No page target found!');
        chromeProcess.kill();
        server.close();
        process.exit(1);
      }
      
      const webSocketDebuggerUrl = pageTarget.webSocketDebuggerUrl;
      console.log('Connected to Chrome WebSocket:', webSocketDebuggerUrl);
      
      const ws = new WebSocket(webSocketDebuggerUrl);
      
      ws.onopen = () => {
        console.log('Session opened. Enabling domains...');
        ws.send(JSON.stringify({ id: 1, method: 'Console.enable' }));
        ws.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
        
        // Automated script to log in and click Master Settings
        setTimeout(() => {
          console.log('Evaluating login & navigation script...');
          const automationScript = `
            (function() {
              const usernameInput = document.getElementById('login-username');
              const passwordInput = document.getElementById('login-password');
              const loginForm = document.getElementById('login-form');
              
              if (usernameInput && passwordInput && loginForm) {
                usernameInput.value = 'admin';
                passwordInput.value = 'admin';
                
                // Submit the form
                const event = new Event('submit', { cancelable: true });
                loginForm.dispatchEvent(event);
                console.log('Form submit dispatched.');
                
                // Wait 1.5 seconds and click Settings
                setTimeout(() => {
                  const settingsBtn = document.getElementById('nav-item-settings');
                  if (settingsBtn) {
                    settingsBtn.click();
                    console.log('Settings navigation item clicked.');
                    
                    // Dump status of Settings container
                    setTimeout(() => {
                      const content = document.getElementById('settings-tab-content');
                      console.log('Settings tab content length:', content ? content.innerHTML.length : 'null');
                      console.log('Settings tab content text:', content ? content.innerText.substring(0, 300) : 'null');
                    }, 1000);
                  } else {
                    console.error('nav-item-settings not found after submit!');
                  }
                }, 1500);
              } else {
                console.error('Login elements not found!');
              }
            })();
          `;
          ws.send(JSON.stringify({
            id: 3,
            method: 'Runtime.evaluate',
            params: { expression: automationScript }
          }));
        }, 3000);
      };
      
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        
        if (msg.method === 'Runtime.consoleAPICalled') {
          const args = msg.params.args.map(a => a.value || a.description || JSON.stringify(a));
          console.log(`[BROWSER CONSOLE ${msg.params.type.toUpperCase()}]:`, ...args);
        }
        
        if (msg.method === 'Runtime.exceptionThrown') {
          console.error('[BROWSER EXCEPTION]:', msg.params.exceptionDetails.exception.description);
        }
      };
      
      // End test after 12 seconds
      setTimeout(() => {
        console.log('Finished capturing logs. Cleaning up...');
        ws.close();
        chromeProcess.kill();
        server.close();
        process.exit(0);
      }, 12000);
      
    } catch (err) {
      console.error('Error connecting to devtools:', err);
      chromeProcess.kill();
      server.close();
      process.exit(1);
    }
  }, 4000);
});
