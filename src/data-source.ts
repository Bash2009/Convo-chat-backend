import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

const {
  DATABASE_URL,
  DB_HOST = 'localhost',
  DB_PORT = '5432',
  DB_USERNAME = 'postgres',
  DB_PASSWORD,
  DB_NAME,
} = process.env;

export const AppDataSource = new DataSource({
  type: 'postgres',
  ...(DATABASE_URL
    ? { url: DATABASE_URL }
    : {
        host: DB_HOST,
        port: parseInt(DB_PORT, 10),
        username: DB_USERNAME,
        password: DB_PASSWORD,
        database: DB_NAME,
      }),
  entities: ['dist/**/*.entity.js'],
  migrations: ['dist/migrations/*.js'],
});
