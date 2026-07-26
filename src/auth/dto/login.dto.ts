import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: 'UID is required' })
  uid: string;

  @IsString()
  @IsNotEmpty({ message: 'Firebase ID token is required' })
  firebaseToken: string;
}
