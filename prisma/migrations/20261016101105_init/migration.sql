-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "pinnedMessageId" TEXT;
