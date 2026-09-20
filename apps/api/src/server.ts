import { createApp } from "./app";
import { loadEnv } from "./env";

const env = loadEnv();
const app = createApp(env);

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(
    `[api] listening on http://0.0.0.0:${env.PORT} (${env.NODE_ENV}) — reachable via localhost and your LAN IP`,
  );
});
