import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTeacherEarnedPrizeSupport1770000000000 implements MigrationInterface {
  name = 'AddTeacherEarnedPrizeSupport1770000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "earned_prizes" ADD COLUMN IF NOT EXISTS "teacherId" uuid`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_earned_prizes_teacherId" ON "earned_prizes" ("teacherId")`);
    await queryRunner.query(`ALTER TABLE "earned_prizes" ALTER COLUMN "classId" DROP NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "earned_prizes"
      ADD CONSTRAINT "FK_earned_prizes_teacher"
      FOREIGN KEY ("teacherId") REFERENCES "teachers"("id")
      ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "earned_prizes" DROP CONSTRAINT IF EXISTS "FK_earned_prizes_teacher"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_earned_prizes_teacherId"`);
    await queryRunner.query(`ALTER TABLE "earned_prizes" DROP COLUMN IF EXISTS "teacherId"`);
    await queryRunner.query(`ALTER TABLE "earned_prizes" ALTER COLUMN "classId" SET NOT NULL`);
  }
}
