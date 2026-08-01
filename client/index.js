import { createElement } from "react";
import { render } from "ink";
import App from "./src/App.jsx";

// Exit cleanly when stdin closes (e.g. piped input in tests).
process.stdin.on("end", () => process.exit(0));

render(createElement(App));
