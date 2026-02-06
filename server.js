const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io');
const { exec } = require('child_process'); // Declare this once at the top

// 1. Create the web server
const server = http.createServer((req, res) => {
    fs.readFile(__dirname + '/index.html', (err, data) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data);
    });
});

// 2. Attach Socket.io
const io = new Server(server);

io.on('connection', (socket) => {
    console.log('A user connected to Afro AI!');

    // This handles the "Run" button logic
    socket.on('runCode', (code) => {
        console.log('Running code:', code);
        
        // This executes the text as real Python code on your laptop
        exec(`python -c "${code.replace(/"/g, '\\"')}"`, (error, stdout, stderr) => {
            if (error) {
                // Send back the Python error message
                socket.emit('output', 'Python Error: ' + stderr);
                return;
            }
            // Send back the actual result (like 4)
            socket.emit('output', stdout || 'Code executed (No output)');
        });
    });
});

// 3. Start the server
server.listen(3000, () => {
    console.log('Afro AI is LIVE at http://localhost:3000');
});
let pythonProcess; // Variable to hold the running code

io.on('connection', (socket) => {
    console.log('A user connected to Afro AI!');

    socket.on('runCode', (code) => {
        console.log('Running code...');
        
        // Start the Python process and save it to our variable
        pythonProcess = exec(`python -c "${code.replace(/"/g, '\\"')}"`, (error, stdout, stderr) => {
            if (error) {
                socket.emit('output', 'Python Error: ' + stderr);
                return;
            }
            socket.emit('output', stdout || 'Code executed successfully.');
        });
    });

    // NEW: Logic to kill the process
    socket.on('stopCode', () => {
        if (pythonProcess) {
            pythonProcess.kill(); // This kills the Python engine
            console.log('Process stopped by user.');
            socket.emit('output', '--- PROCESS TERMINATED BY USER ---');
        }
    });
});