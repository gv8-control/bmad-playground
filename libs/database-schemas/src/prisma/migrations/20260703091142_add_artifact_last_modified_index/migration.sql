-- CreateIndex
CREATE INDEX "artifacts_repo_connection_id_last_modified_at_idx" ON "artifacts"("repo_connection_id", "last_modified_at");
