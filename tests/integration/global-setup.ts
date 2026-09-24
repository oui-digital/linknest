import { requireTestDatabaseUrl } from "./test-db-guard";

// Fail the run (not skip) when there is no disposable database: these tests
// are the release check for the publish/moderation/admission races.
export default function setup() {
  requireTestDatabaseUrl();
}
