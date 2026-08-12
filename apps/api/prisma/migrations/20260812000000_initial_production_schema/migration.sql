-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "accentColor" TEXT,
    "title" TEXT,
    "bio" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "team" TEXT NOT NULL DEFAULT 'G_ARTS',
    "skills" TEXT NOT NULL DEFAULT '[]',
    "availability" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "onboardingDismissedAt" DATETIME,
    "onboardingCompletedAt" DATETIME,
    "onboardingRequiredAt" DATETIME
);

-- CreateTable
CREATE TABLE "LibraryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GNewsTodo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GNewsTodo_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TranslationArticleWeek" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "topic" TEXT,
    "readingList" TEXT NOT NULL DEFAULT '[]',
    "openingDone" BOOLEAN NOT NULL DEFAULT false,
    "bodyOneTwoDone" BOOLEAN NOT NULL DEFAULT false,
    "bodyThreeDone" BOOLEAN NOT NULL DEFAULT false,
    "closingDone" BOOLEAN NOT NULL DEFAULT false,
    "readAloudDone" BOOLEAN NOT NULL DEFAULT false,
    "finalRevisionDone" BOOLEAN NOT NULL DEFAULT false,
    "submittedArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TranslationArticleWeek_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TranslationArticleDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "whatDid" TEXT,
    "whatsNext" TEXT,
    "readingProgress" TEXT,
    "writingProgress" TEXT,
    "listenedDone" BOOLEAN NOT NULL DEFAULT false,
    "notesCaptured" BOOLEAN NOT NULL DEFAULT false,
    "readingDone" BOOLEAN NOT NULL DEFAULT false,
    "writingDone" BOOLEAN NOT NULL DEFAULT false,
    "deepReadingDone" BOOLEAN NOT NULL DEFAULT false,
    "articleFinalised" BOOLEAN NOT NULL DEFAULT false,
    "submitted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TranslationArticleDay_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "TranslationArticleWeek" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'campus',
    "seriesKey" TEXT,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME,
    "allDay" BOOLEAN NOT NULL DEFAULT true,
    "venue" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "coverage" TEXT NOT NULL DEFAULT '[]',
    "sourceKind" TEXT,
    "sourceUid" TEXT,
    "sourceUrl" TEXT,
    "sourceNote" TEXT,
    "verifiedAt" DATETIME,
    "verifiedById" TEXT,
    "chatChannelId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    "completedAt" DATETIME,
    "statusBeforeCompletion" TEXT
);

-- CreateTable
CREATE TABLE "EventDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "websiteEventCreated" BOOLEAN NOT NULL DEFAULT false,
    "websiteApproved" BOOLEAN NOT NULL DEFAULT false,
    "parentsShareUrl" TEXT,
    "parentsLinkShared" BOOLEAN NOT NULL DEFAULT false,
    "parentsShareApproved" BOOLEAN NOT NULL DEFAULT false,
    "shortsUrl" TEXT,
    "shortsUploaded" BOOLEAN NOT NULL DEFAULT false,
    "shortsApproved" BOOLEAN NOT NULL DEFAULT false,
    "videoUrl" TEXT,
    "videoUploaded" BOOLEAN NOT NULL DEFAULT false,
    "videoApproved" BOOLEAN NOT NULL DEFAULT false,
    "videoThumbnailDone" BOOLEAN NOT NULL DEFAULT false,
    "videoThumbnailApproved" BOOLEAN NOT NULL DEFAULT false,
    "videoShareUrl" TEXT,
    "videoSharedToParents" BOOLEAN NOT NULL DEFAULT false,
    "videoShareApproved" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EventDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_done',
    "completionKind" TEXT,
    "assigneeId" TEXT,
    "dueAt" DATETIME,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "doneAt" DATETIME,
    "submittedAt" DATETIME,
    "submittedById" TEXT,
    "approvedAt" DATETIME,
    "approvedById" TEXT,
    "notRequiredAt" DATETIME,
    "notRequiredById" TEXT,
    "copiedFromEventId" TEXT,
    CONSTRAINT "Task_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_team_idx" ON "User"("team");

-- CreateIndex
CREATE INDEX "LibraryItem_kind_idx" ON "LibraryItem"("kind");

-- CreateIndex
CREATE INDEX "GNewsTodo_ownerId_completedAt_idx" ON "GNewsTodo"("ownerId", "completedAt");

-- CreateIndex
CREATE INDEX "TranslationArticleWeek_ownerId_idx" ON "TranslationArticleWeek"("ownerId");

-- CreateIndex
CREATE INDEX "TranslationArticleWeek_weekStart_idx" ON "TranslationArticleWeek"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationArticleWeek_ownerId_weekStart_key" ON "TranslationArticleWeek"("ownerId", "weekStart");

-- CreateIndex
CREATE INDEX "TranslationArticleDay_weekId_idx" ON "TranslationArticleDay"("weekId");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationArticleDay_weekId_weekday_key" ON "TranslationArticleDay"("weekId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "Event_sourceUid_key" ON "Event"("sourceUid");

-- CreateIndex
CREATE INDEX "Event_startsAt_idx" ON "Event"("startsAt");

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE INDEX "Event_category_idx" ON "Event"("category");

-- CreateIndex
CREATE UNIQUE INDEX "EventDelivery_eventId_key" ON "EventDelivery"("eventId");

-- CreateIndex
CREATE INDEX "Task_eventId_idx" ON "Task"("eventId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_copiedFromEventId_idx" ON "Task"("copiedFromEventId");


