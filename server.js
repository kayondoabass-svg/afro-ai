const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { spawn } = require('child_process');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

// --- THE AI CHAT LOGIC ---
io.on('connection', (socket) => {
    console.log('User connected to Afro AI');

    socket.on('ai-prompt', async (prompt) => {
        try {
            const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
                model: "deepseek/deepseek-r1:free",
                messages: [
                    { 
                        role: "system", 
                        content: "You are Afro AI, a master Python developer. Return ONLY the requested Python code. No conversational filler, no markdown backticks (```), just the code." 
                    },
                    { role: "user", content: prompt }
                ]
            }, {
                headers: {
                    "Authorization": `Bearer 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`,
                    "Content-Type": "application/json"
                }
            });

            const aiCode = response.data.choices[0].message.content;
            socket.emit('ai-response', aiCode);
        } catch (error) {
            console.error("AI Error:", error.message);
            socket.emit('ai-response', "# Error: The AI brain is currently offline. Check your API key.");
        }
    });

    // --- THE PYTHON ENGINE LOGIC ---
    socket.on('run-python', (code) => {
        const pyProcess = spawn('python3', ['-c', code]);

        pyProcess.stdout.on('data', (data) => {
            socket.emit('python-output', data.toString());
        });

        pyProcess.stderr.on('data', (data) => {
            socket.emit('python-output', `ERROR: ${data.toString()}`);
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Afro AI is LIVE at http://localhost:${PORT}`);
});