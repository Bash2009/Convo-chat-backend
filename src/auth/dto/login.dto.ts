import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: 'Firebase UID' })
  @IsString()
  @IsNotEmpty()
  uid: string;
}
