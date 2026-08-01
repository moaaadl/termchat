import { createElement } from "react";
import { render } from "ink";
import App from "./src/App.jsx";

// Clear the terminal before the UI starts.
process.stdout.write("\x1b[2J\x1b[H");

// Exit cleanly when stdin closes (e.g. piped input in tests).
process.stdin.on("end", () => process.exit(0));

render(createElement(App));
