import { createApp } from "./app";
import { loadEnv } from "./env";

const env = loadEnv();
const app = createApp(env);

app.listen(env.PORT, () => {
  console.log(`[api] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
