import {init} from "./hooks/init.mjs";
import ready from "./hooks/ready.mjs";
import renderFilePicker from "./hooks/renderFilePicker.mjs";

Hooks.once("init", init);
Hooks.once("ready", ready);
Hooks.on("renderFilePicker", renderFilePicker);
