const fs = require('fs');
const readline = require('readline');

const logPath = 'C:\\Users\\Adriano Amorim\\.gemini\\antigravity-ide\\brain\\049c37d8-9495-4e96-98a3-3c4b56d25770\\.system_generated\\logs\\transcript.jsonl';

const rl = readline.createInterface({
  input: fs.createReadStream(logPath),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  try {
    const data = JSON.parse(line);
    if (data.type === 'USER_INPUT' && (data.content.includes('botões') || data.content.includes('cores') || data.content.includes('color'))) {
      console.log(`[USER STEP ${data.step_index}] ${data.content}`);
      console.log('='.repeat(80));
    }
  } catch (err) {
    // ignore
  }
});
