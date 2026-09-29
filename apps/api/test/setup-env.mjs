import { fileURLToPath } from "node:url";

process.env.DOTENV_CONFIG_PATH = fileURLToPath(new URL("./.env.test", import.meta.url));
