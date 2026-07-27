import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: 'UID is required' })
  uid: string;

  @IsEmail()
  @IsNotEmpty({ message: 'Email is required' })
  email: string;
}
