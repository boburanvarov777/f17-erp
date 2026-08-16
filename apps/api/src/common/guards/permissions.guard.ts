import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, JwtUser } from '../decorators';
import { ALL_PERMISSIONS } from '../permissions';

/**
 * Backend-side permission enforcement. Frontend role checks are never trusted.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user: JwtUser | undefined = context.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('Not authenticated');

    const perms = user.permissions ?? [];
    if (perms.includes(ALL_PERMISSIONS)) return true;

    const ok = required.some((p) => perms.includes(p));
    if (!ok) throw new ForbiddenException(`Missing permission: ${required.join(' | ')}`);
    return true;
  }
}
