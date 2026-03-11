/**
 * Run TypeORM migrations using compiled JS. Use after build on production:
 *   npm run build && node dist/run-migrations.js
 * No ts-node required.
 */
import { AppDataSource } from './config/database';

AppDataSource.initialize()
  .then(() => AppDataSource.runMigrations())
  .then((migrations) => {
    if (migrations.length === 0) {
      console.log('No pending migrations.');
    } else {
      console.log('Ran migrations:', migrations.map((m) => m.name).join(', '));
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
