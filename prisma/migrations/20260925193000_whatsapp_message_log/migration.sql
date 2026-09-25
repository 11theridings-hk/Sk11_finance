-- CreateTable
CREATE TABLE "WhatsAppMessageLog" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'command',
    "peer" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "error" TEXT,
    "messageId" TEXT,
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_createdAt_idx" ON "WhatsAppMessageLog"("createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_direction_createdAt_idx" ON "WhatsAppMessageLog"("direction", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_peer_createdAt_idx" ON "WhatsAppMessageLog"("peer", "createdAt");
