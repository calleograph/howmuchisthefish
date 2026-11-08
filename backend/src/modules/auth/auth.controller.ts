import { Body, Controller, Post, Request } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginThrottleService } from './login-throttle.service';
import { Public } from './public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly throttle: LoginThrottleService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    this.throttle.assertNotLocked(dto.email);
    try {
      const user = await this.authService.validateLocalUser(
        dto.email,
        dto.password,
      );
      this.throttle.recordSuccess(dto.email);
      return this.authService.issueToken(user);
    } catch (err) {
      this.throttle.recordFailure(dto.email);
      throw err;
    }
  }

  @ApiBearerAuth()
  @Post('me')
  me(@Request() req: any) {
    return req.user;
  }
}
