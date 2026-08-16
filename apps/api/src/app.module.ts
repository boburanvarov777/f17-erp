import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { existsSync } from 'fs';
import { join } from 'path';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClientsModule } from './modules/clients/clients.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { ModelsModule } from './modules/models/models.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ProductionModule } from './modules/production/production.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { SearchModule } from './modules/search/search.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SchedulerService } from './scheduler.service';
import { TelegramModule } from './telegram/telegram.module';

const WEB_DIST = join(__dirname, '..', '..', 'web', 'dist', 'web', 'browser');

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    RealtimeModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RolesModule,
    DepartmentsModule,
    ClientsModule,
    ModelsModule,
    OrdersModule,
    ProductionModule,
    WarehouseModule,
    TasksModule,
    DashboardModule,
    NotificationsModule,
    ReportsModule,
    SearchModule,
    TelegramModule,
    // The Angular build is served by the same service in production.
    ...(existsSync(WEB_DIST)
      ? [ServeStaticModule.forRoot({ rootPath: WEB_DIST, exclude: ['/api/{*splat}', '/docs/{*splat}'] })]
      : []),
  ],
  providers: [
    SchedulerService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(_consumer: MiddlewareConsumer): void {}
}
