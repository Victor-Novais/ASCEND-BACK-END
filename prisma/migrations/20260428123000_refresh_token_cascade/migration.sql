ALTER TABLE "RefreshToken" DROP CONSTRAINT "RefreshToken_userId_fkey";

ALTER TABLE "RefreshToken"
ADD CONSTRAINT "RefreshToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
