import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTeacherProfileFields1770000000001 implements MigrationInterface {
  name = 'AddTeacherProfileFields1770000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "profileImageUrl" character varying`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "teachers" DROP COLUMN IF EXISTS "profileImageUrl"`);
  }
}
