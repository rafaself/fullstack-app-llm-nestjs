import { DataSource, type DataSourceOptions } from 'typeorm';
import { migrateDatabase } from './migrate.js';

export async function createMigratedDataSource(
  options?: DataSourceOptions,
): Promise<DataSource> {
  if (!options) throw new Error('Database options are required.');
  const { migrateOnStart = true, ...dataSourceOptions } =
    options as DataSourceOptions & { migrateOnStart?: boolean };
  const dataSource = await new DataSource(dataSourceOptions).initialize();
  try {
    if (migrateOnStart) await migrateDatabase(dataSource);
    return dataSource;
  } catch (error) {
    await dataSource.destroy();
    throw error;
  }
}
