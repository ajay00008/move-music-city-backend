import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Makes all grade groups global (schoolId = null) so they can be shared across
 * all schools and assigned to teachers in any school. Also sets schoolId to null
 * for prizes so they remain associated with their grade groups.
 */
export class MakeGradeGroupsGlobal1731340800000 implements MigrationInterface {
  name = 'MakeGradeGroupsGlobal1731340800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "grade_groups" SET "schoolId" = NULL WHERE "schoolId" IS NOT NULL`);
    await queryRunner.query(`UPDATE "prizes" SET "schoolId" = NULL WHERE "schoolId" IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Cannot reliably restore previous schoolId values; leave as no-op or run a custom backfill
  }
}
