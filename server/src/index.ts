import express from "express";
import path from "path";
import { api } from "./routes/api";
import { seedPastNegotiations } from "./store";

const PORT = Number(process.env.PORT) || 4173;

async function main() {
  const app = express();
  app.use(express.json());
  app.use("/api", api);
  app.use(express.static(path.join(__dirname, "../../public")));

  await seedPastNegotiations();

  app.listen(PORT, () => {
    console.log(`CSP negotiation demo running at http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
