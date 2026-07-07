import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveWebsiteFromProfile1783446753901 implements MigrationInterface {
    name = 'RemoveWebsiteFromProfile1783446753901'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profiles" DROP COLUMN "website"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "profiles" ADD "website" character varying`);
    }

}
