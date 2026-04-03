import Bytez from "bytez.js";
const sdk = new Bytez("f66b3f81b4a9ff5642f952bd3d0285e5");
const model = sdk.model("deepseek-ai/DeepSeek-V3.1");
model.run([{ "role": "user", "content": "Return the word OK" }]).then(res => console.log(res)).catch(console.error);
