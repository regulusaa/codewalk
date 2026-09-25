# Codewalk

Explore how a piece of code works, line by line.

Paste up to 300 non-empty lines, choose a programming language, and ask Codewalk to explain each line. Click a line to see its explanation and the other lines it connects to. A short trail helps you move back through what you explored.

## Try it locally

```bash
npm install
npm run dev
```

Open the address shown by Vite. Codewalk asks for your own Anthropic API key to run an analysis. It sends the code you paste directly to Anthropic and saves a working key in your browser's local storage until you clear it. Use code you are comfortable sharing with that service.

## Built with

React, Vite, and CodeMirror. The analysis runs through the Anthropic Messages API; there is no separate server in this repository.
