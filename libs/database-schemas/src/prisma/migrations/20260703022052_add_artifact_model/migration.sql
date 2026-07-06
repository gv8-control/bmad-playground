-- CreateTable
CREATE TABLE "artifacts" (
    "id" TEXT NOT NULL,
    "repo_connection_id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "last_modified_at" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "artifacts_repo_connection_id_path_key" ON "artifacts"("repo_connection_id", "path");

-- AddForeignKey
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_repo_connection_id_fkey" FOREIGN KEY ("repo_connection_id") REFERENCES "repo_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
