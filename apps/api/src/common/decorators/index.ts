import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms);

export const AUDIT_KEY = 'auditAction';
export const Audit = (action: string, entity?: string) => SetMetadata(AUDIT_KEY, { action, entity });

export interface JwtUser {
  sub: string;
  login: string;
  roleId: string;
  roleCode: string;
  permissions: string[];
  departmentId: string | null;
  fullName: string;
}

export const CurrentUser = createParamDecorator((data: keyof JwtUser | undefined, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return data ? req.user?.[data] : req.user;
});
