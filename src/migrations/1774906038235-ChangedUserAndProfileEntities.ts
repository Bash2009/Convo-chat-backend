import { MigrationInterface, QueryRunner } from "typeorm";

export class ChangedUserAndProfileEntities1774906038235 implements MigrationInterface {
    name = 'ChangedUserAndProfileEntities1774906038235'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profiles" ADD CONSTRAINT "UQ_120478a7d42ef6fefbe2505e82c" UNIQUE ("uniqueName")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profiles" DROP CONSTRAINT "UQ_120478a7d42ef6fefbe2505e82c"`);
    }

}
