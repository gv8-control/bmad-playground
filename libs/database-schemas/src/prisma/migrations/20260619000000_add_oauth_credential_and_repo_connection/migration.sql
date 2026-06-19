-- CreateTable
CREATE TABLE "oauth_credentials" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "encrypted_dek" TEXT NOT NULL,
    "dek_nonce" TEXT NOT NULL,
    "encrypted_token" TEXT NOT NULL,
    "token_nonce" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repo_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "repo_url" TEXT NOT NULL,
    "credential_health" TEXT NOT NULL DEFAULT 'healthy',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repo_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "oauth_credentials_user_id_key" ON "oauth_credentials"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "repo_connections_user_id_key" ON "repo_connections"("user_id");

-- AddForeignKey
ALTER TABLE "oauth_credentials" ADD CONSTRAINT "oauth_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repo_connections" ADD CONSTRAINT "repo_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
