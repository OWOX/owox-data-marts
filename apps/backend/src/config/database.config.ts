import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

enum DbType {
  sqlite = 'sqlite',
  mysql = 'mysql',
}

export function getDatabaseConfig(config: ConfigService): TypeOrmModuleOptions {
  const type = config.get<DbType>('DB_TYPE', DbType.sqlite);

  const dbConfigs: Record<DbType, TypeOrmModuleOptions> = {
    [DbType.sqlite]: {
      type: DbType.sqlite,
      database: config.get<string>('DB_NAME', 'var/sqlite/backend.db'),
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      synchronize: true,
    },
    [DbType.mysql]: {
      type: DbType.mysql,
      host: config.get('DB_HOST'),
      port: config.get<number>('DB_PORT'),
      username: config.get('DB_USERNAME'),
      password: config.get('DB_PASSWORD'),
      database: config.get('DB_DATABASE'),
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      synchronize: true,
    },
  };

  return dbConfigs[type];
}
