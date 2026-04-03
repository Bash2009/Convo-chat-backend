import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangedUniqueNameToUsername1774912042124 implements MigrationInterface {
    name = 'ChangedUniqueNameToUsername1774912042124'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profiles" RENAME COLUMN "uniqueName" TO "username"`);
        await queryRunner.query(`ALTER TABLE "profiles" RENAME CONSTRAINT "UQ_120478a7d42ef6fefbe2505e82c" TO "UQ_d1ea35db5be7c08520d70dc03f8"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profiles" RENAME CONSTRAINT "UQ_d1ea35db5be7c08520d70dc03f8" TO "UQ_120478a7d42ef6fefbe2505e82c"`);
        await queryRunner.query(`ALTER TABLE "profiles" RENAME COLUMN "username" TO "uniqueName"`);
    }

}
