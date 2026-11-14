import { execSync } from "node:child_process";

export default function globalTeardown() {
  execSync("docker compose -p pm-e2e -f ../docker-compose.yml down -v", {
    stdio: "inherit",
  });
}
