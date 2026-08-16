import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtUser } from '../../common/decorators';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
    });
  }

  /** Re-checks the user on every request so blocking/archiving takes effect immediately. */
  async validate(payload: JwtUser): Promise<JwtUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('User is not active');
    return {
      sub: user.id,
      login: user.login,
      roleId: user.roleId,
      roleCode: user.role.code,
      permissions: user.role.permissions,
      departmentId: user.departmentId,
      fullName: `${user.lastName} ${user.firstName}`,
    };
  }
}
